import { expect, test, type APIRequestContext } from "@playwright/test";

async function ok<T>(
  response: Awaited<ReturnType<APIRequestContext["post"]>>,
): Promise<T> {
  expect(response.ok(), await response.text()).toBe(true);
  return response.json() as Promise<T>;
}

async function seedPublishedPlan(request: APIRequestContext, teamCount = 1) {
  const suffix = crypto.randomUUID().slice(0, 8);
  const date = new Date(
    Date.UTC(2120, 0, 1 + (Number.parseInt(suffix, 16) % 100_000)),
  )
    .toISOString()
    .slice(0, 10);
  const product = await ok<{ id: string }>(
    await request.post("/api/products", {
      data: { name: `Integrity Willow ${suffix}` },
    }),
  );
  const planned = await ok<{ id: string }>(
    await request.post("/api/lots", {
      data: {
        productId: product.id,
        code: `INT-P-${suffix}`,
        location: "North range",
        recordedQuantity: 20,
      },
    }),
  );
  const alternate = await ok<{ id: string }>(
    await request.post("/api/lots", {
      data: {
        productId: product.id,
        code: `INT-A-${suffix}`,
        location: "South range",
        recordedQuantity: 10,
      },
    }),
  );
  const plan = await ok<{ id: string }>(
    await request.post("/api/plans", {
      data: { serviceDate: date, teamCount, truckCount: 1 },
    }),
  );
  const detail = (await (
    await request.get(`/api/plans/${plan.id}`)
  ).json()) as { trucks: Array<{ id: string }> };
  const allocation = await ok<{ id: string }>(
    await request.post("/api/allocations", {
      data: {
        truckId: detail.trucks[0]!.id,
        lotId: planned.id,
        quantity: teamCount * 5,
      },
    }),
  );
  await ok(await request.post(`/api/plans/${plan.id}/publish`));
  const assignments = await Promise.all(
    Array.from({ length: teamCount }, async (_, index) => {
      const day = (await (
        await request.get(`/api/field/day?date=${date}&team=${index + 1}`)
      ).json()) as { assignments: Array<{ id: string }> };
      return day.assignments[0]!.id;
    }),
  );
  return {
    date,
    planned,
    alternate,
    allocation,
    truckId: detail.trucks[0]!.id,
    assignments,
  };
}

test("published work is immutable and pickup facts are bound to their claim", async ({
  request,
}) => {
  const fixture = await seedPublishedPlan(request);
  const assignmentId = fixture.assignments[0]!;

  const mutate = await request.post("/api/allocations", {
    data: {
      id: fixture.allocation.id,
      truckId: fixture.truckId,
      lotId: fixture.alternate.id,
      quantity: 2,
    },
  });
  expect(mutate.status()).toBe(409);
  expect(
    (
      await request.delete(`/api/allocations/${fixture.allocation.id}`)
    ).status(),
  ).toBe(409);

  const wrongPlannedLot = await request.post("/api/field/operations", {
    data: {
      operationId: crypto.randomUUID(),
      type: "planned_pickup",
      payload: {
        assignmentId,
        lotId: fixture.alternate.id,
        quantity: 1,
      },
    },
  });
  expect(wrongPlannedLot.status()).toBe(409);

  const wrongTeamClaim = await request.post("/api/field/operations", {
    data: {
      operationId: crypto.randomUUID(),
      type: "claim_alternative",
      payload: {
        claimId: crypto.randomUUID(),
        assignmentId,
        teamNumber: 2,
        lotId: fixture.alternate.id,
        quantity: 2,
      },
    },
  });
  expect(wrongTeamClaim.status()).toBe(409);

  const claimId = crypto.randomUUID();
  const claim = await ok<{ claimId: string }>(
    await request.post("/api/field/operations", {
      data: {
        operationId: crypto.randomUUID(),
        type: "claim_alternative",
        payload: {
          claimId,
          assignmentId,
          teamNumber: 1,
          lotId: fixture.alternate.id,
          quantity: 2,
        },
      },
    }),
  );
  expect(claim.claimId).toBe(claimId);
  const pickup = {
    operationId: crypto.randomUUID(),
    type: "alternative_pickup",
    payload: {
      claimId,
      assignmentId,
      lotId: fixture.alternate.id,
      quantity: 2,
    },
  };
  await ok(await request.post("/api/field/operations", { data: pickup }));
  const duplicate = await request.post("/api/field/operations", {
    data: { ...pickup, operationId: crypto.randomUUID() },
  });
  expect(duplicate.status()).toBe(409);
});

test("same-team repeat pickups do not abort cross-team overdraw fan-out", async ({
  request,
}) => {
  const fixture = await seedPublishedPlan(request, 2);
  await ok(
    await request.post("/api/corrections", {
      data: {
        commandId: crypto.randomUUID(),
        kind: "inventory_recount",
        details: { lotId: fixture.alternate.id, quantity: 2 },
      },
    }),
  );

  const pickupFromClaim = async (
    assignmentId: string,
    team: number,
    quantity: number,
  ) => {
    const claimId = crypto.randomUUID();
    await ok(
      await request.post("/api/field/operations", {
        data: {
          operationId: crypto.randomUUID(),
          type: "claim_alternative",
          payload: {
            claimId,
            assignmentId,
            teamNumber: team,
            lotId: fixture.alternate.id,
            quantity,
          },
        },
      }),
    );
    return request.post("/api/field/operations", {
      data: {
        operationId: crypto.randomUUID(),
        type: "alternative_pickup",
        payload: {
          claimId,
          assignmentId,
          lotId: fixture.alternate.id,
          quantity,
        },
      },
    });
  };

  expect((await pickupFromClaim(fixture.assignments[0]!, 1, 1)).ok()).toBe(
    true,
  );
  expect((await pickupFromClaim(fixture.assignments[0]!, 1, 1)).ok()).toBe(
    true,
  );
  expect((await pickupFromClaim(fixture.assignments[1]!, 2, 2)).ok()).toBe(
    true,
  );

  const team1 = (await (
    await request.get(`/api/field/day?date=${fixture.date}&team=1`)
  ).json()) as { exceptions: Array<{ type: string }> };
  const team2 = (await (
    await request.get(`/api/field/day?date=${fixture.date}&team=2`)
  ).json()) as { exceptions: Array<{ type: string }> };
  expect(team1.exceptions.some((item) => item.type === "overdraw")).toBe(true);
  expect(team2.exceptions.some((item) => item.type === "overdraw")).toBe(true);
});

test("negative correction remains visible and truck completion is deduplicated", async ({
  request,
}) => {
  const fixture = await seedPublishedPlan(request);
  const assignmentId = fixture.assignments[0]!;
  const pickup = await ok<{ pickupId: string }>(
    await request.post("/api/field/operations", {
      data: {
        operationId: crypto.randomUUID(),
        type: "planned_pickup",
        payload: {
          assignmentId,
          lotId: fixture.planned.id,
          quantity: 5,
        },
      },
    }),
  );
  await ok(
    await request.post("/api/corrections", {
      data: {
        commandId: crypto.randomUUID(),
        kind: "correct_pickup_quantity",
        details: { pickupId: pickup.pickupId, quantity: 25 },
      },
    }),
  );

  const claimId = crypto.randomUUID();
  await ok(
    await request.post("/api/field/operations", {
      data: {
        operationId: crypto.randomUUID(),
        type: "claim_alternative",
        payload: {
          claimId,
          assignmentId,
          teamNumber: 1,
          lotId: fixture.alternate.id,
          quantity: 1,
        },
      },
    }),
  );
  for (let index = 0; index < 2; index += 1)
    await ok(
      await request.post("/api/field/operations", {
        data: {
          operationId: crypto.randomUUID(),
          type: "complete_truck",
          payload: { truckId: fixture.truckId, teamNumber: 1 },
        },
      }),
    );

  const operations = (await (await request.get("/api/operations")).json()) as {
    exceptions: Array<{ type: string; subject_id: string; status: string }>;
  };
  expect(
    operations.exceptions.some(
      (item) => item.type === "overdraw" && item.status === "open",
    ),
  ).toBe(true);
  expect(
    operations.exceptions.filter(
      (item) => item.type === "abandoned_claim" && item.subject_id === claimId,
    ),
  ).toHaveLength(1);

  const missing = await request.post("/api/corrections", {
    data: {
      commandId: crypto.randomUUID(),
      kind: "correct_pickup_quantity",
      details: { pickupId: crypto.randomUUID(), quantity: 1 },
    },
  });
  expect(missing.status()).toBe(404);

  const precommitOperation = {
    operationId: crypto.randomUUID(),
    type: "planned_pickup",
    payload: {
      assignmentId,
      lotId: fixture.planned.id,
      quantity: 0,
    },
  };
  await ok(
    await request.post("/api/diagnostics/faults", {
      data: { mode: "fail-upload-before-commit" },
    }),
  );
  expect(
    (
      await request.post("/api/field/operations", {
        data: precommitOperation,
      })
    ).status(),
  ).toBe(503);
  const recovered = await ok<{ idempotent: boolean }>(
    await request.post("/api/field/operations", {
      data: precommitOperation,
    }),
  );
  expect(recovered.idempotent).toBe(false);
});
