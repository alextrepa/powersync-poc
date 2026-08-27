import { access, writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

const evidenceRoot = "/workspace/evidence";
const marker = (name: string) => `${evidenceRoot}/interruption-${name}`;
const waitForMarker = async (name: string) => {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      await access(marker(name));
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`Timed out waiting for ${name}`);
};

test("queued work survives simultaneous API and PowerSync interruption", async ({
  page,
  request,
  context,
}) => {
  test.skip(
    process.env.INTERRUPTION_ORCHESTRATED !== "true",
    "Run through just e2e-interruption",
  );
  test.setTimeout(120_000);
  const suffix = crypto.randomUUID().slice(0, 8);
  const date = new Date(
    Date.UTC(2160, 0, 1 + (Number.parseInt(suffix, 16) % 100_000)),
  )
    .toISOString()
    .slice(0, 10);
  const product = (await (
    await request.post("/api/products", {
      data: { name: `Interrupted Pine ${suffix}` },
    })
  ).json()) as { id: string };
  const lot = (await (
    await request.post("/api/lots", {
      data: {
        productId: product.id,
        code: `INTERRUPT-${suffix}`,
        location: "Remote range",
        recordedQuantity: 10,
      },
    })
  ).json()) as { id: string };
  const plan = (await (
    await request.post("/api/plans", {
      data: { serviceDate: date, teamCount: 1, truckCount: 1 },
    })
  ).json()) as { id: string };
  const detail = (await (
    await request.get(`/api/plans/${plan.id}`)
  ).json()) as { trucks: Array<{ id: string }> };
  await request.post("/api/allocations", {
    data: { truckId: detail.trucks[0]!.id, lotId: lot.id, quantity: 4 },
  });
  await request.post(`/api/plans/${plan.id}/publish`);

  await page.goto("/");
  await page.getByLabel("Team number").fill("1");
  await page.getByLabel("Route date").fill(date);
  await page.getByRole("button", { name: "Load my route" }).click();
  await expect(page.getByText("Ready offline")).toBeVisible({
    timeout: 20_000,
  });
  await context.setOffline(true);
  await page.getByRole("button", { name: "Record pickup" }).click();
  await page.getByRole("button", { name: "Save pickup" }).click();
  await expect(page.getByText("1 queued")).toBeVisible();
  await writeFile(marker("ready"), new Date().toISOString(), "utf8");

  await waitForMarker("services-stopped");
  await context.setOffline(false);
  await page.waitForTimeout(2_000);
  await expect(page.getByText("1 queued")).toBeVisible();
  await writeFile(
    marker("reconnect-observed"),
    new Date().toISOString(),
    "utf8",
  );

  await waitForMarker("services-restored");
  await expect(page.getByText("0 queued")).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(async () => {
      const operations = (await (
        await request.get("/api/operations")
      ).json()) as { pickups: Array<{ lot_id: string }> };
      return operations.pickups.filter((pickup) => pickup.lot_id === lot.id)
        .length;
    })
    .toBe(1);
  await writeFile(marker("browser-complete"), new Date().toISOString(), "utf8");
});
