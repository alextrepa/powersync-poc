import {
  chromium,
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

interface SeededRoute {
  date: string;
  productName: string;
  alternativeLotId: string;
  alternativeLotCode: string;
}

async function createRoute(request: APIRequestContext): Promise<SeededRoute> {
  const suffix = crypto.randomUUID().slice(0, 8);
  const dayOffset = Number.parseInt(suffix, 16) % 100_000;
  const date = new Date(Date.UTC(2040, 0, 1 + dayOffset))
    .toISOString()
    .slice(0, 10);
  const productName = `E2E Lilac ${suffix}`;

  const productResponse = await request.post("/api/products", {
    data: { name: productName },
  });
  expect(productResponse.ok()).toBe(true);
  const product = (await productResponse.json()) as { id: string };

  const plannedLotResponse = await request.post("/api/lots", {
    data: {
      productId: product.id,
      code: `E2E-A-${suffix}`,
      location: "North house · Row 3",
      recordedQuantity: 30,
    },
  });
  const alternativeLotResponse = await request.post("/api/lots", {
    data: {
      productId: product.id,
      code: `E2E-B-${suffix}`,
      location: "West house · Row 9",
      recordedQuantity: 20,
    },
  });
  expect(plannedLotResponse.ok()).toBe(true);
  expect(alternativeLotResponse.ok()).toBe(true);
  const plannedLot = (await plannedLotResponse.json()) as { id: string };
  const alternativeLot = (await alternativeLotResponse.json()) as {
    id: string;
  };

  const planResponse = await request.post("/api/plans", {
    data: { serviceDate: date, teamCount: 2, truckCount: 2 },
  });
  expect(planResponse.ok()).toBe(true);
  const plan = (await planResponse.json()) as { id: string };
  const detailResponse = await request.get(`/api/plans/${plan.id}`);
  const detail = (await detailResponse.json()) as {
    trucks: Array<{ id: string; truck_number: number }>;
  };
  const firstTruck = detail.trucks.find((truck) => truck.truck_number === 1);
  expect(firstTruck).toBeTruthy();

  const allocation = await request.post("/api/allocations", {
    data: { truckId: firstTruck!.id, lotId: plannedLot.id, quantity: 10 },
  });
  expect(allocation.ok()).toBe(true);
  const publication = await request.post(`/api/plans/${plan.id}/publish`);
  expect(publication.ok()).toBe(true);

  return {
    date,
    productName,
    alternativeLotId: alternativeLot.id,
    alternativeLotCode: `E2E-B-${suffix}`,
  };
}

async function openTeamRoute(page: Page, route: SeededRoute): Promise<void> {
  await page.goto("/");
  await page.getByLabel("Team number").fill("1");
  await page.getByLabel("Route date").fill(route.date);
  await page.getByRole("button", { name: "Load my route" }).click();
  await expect(
    page.getByRole("heading", { name: "Your pickup route" }),
  ).toBeVisible();
  await expect(page.getByText("Ready offline")).toBeVisible({
    timeout: 20_000,
  });
  await expect(
    page.getByRole("heading", { name: route.productName }).first(),
  ).toBeVisible();
}

test("containerized stack serves field, admin, and API", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /start your route/i }),
  ).toBeVisible();

  await page.goto("/admin/");
  await expect(
    page.getByRole("heading", { name: /good morning/i }),
  ).toBeVisible();

  const health = await request.get("/api/health");
  expect(health.ok()).toBe(true);
  await expect(health.json()).resolves.toMatchObject({ status: "ok" });
});

test("team route survives offline reload and uploads a pickup after reconnection", async ({
  page,
  request,
  context,
}) => {
  test.setTimeout(60_000);
  const route = await createRoute(request);
  await openTeamRoute(page, route);

  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Your pickup route" }),
  ).toBeVisible();
  await expect(page.getByText("Ready offline")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: route.productName }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Other lot" }).click();
  await page.getByRole("button", { name: "Claim lot" }).click();
  await expect(page.getByText("1 queued")).toBeVisible();
  await expect(page.getByText(/Claimed · Lot/)).toBeVisible();
  await page.getByRole("button", { name: "Picked" }).click();
  await expect(page.getByText("2 queued")).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByText("0 queued")).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(
      async () => {
        const operations = (await (
          await request.get("/api/operations")
        ).json()) as {
          pickups: Array<{ product_name: string }>;
          claims: Array<{ product_name: string }>;
        };
        return (
          operations.pickups.some(
            (pickup) =>
              pickup.product_name === route.productName &&
              (pickup as { source?: string }).source === "alternative",
          ) &&
          operations.claims.some(
            (claim) => claim.product_name === route.productName,
          )
        );
      },
      { timeout: 20_000 },
    )
    .toBe(true);
});

test("downloaded route survives a complete Chromium process restart offline", async ({
  request,
}) => {
  test.setTimeout(90_000);
  const route = await createRoute(request);
  const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:8787";
  const profile = await mkdtemp(join(tmpdir(), "canopy-profile-"));
  const online = await chromium.launchPersistentContext(profile, { baseURL });
  try {
    const page = await online.newPage();
    await openTeamRoute(page, route);
    await page.evaluate(async () => navigator.serviceWorker.ready);
    await page.reload();
    await expect(page.getByText("Ready offline")).toBeVisible();
    await online.setOffline(true);
    await page.getByRole("button", { name: "Record pickup" }).click();
    await page.getByRole("button", { name: "Save pickup" }).click();
    await expect(page.getByText("1 queued")).toBeVisible();
  } finally {
    await online.close();
  }

  const restarted = await chromium.launchPersistentContext(profile, {
    baseURL,
  });
  try {
    await restarted.setOffline(true);
    const page = await restarted.newPage();
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Your pickup route" }),
    ).toBeVisible();
    await expect(page.getByText("Ready offline")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: route.productName }),
    ).toBeVisible();
    await expect(
      page.getByText("No pickups were assigned to this team for this truck."),
    ).toBeVisible();
    await expect(page.getByText("1 queued")).toBeVisible();
    await restarted.setOffline(false);
    await expect(page.getByText("0 queued")).toBeVisible({ timeout: 20_000 });
  } finally {
    await restarted.close();
  }
});

test("alternative availability includes reservations from another plan", async ({
  page,
  request,
}) => {
  const route = await createRoute(request);
  const futurePlan = (await (
    await request.post("/api/plans", {
      data: { serviceDate: "2199-12-30", teamCount: 1, truckCount: 1 },
    })
  ).json()) as { id: string };
  const detail = (await (
    await request.get(`/api/plans/${futurePlan.id}`)
  ).json()) as { trucks: Array<{ id: string }> };
  const reservation = await request.post("/api/allocations", {
    data: {
      truckId: detail.trucks[0]!.id,
      lotId: route.alternativeLotId,
      quantity: 17,
    },
  });
  expect(reservation.ok(), await reservation.text()).toBe(true);

  await openTeamRoute(page, route);
  await page.getByRole("button", { name: "Other lot" }).click();
  const alternative = page
    .locator(".alternative")
    .filter({ hasText: route.alternativeLotCode });
  await expect(alternative.locator(".availability b")).toHaveText("3");
});

test("a lot flagged offline becomes unavailable elsewhere in the local route", async ({
  page,
  request,
  context,
}) => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const date = new Date(
    Date.UTC(2180, 0, 1 + (Number.parseInt(suffix, 16) % 100_000)),
  )
    .toISOString()
    .slice(0, 10);
  const product = (await (
    await request.post("/api/products", {
      data: { name: `Offline Flag Maple ${suffix}` },
    })
  ).json()) as { id: string };
  const lotCodes = [`FLAG-A-${suffix}`, `FLAG-B-${suffix}`];
  const lots = await Promise.all(
    lotCodes.map(async (code, index) => {
      const response = await request.post("/api/lots", {
        data: {
          productId: product.id,
          code,
          location: `Flag house ${index + 1}`,
          recordedQuantity: 10,
        },
      });
      expect(response.ok(), await response.text()).toBe(true);
      return (await response.json()) as { id: string };
    }),
  );
  const plan = (await (
    await request.post("/api/plans", {
      data: { serviceDate: date, teamCount: 1, truckCount: 1 },
    })
  ).json()) as { id: string };
  const detail = (await (
    await request.get(`/api/plans/${plan.id}`)
  ).json()) as { trucks: Array<{ id: string }> };
  for (const lot of lots) {
    const response = await request.post("/api/allocations", {
      data: { truckId: detail.trucks[0]!.id, lotId: lot.id, quantity: 5 },
    });
    expect(response.ok(), await response.text()).toBe(true);
  }
  expect((await request.post(`/api/plans/${plan.id}/publish`)).ok()).toBe(true);
  const route: SeededRoute = {
    date,
    productName: `Offline Flag Maple ${suffix}`,
    alternativeLotId: lots[1]!.id,
    alternativeLotCode: lotCodes[1]!,
  };
  await openTeamRoute(page, route);
  await context.setOffline(true);

  const flaggedAssignment = page
    .locator(".assignment")
    .filter({ hasText: lotCodes[1]! });
  await flaggedAssignment
    .getByRole("button", { name: "Record pickup" })
    .click();
  await page.getByLabel("Plants picked").fill("0");
  await page.getByText("Incorrect count", { exact: true }).click();
  await page.getByRole("button", { name: "Save pickup" }).click();
  await expect(page.getByText("2 queued")).toBeVisible();

  const otherAssignment = page
    .locator(".assignment")
    .filter({ hasText: lotCodes[0]! });
  await otherAssignment.getByRole("button", { name: "Other lot" }).click();
  const flaggedAlternative = page
    .locator(".alternative")
    .filter({ hasText: lotCodes[1]! });
  await expect(
    flaggedAlternative.getByRole("button", { name: "Unavailable" }),
  ).toBeDisabled();
});
