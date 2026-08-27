import { expect, test } from "@playwright/test";

test("dispatcher creates inventory, previews the deterministic split, and publishes a route", async ({
  page,
}) => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const date = new Date(
    Date.UTC(2080, 0, 1 + (Number.parseInt(suffix, 16) % 100_000)),
  )
    .toISOString()
    .slice(0, 10);
  const productName = `Admin Viburnum ${suffix}`;
  const renamedProductName = `${productName} Select`;
  const lotCode = `ADMIN-${suffix}`;

  await page.goto("/admin/");
  await page.getByRole("button", { name: "Inventory" }).click();
  await page.getByPlaceholder("Plant name").fill(productName);
  await page.getByRole("button", { name: "Add" }).click();
  await expect(
    page.locator(".simple-list b", { hasText: productName }),
  ).toBeVisible();

  const lotForm = page.locator(".lot-form");
  await lotForm.locator("select").selectOption({ label: productName });
  await lotForm.getByPlaceholder("Lot code").fill(lotCode);
  await lotForm.getByPlaceholder("Location").fill("Admin QA house · Row 8");
  await lotForm.locator('input[type="number"]').fill("24");
  await lotForm.getByRole("button", { name: "Create lot" }).click();
  await expect(page.getByText(new RegExp(`Lot ${lotCode}`))).toBeVisible();

  const productRow = page.locator(".simple-list > div", {
    hasText: productName,
  });
  page.once("dialog", (dialog) => void dialog.accept(renamedProductName));
  await productRow.getByRole("button", { name: "Rename" }).click();
  await expect(
    page.locator(".simple-list b", { hasText: renamedProductName }),
  ).toBeVisible();

  const lotCard = page.locator(".lot-list article", { hasText: lotCode });
  page.once("dialog", (dialog) => void dialog.accept("30"));
  await lotCard.getByRole("button", { name: "Recount" }).click();
  await expect(lotCard.locator(".stock b")).toHaveText("30");
  page.once("dialog", (dialog) => void dialog.accept("QA unavailable"));
  await lotCard.getByRole("button", { name: "Flag", exact: true }).click();
  await expect(lotCard.getByText("QA unavailable")).toBeVisible();
  await lotCard.getByRole("button", { name: "Clear" }).click();
  await expect(lotCard.getByText("QA unavailable")).not.toBeVisible();

  await page.getByRole("button", { name: "Route planning" }).click();
  const planForm = page.locator(".stack-form");
  await planForm.getByLabel("Date").fill(date);
  await planForm.getByLabel("Teams").fill("2");
  await planForm.getByLabel("Trucks").fill("2");
  await planForm.getByRole("button", { name: "Create draft" }).click();

  const displayDate = new Date(`${date}T00:00:00Z`).toLocaleDateString(
    "en-US",
    { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" },
  );
  const planButton = page
    .locator(".plan-buttons button")
    .filter({ hasText: displayDate });
  await expect(planButton).toBeVisible();
  await planButton.click();

  const allocationForm = page.locator(".allocation-form");
  await allocationForm
    .locator("select")
    .nth(0)
    .selectOption({ label: "Truck 1" });
  await allocationForm
    .locator("select")
    .nth(1)
    .selectOption({ label: `${renamedProductName} · ${lotCode} (30 free)` });
  await allocationForm.locator('input[type="number"]').fill("9");
  await allocationForm.getByRole("button", { name: "Allocate" }).click();
  await expect(page.getByText(`Lot ${lotCode}`, { exact: true })).toBeVisible();

  const allocationRow = page.locator(".truck-groups article > div", {
    hasText: lotCode,
  });
  await allocationRow.getByRole("button", { name: "Edit" }).click();
  await allocationForm
    .locator("select")
    .nth(0)
    .selectOption({ label: "Truck 2" });
  await allocationForm.locator('input[type="number"]').fill("8");
  await allocationForm.getByRole("button", { name: "Save allocation" }).click();
  await expect(
    page
      .locator(".truck-groups article", { hasText: "Truck 2" })
      .getByText(`Lot ${lotCode}`, { exact: true }),
  ).toBeVisible();
  await page
    .locator(".truck-groups article > div", { hasText: lotCode })
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(
    page.getByText(`Lot ${lotCode}`, { exact: true }),
  ).not.toBeVisible();

  await allocationForm
    .locator("select")
    .nth(0)
    .selectOption({ label: "Truck 1" });
  await allocationForm
    .locator("select")
    .nth(1)
    .selectOption({ label: `${renamedProductName} · ${lotCode} (30 free)` });
  await allocationForm.locator('input[type="number"]').fill("9");
  await allocationForm.getByRole("button", { name: "Allocate" }).click();

  await page.getByRole("button", { name: "Preview split" }).click();
  const preview = page.getByLabel("Team split preview");
  await expect(preview.getByText("Team 1")).toBeVisible();
  await expect(preview.getByText("Team 2")).toBeVisible();
  await expect(preview.getByText("5", { exact: true })).toBeVisible();
  await expect(preview.getByText("4", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Publish route" }).click();
  await expect(page.getByText("PUBLISHED PLAN")).toBeVisible();
});

test("admin reconciles a lost correction response without applying it twice", async ({
  page,
  request,
}) => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const date = new Date(
    Date.UTC(2170, 0, 1 + (Number.parseInt(suffix, 16) % 100_000)),
  )
    .toISOString()
    .slice(0, 10);
  const productName = `Retry Birch ${suffix}`;
  const productResponse = await request.post("/api/products", {
    data: { name: productName },
  });
  const product = (await productResponse.json()) as { id: string };
  const lotResponse = await request.post("/api/lots", {
    data: {
      productId: product.id,
      code: `RETRY-${suffix}`,
      location: "Return bay",
      recordedQuantity: 10,
    },
  });
  const lot = (await lotResponse.json()) as { id: string };
  const planResponse = await request.post("/api/plans", {
    data: { serviceDate: date, teamCount: 1, truckCount: 1 },
  });
  const plan = (await planResponse.json()) as { id: string };
  const detail = (await (
    await request.get(`/api/plans/${plan.id}`)
  ).json()) as { trucks: Array<{ id: string }> };
  await request.post("/api/allocations", {
    data: { truckId: detail.trucks[0]!.id, lotId: lot.id, quantity: 2 },
  });
  await request.post(`/api/plans/${plan.id}/publish`);
  const day = (await (
    await request.get(`/api/field/day?date=${date}&team=1`)
  ).json()) as { assignments: Array<{ id: string }> };
  await request.post("/api/field/operations", {
    data: {
      operationId: crypto.randomUUID(),
      type: "planned_pickup",
      payload: {
        assignmentId: day.assignments[0]!.id,
        lotId: lot.id,
        quantity: 2,
      },
    },
  });
  await request.post("/api/diagnostics/faults", {
    data: { mode: "lost-correction-response" },
  });

  await page.goto("/admin/");
  await page.getByRole("button", { name: "Field activity" }).click();
  const pickup = page.locator(".data-table > div").filter({
    hasText: productName,
  });
  page.once("dialog", (dialog) => void dialog.accept("1"));
  await pickup.getByRole("button", { name: "Return" }).click();

  await expect
    .poll(async () => {
      const result = (await (await request.get("/api/operations")).json()) as {
        corrections: Array<{ kind: string; details: string }>;
      };
      return result.corrections.filter(
        (item) =>
          item.kind === "return_to_lot" &&
          (JSON.parse(item.details) as { lotId?: string }).lotId === lot.id,
      ).length;
    })
    .toBe(1);
  const lots = (await (await request.get("/api/lots")).json()) as Array<{
    id: string;
    recorded_quantity: number;
  }>;
  expect(lots.find((item) => item.id === lot.id)?.recorded_quantity).toBe(9);
  await expect
    .poll(() =>
      page.evaluate(() =>
        localStorage.getItem("canopy-admin-pending-correction-v1"),
      ),
    )
    .toBeNull();
});
