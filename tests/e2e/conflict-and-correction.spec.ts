import { expect, test, type APIRequestContext } from "@playwright/test";

async function json<T>(
  response: Awaited<ReturnType<APIRequestContext["get"]>>,
): Promise<T> {
  expect(response.ok(), await response.text()).toBe(true);
  return response.json() as Promise<T>;
}

test("offline reroute conflicts stay visible to both teams and corrections are append-only", async ({
  request,
}) => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const offset = Number.parseInt(suffix, 16) % 100_000;
  const date = new Date(Date.UTC(2050, 0, 1 + offset))
    .toISOString()
    .slice(0, 10);

  const product = await json<{ id: string }>(
    await request.post("/api/products", {
      data: { name: `Conflict Lilac ${suffix}` },
    }),
  );
  const plannedLot = await json<{ id: string }>(
    await request.post("/api/lots", {
      data: {
        productId: product.id,
        code: `CON-P-${suffix}`,
        location: "House 1",
        recordedQuantity: 20,
      },
    }),
  );
  const alternateLot = await json<{ id: string }>(
    await request.post("/api/lots", {
      data: {
        productId: product.id,
        code: `CON-A-${suffix}`,
        location: "House 2",
        recordedQuantity: 6,
      },
    }),
  );
  const plan = await json<{ id: string }>(
    await request.post("/api/plans", {
      data: { serviceDate: date, teamCount: 2, truckCount: 1 },
    }),
  );
  const detail = await json<{ trucks: Array<{ id: string }> }>(
    await request.get(`/api/plans/${plan.id}`),
  );
  const allocation = await json<{ id: string }>(
    await request.post("/api/allocations", {
      data: {
        truckId: detail.trucks[0]!.id,
        lotId: plannedLot.id,
        quantity: 10,
      },
    }),
  );
  await json(await request.post(`/api/plans/${plan.id}/publish`));

  const team1 = await json<{ assignments: Array<{ id: string }> }>(
    await request.get(`/api/field/day?date=${date}&team=1`),
  );
  const team2 = await json<{ assignments: Array<{ id: string }> }>(
    await request.get(`/api/field/day?date=${date}&team=2`),
  );
  const firstAssignment = team1.assignments[0]!.id;
  const secondAssignment = team2.assignments[0]!.id;

  const claim1 = await json<{ claimId: string }>(
    await request.post("/api/field/operations", {
      data: {
        operationId: crypto.randomUUID(),
        type: "claim_alternative",
        payload: {
          claimId: crypto.randomUUID(),
          assignmentId: firstAssignment,
          lotId: alternateLot.id,
          teamNumber: 1,
          quantity: 5,
        },
      },
    }),
  );
  const claim2 = await json<{ claimId: string }>(
    await request.post("/api/field/operations", {
      data: {
        operationId: crypto.randomUUID(),
        type: "claim_alternative",
        payload: {
          claimId: crypto.randomUUID(),
          assignmentId: secondAssignment,
          lotId: alternateLot.id,
          teamNumber: 2,
          quantity: 5,
        },
      },
    }),
  );

  const firstPickupOperation = crypto.randomUUID();
  const pickupCommand = {
    operationId: firstPickupOperation,
    type: "alternative_pickup",
    payload: {
      assignmentId: firstAssignment,
      lotId: alternateLot.id,
      claimId: claim1.claimId,
      quantity: 5,
      recordedAtClient: new Date().toISOString(),
    },
  };
  await json(
    await request.post("/api/diagnostics/faults", {
      data: { mode: "lost-upload-response" },
    }),
  );
  const lostPickupResponse = await request.post("/api/field/operations", {
    data: pickupCommand,
  });
  expect(lostPickupResponse.status()).toBe(503);
  const firstPickup = await json<{ pickupId: string; idempotent: boolean }>(
    await request.post("/api/field/operations", { data: pickupCommand }),
  );
  expect(firstPickup.idempotent).toBe(true);
  const replay = await json<{ pickupId: string; idempotent: boolean }>(
    await request.post("/api/field/operations", { data: pickupCommand }),
  );
  expect(replay).toMatchObject({
    pickupId: firstPickup.pickupId,
    idempotent: true,
  });

  const changedReplay = await request.post("/api/field/operations", {
    data: {
      ...pickupCommand,
      payload: { ...pickupCommand.payload, quantity: 4 },
    },
  });
  expect(changedReplay.status()).toBe(409);
  await json(
    await request.post("/api/field/operations", {
      data: {
        operationId: crypto.randomUUID(),
        type: "alternative_pickup",
        payload: {
          assignmentId: secondAssignment,
          lotId: alternateLot.id,
          claimId: claim2.claimId,
          quantity: 5,
          recordedAtClient: new Date().toISOString(),
        },
      },
    }),
  );

  const operations = await json<{
    pickups: Array<{ lot_id: string }>;
    exceptions: Array<{
      id: string;
      type: string;
      subject_id: string;
      status: string;
    }>;
  }>(await request.get("/api/operations"));
  expect(
    operations.pickups.filter((pickup) => pickup.lot_id === alternateLot.id),
  ).toHaveLength(2);
  const overdraw = operations.exceptions.find(
    (item) => item.type === "overdraw" && item.subject_id === alternateLot.id,
  );
  expect(overdraw).toBeTruthy();

  const affectedTeam1 = await json<{ exceptions: Array<{ id: string }> }>(
    await request.get(`/api/field/day?date=${date}&team=1`),
  );
  const affectedTeam2 = await json<{ exceptions: Array<{ id: string }> }>(
    await request.get(`/api/field/day?date=${date}&team=2`),
  );
  expect(
    affectedTeam1.exceptions.some((item) => item.id === overdraw!.id),
  ).toBe(true);
  expect(
    affectedTeam2.exceptions.some((item) => item.id === overdraw!.id),
  ).toBe(true);

  const correctionId = crypto.randomUUID();
  const correction = {
    commandId: correctionId,
    exceptionId: overdraw!.id,
    kind: "inventory_recount",
    details: {
      lotId: alternateLot.id,
      quantity: 0,
      note: "Physical count after both teams returned",
    },
  };
  await json(
    await request.post("/api/diagnostics/faults", {
      data: { mode: "lost-correction-response" },
    }),
  );
  const lostCorrectionResponse = await request.post("/api/corrections", {
    data: correction,
  });
  expect(lostCorrectionResponse.status()).toBe(503);
  const corrected = await json<{ id: string; idempotent: boolean }>(
    await request.post("/api/corrections", { data: correction }),
  );
  expect(corrected.idempotent).toBe(true);
  const correctedReplay = await json<{ id: string; idempotent: boolean }>(
    await request.post("/api/corrections", { data: correction }),
  );
  expect(correctedReplay).toMatchObject({ id: corrected.id, idempotent: true });

  const finalOps = await json<{
    exceptions: Array<{ id: string; status: string }>;
    corrections: Array<{ command_id: string }>;
  }>(await request.get("/api/operations"));
  expect(
    finalOps.exceptions.find((item) => item.id === overdraw!.id)?.status,
  ).toBe("resolved");
  expect(
    finalOps.corrections.filter((item) => item.command_id === correctionId),
  ).toHaveLength(1);
  expect(allocation.id).toMatch(/[0-9a-f-]{36}/);
});

test("short pickup keeps the physical fact and can flag or spare its lot", async ({
  request,
}) => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const date = new Date(
    Date.UTC(2060, 0, 1 + (Number.parseInt(suffix, 16) % 100_000)),
  )
    .toISOString()
    .slice(0, 10);
  const product = await json<{ id: string }>(
    await request.post("/api/products", {
      data: { name: `Shortage Hydrangea ${suffix}` },
    }),
  );
  const lot = await json<{ id: string }>(
    await request.post("/api/lots", {
      data: {
        productId: product.id,
        code: `SHORT-${suffix}`,
        location: "South house",
        recordedQuantity: 10,
      },
    }),
  );
  const plan = await json<{ id: string }>(
    await request.post("/api/plans", {
      data: { serviceDate: date, teamCount: 1, truckCount: 1 },
    }),
  );
  const detail = await json<{ trucks: Array<{ id: string }> }>(
    await request.get(`/api/plans/${plan.id}`),
  );
  await json(
    await request.post("/api/allocations", {
      data: { truckId: detail.trucks[0]!.id, lotId: lot.id, quantity: 5 },
    }),
  );
  await json(await request.post(`/api/plans/${plan.id}/publish`));
  const day = await json<{ assignments: Array<{ id: string }> }>(
    await request.get(`/api/field/day?date=${date}&team=1`),
  );

  const upload = await json<{ results: Array<{ pickupId?: string }> }>(
    await request.post("/api/field/upload", {
      data: {
        operations: [
          {
            operationId: crypto.randomUUID(),
            type: "planned_pickup",
            payload: {
              assignmentId: day.assignments[0]!.id,
              lotId: lot.id,
              quantity: 3,
              recordedAtClient: new Date().toISOString(),
            },
          },
          {
            operationId: crypto.randomUUID(),
            type: "shortage",
            payload: {
              assignmentId: day.assignments[0]!.id,
              lotId: lot.id,
              teamNumber: 1,
              expectedQuantity: 5,
              pickedQuantity: 3,
              reason: "no_lot_problem",
              flagRequested: false,
            },
          },
        ],
      },
    }),
  );
  const lots = await json<
    Array<{ id: string; recorded_quantity: number; active_flag_id?: string }>
  >(await request.get("/api/lots"));
  const updated = lots.find((item) => item.id === lot.id);
  expect(updated).toMatchObject({ recorded_quantity: 7 });
  expect(updated?.active_flag_id).toBeFalsy();

  await json(
    await request.post("/api/corrections", {
      data: {
        commandId: crypto.randomUUID(),
        kind: "correct_pickup_quantity",
        details: {
          pickupId: upload.results[0]!.pickupId,
          quantity: 2,
          note: "Count corrected at loading bay",
        },
      },
    }),
  );
  let correctedDay = await json<{
    assignments: Array<{ planned_picked_quantity: number }>;
  }>(await request.get(`/api/field/day?date=${date}&team=1`));
  let correctedPlan = await json<{
    trucks: Array<{ allocation_id?: string; reserved_remaining?: number }>;
  }>(await request.get(`/api/plans/${plan.id}`));
  expect(correctedDay.assignments[0]!.planned_picked_quantity).toBe(2);
  expect(
    correctedPlan.trucks.find((truck) => truck.allocation_id)
      ?.reserved_remaining,
  ).toBe(3);

  await json(
    await request.post("/api/corrections", {
      data: {
        commandId: crypto.randomUUID(),
        kind: "release_reserved_remainder",
        details: {
          allocationId: correctedPlan.trucks.find(
            (truck) => truck.allocation_id,
          )!.allocation_id,
          quantity: 2,
          note: "Truck left the bay",
        },
      },
    }),
  );
  correctedDay = await json<{
    assignments: Array<{ planned_picked_quantity: number }>;
  }>(await request.get(`/api/field/day?date=${date}&team=1`));
  correctedPlan = await json<{
    trucks: Array<{ allocation_id?: string; reserved_remaining?: number }>;
  }>(await request.get(`/api/plans/${plan.id}`));
  expect(correctedDay.assignments[0]!.planned_picked_quantity).toBe(2);
  expect(
    correctedPlan.trucks.find((truck) => truck.allocation_id)
      ?.reserved_remaining,
  ).toBe(1);
});

test("over-pick, flagged-source, and abandoned-claim facts become office exceptions", async ({
  request,
}) => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const date = new Date(
    Date.UTC(2090, 0, 1 + (Number.parseInt(suffix, 16) % 100_000)),
  )
    .toISOString()
    .slice(0, 10);
  const product = await json<{ id: string }>(
    await request.post("/api/products", {
      data: { name: `Exception Cedar ${suffix}` },
    }),
  );
  const planned = await json<{ id: string }>(
    await request.post("/api/lots", {
      data: {
        productId: product.id,
        code: `EX-P-${suffix}`,
        location: "East house",
        recordedQuantity: 20,
      },
    }),
  );
  const alternate = await json<{ id: string }>(
    await request.post("/api/lots", {
      data: {
        productId: product.id,
        code: `EX-A-${suffix}`,
        location: "West house",
        recordedQuantity: 20,
      },
    }),
  );
  const plan = await json<{ id: string }>(
    await request.post("/api/plans", {
      data: { serviceDate: date, teamCount: 1, truckCount: 1 },
    }),
  );
  const detail = await json<{ trucks: Array<{ id: string }> }>(
    await request.get(`/api/plans/${plan.id}`),
  );
  await json(
    await request.post("/api/allocations", {
      data: { truckId: detail.trucks[0]!.id, lotId: planned.id, quantity: 5 },
    }),
  );
  await json(await request.post(`/api/plans/${plan.id}/publish`));
  const day = await json<{ assignments: Array<{ id: string }> }>(
    await request.get(`/api/field/day?date=${date}&team=1`),
  );
  const assignmentId = day.assignments[0]!.id;

  await json(
    await request.post("/api/field/operations", {
      data: {
        operationId: crypto.randomUUID(),
        type: "flag_lot",
        payload: {
          lotId: planned.id,
          teamNumber: 1,
          reason: "Dead plants found after publication",
        },
      },
    }),
  );
  await json(
    await request.post("/api/field/operations", {
      data: {
        operationId: crypto.randomUUID(),
        type: "planned_pickup",
        payload: {
          assignmentId,
          lotId: planned.id,
          quantity: 6,
          recordedAtClient: new Date().toISOString(),
        },
      },
    }),
  );
  await json(
    await request.post("/api/field/operations", {
      data: {
        operationId: crypto.randomUUID(),
        type: "claim_alternative",
        payload: {
          claimId: crypto.randomUUID(),
          assignmentId,
          lotId: alternate.id,
          teamNumber: 1,
          quantity: 2,
        },
      },
    }),
  );
  await json(
    await request.post("/api/field/operations", {
      data: {
        operationId: crypto.randomUUID(),
        type: "complete_truck",
        payload: { truckId: detail.trucks[0]!.id, teamNumber: 1 },
      },
    }),
  );

  const result = await json<{
    exceptions: Array<{ type: string; subject_id: string }>;
  }>(await request.get("/api/operations"));
  expect(result.exceptions.some((item) => item.type === "over_pick")).toBe(
    true,
  );
  expect(result.exceptions.some((item) => item.type === "flagged_source")).toBe(
    true,
  );
  expect(
    result.exceptions.some((item) => item.type === "abandoned_claim"),
  ).toBe(true);
});
