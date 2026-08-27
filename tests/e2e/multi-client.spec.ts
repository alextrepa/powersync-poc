import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from "@playwright/test";

async function ok<T>(
  response: Awaited<ReturnType<APIRequestContext["post"]>>,
): Promise<T> {
  expect(response.ok(), await response.text()).toBe(true);
  return response.json() as Promise<T>;
}

async function seed(request: APIRequestContext, era: number) {
  const suffix = crypto.randomUUID().slice(0, 8);
  const date = new Date(
    Date.UTC(era, 0, 1 + (Number.parseInt(suffix, 16) % 100_000)),
  )
    .toISOString()
    .slice(0, 10);
  const product = await ok<{ id: string }>(
    await request.post("/api/products", {
      data: { name: `Two-team Rose ${suffix}` },
    }),
  );
  const planned = await ok<{ id: string }>(
    await request.post("/api/lots", {
      data: {
        productId: product.id,
        code: `TWO-P-${suffix}`,
        location: "House A",
        recordedQuantity: 20,
      },
    }),
  );
  const alternative = await ok<{ id: string }>(
    await request.post("/api/lots", {
      data: {
        productId: product.id,
        code: `TWO-A-${suffix}`,
        location: "House B",
        recordedQuantity: 6,
      },
    }),
  );
  const plan = await ok<{ id: string }>(
    await request.post("/api/plans", {
      data: { serviceDate: date, teamCount: 2, truckCount: 1 },
    }),
  );
  const detailResponse = await request.get(`/api/plans/${plan.id}`);
  const detail = (await detailResponse.json()) as {
    trucks: Array<{ id: string }>;
  };
  await ok(
    await request.post("/api/allocations", {
      data: { truckId: detail.trucks[0]!.id, lotId: planned.id, quantity: 10 },
    }),
  );
  await ok(await request.post(`/api/plans/${plan.id}/publish`));
  return {
    date,
    productName: `Two-team Rose ${suffix}`,
    alternativeLotId: alternative.id,
  };
}

async function enter(
  page: Page,
  date: string,
  team: number,
  productName: string,
) {
  await page.goto("/");
  await page.getByLabel("Team number").fill(String(team));
  await page.getByLabel("Route date").fill(date);
  await page.getByRole("button", { name: "Load my route" }).click();
  await expect(page.getByText("Ready offline")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole("heading", { name: productName })).toBeVisible();
}

async function queueClaim(page: Page, context: BrowserContext) {
  await context.setOffline(true);
  await page.getByRole("button", { name: "Other lot" }).click();
  await page.getByRole("button", { name: "Claim lot" }).click();
  await expect(page.getByText("1 queued")).toBeVisible();
  await page.locator(".dialog-close").click();
  await context.setOffline(false);
  await expect(page.getByText("0 queued")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Other lot" }).click();
  await expect(page.getByText(/Claimed · Lot/)).toBeVisible({
    timeout: 20_000,
  });
  await page.locator(".dialog-close").click();
}

for (const reconnectOrder of [
  [1, 2],
  [2, 1],
] as const) {
  test(`two isolated phones preserve both pickups when team ${reconnectOrder[0]} reconnects first`, async ({
    browser,
    request,
  }) => {
    test.setTimeout(90_000);
    const fixture = await seed(request, reconnectOrder[0] === 1 ? 2100 : 2110);
    const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:8787";
    const contexts = await Promise.all([
      browser.newContext({ baseURL }),
      browser.newContext({ baseURL }),
    ]);
    const pages = await Promise.all(
      contexts.map((context) => context.newPage()),
    );
    try {
      await Promise.all([
        enter(pages[0], fixture.date, 1, fixture.productName),
        enter(pages[1], fixture.date, 2, fixture.productName),
      ]);
      await Promise.all([
        queueClaim(pages[0], contexts[0]),
        queueClaim(pages[1], contexts[1]),
      ]);

      await Promise.all(contexts.map((context) => context.setOffline(true)));
      for (const page of pages) {
        await page.getByRole("button", { name: "Other lot" }).click();
        await page.getByRole("button", { name: "Picked" }).click();
        await expect(page.getByText("1 queued")).toBeVisible();
        await page.locator(".dialog-close").click();
      }

      for (const team of reconnectOrder) {
        await contexts[team - 1].setOffline(false);
        await expect(pages[team - 1].getByText("0 queued")).toBeVisible({
          timeout: 20_000,
        });
      }

      await Promise.all(
        pages.map((page) =>
          expect(page.getByText("Office review needed")).toBeVisible({
            timeout: 20_000,
          }),
        ),
      );
      await expect
        .poll(async () => {
          const result = (await (
            await request.get("/api/operations")
          ).json()) as { pickups: Array<{ lot_id: string }> };
          return result.pickups.filter(
            (pickup) => pickup.lot_id === fixture.alternativeLotId,
          ).length;
        })
        .toBe(2);
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
    }
  });
}
