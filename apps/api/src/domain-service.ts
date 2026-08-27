import { createHash, randomUUID } from "node:crypto";
import type { Transaction } from "mssql";
import { consumedPlannedReservation, splitQuantity } from "@plant-route/domain";
import { request, sql, withTransaction } from "./database.js";

export class BusinessError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 409,
  ) {
    super(message);
  }
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function hash(value: unknown): string {
  return createHash("sha256").update(stable(value)).digest("hex");
}

export async function createException(
  tx: Transaction,
  input: {
    type: string;
    subjectType: string;
    subjectId: string;
    details: unknown;
    assignmentId: string;
    pickupId?: string;
    participantLotId?: string;
  },
): Promise<string> {
  const id = randomUUID();
  await request(tx)
    .input("id", sql.VarChar(36), id)
    .input("type", sql.VarChar(32), input.type)
    .input("subjectType", sql.VarChar(32), input.subjectType)
    .input("subjectId", sql.VarChar(36), input.subjectId)
    .input("details", sql.NVarChar(sql.MAX), JSON.stringify(input.details))
    .query(
      "INSERT dbo.exceptions (id,type,subject_type,subject_id,details) VALUES (@id,@type,@subjectType,@subjectId,@details)",
    );
  await request(tx)
    .input("id", sql.VarChar(36), id)
    .input("assignmentId", sql.VarChar(36), input.assignmentId)
    .input("pickupId", sql.VarChar(36), input.pickupId ?? null)
    .query(`INSERT dbo.exception_participants (exception_id,plan_id,team_number,pickup_id)
      SELECT @id,t.daily_plan_id,ta.team_number,@pickupId FROM dbo.team_assignments ta
      JOIN dbo.allocations a ON a.id=ta.allocation_id JOIN dbo.trucks t ON t.id=a.truck_id WHERE ta.id=@assignmentId`);
  if (input.participantLotId) {
    await request(tx)
      .input("id", sql.VarChar(36), id)
      .input("lotId", sql.VarChar(36), input.participantLotId)
      .input("assignmentId", sql.VarChar(36), input.assignmentId)
      .query(`;WITH current_scope AS (
          SELECT dp.service_date FROM dbo.team_assignments current_ta
          JOIN dbo.allocations current_a ON current_a.id=current_ta.allocation_id
          JOIN dbo.trucks current_t ON current_t.id=current_a.truck_id
          JOIN dbo.daily_plans dp ON dp.id=current_t.daily_plan_id
          WHERE current_ta.id=@assignmentId
        ), cohort AS (
          SELECT t.daily_plan_id,p.team_number,MIN(p.id) pickup_id
          FROM dbo.pickup_effects pe
          JOIN dbo.pickups p ON p.id=pe.pickup_id
          JOIN dbo.team_assignments ta ON ta.id=p.assignment_id
          JOIN dbo.allocations a ON a.id=ta.allocation_id
          JOIN dbo.trucks t ON t.id=a.truck_id
          JOIN dbo.daily_plans dp ON dp.id=t.daily_plan_id
          CROSS JOIN current_scope current_day
          WHERE pe.effective_lot_id=@lotId AND dp.service_date=current_day.service_date
          GROUP BY t.daily_plan_id,p.team_number
        )
        INSERT dbo.exception_participants (exception_id,plan_id,team_number,pickup_id)
        SELECT @id,c.daily_plan_id,c.team_number,c.pickup_id FROM cohort c
        WHERE NOT EXISTS (SELECT 1 FROM dbo.exception_participants ep
          WHERE ep.exception_id=@id AND ep.plan_id=c.daily_plan_id AND ep.team_number=c.team_number)`);
  }
  return id;
}

export async function publishPlan(planId: string) {
  return withTransaction(async (tx) => {
    const planResult = await request(tx)
      .input("id", sql.VarChar(36), planId)
      .query<{ status: string; team_count: number }>(
        "SELECT status,team_count FROM dbo.daily_plans WITH (UPDLOCK,HOLDLOCK) WHERE id=@id",
      );
    const plan = planResult.recordset[0];
    if (!plan) throw new BusinessError("plan_not_found", "Plan not found", 404);
    if (plan.status === "published")
      return { planId, status: "published", idempotent: true };
    const flagged = await request(tx).input("id", sql.VarChar(36), planId)
      .query<{ code: string }>(`SELECT TOP 1 l.code FROM dbo.allocations a
      JOIN dbo.trucks t ON t.id=a.truck_id JOIN dbo.lots l ON l.id=a.lot_id
      JOIN dbo.lot_flags f ON f.lot_id=l.id AND f.status='active' WHERE t.daily_plan_id=@id AND a.status='active'`);
    if (flagged.recordset[0])
      throw new BusinessError(
        "flagged_lot",
        `Lot ${String(flagged.recordset[0].code)} is flagged`,
      );
    const allocations = await request(tx).input("id", sql.VarChar(36), planId)
      .query<{
      id: string;
      quantity: number;
    }>(`SELECT a.id,a.quantity FROM dbo.allocations a JOIN dbo.trucks t ON t.id=a.truck_id
        WHERE t.daily_plan_id=@id AND a.status='active' ORDER BY t.truck_number,a.id`);
    if (allocations.recordset.length === 0)
      throw new BusinessError(
        "empty_plan",
        "Add at least one allocation before publishing",
      );
    for (const allocation of allocations.recordset) {
      for (const share of splitQuantity(allocation.quantity, plan.team_count)) {
        await request(tx)
          .input("id", sql.VarChar(36), randomUUID())
          .input("allocationId", sql.VarChar(36), allocation.id)
          .input("teamNumber", sql.Int, share.teamNumber)
          .input("quantity", sql.Int, share.quantity)
          .query(
            "INSERT dbo.team_assignments (id,allocation_id,team_number,quantity) VALUES (@id,@allocationId,@teamNumber,@quantity)",
          );
      }
    }
    await request(tx)
      .input("id", sql.VarChar(36), planId)
      .query(
        "UPDATE dbo.daily_plans SET status='published',published_at=SYSUTCDATETIME(),updated_at=SYSUTCDATETIME() WHERE id=@id",
      );
    return { planId, status: "published", idempotent: false };
  });
}

export async function reserveAllocation(input: {
  id?: string | undefined;
  truckId: string;
  lotId: string;
  quantity: number;
}) {
  return withTransaction(async (tx) => {
    const truckLookup = await request(tx)
      .input("truckId", sql.VarChar(36), input.truckId)
      .query<{ daily_plan_id: string }>(
        "SELECT daily_plan_id FROM dbo.trucks WHERE id=@truckId",
      );
    const planId = truckLookup.recordset[0]?.daily_plan_id;
    if (!planId)
      throw new BusinessError("truck_not_found", "Truck not found", 404);
    const ownerResult = await request(tx)
      .input("planId", sql.VarChar(36), planId)
      .query<{ status: string }>(
        "SELECT status FROM dbo.daily_plans WITH (UPDLOCK,HOLDLOCK) WHERE id=@planId",
      );
    if (ownerResult.recordset[0]?.status !== "draft")
      throw new BusinessError(
        "published_plan_immutable",
        "Published plans cannot be changed",
      );
    const lockedTruck = await request(tx)
      .input("truckId", sql.VarChar(36), input.truckId)
      .input("planId", sql.VarChar(36), planId).query<{
      id: string;
    }>(`SELECT id FROM dbo.trucks WITH (UPDLOCK,HOLDLOCK)
        WHERE id=@truckId AND daily_plan_id=@planId`);
    if (!lockedTruck.recordset[0])
      throw new BusinessError("truck_not_found", "Truck not found", 404);
    if (input.id) {
      const existing = await request(tx).input("id", sql.VarChar(36), input.id)
        .query<{ plan_id: string }>(`SELECT t.daily_plan_id plan_id
          FROM dbo.allocations a WITH (UPDLOCK,HOLDLOCK)
          JOIN dbo.trucks t ON t.id=a.truck_id WHERE a.id=@id`);
      if (!existing.recordset[0])
        throw new BusinessError(
          "allocation_not_found",
          "Allocation not found",
          404,
        );
      if (existing.recordset[0].plan_id !== planId)
        throw new BusinessError(
          "allocation_owner_mismatch",
          "An allocation cannot be moved to another plan",
        );
    }
    const lotResult = await request(tx)
      .input("lotId", sql.VarChar(36), input.lotId)
      .query<{ recorded_quantity: number }>(
        "SELECT recorded_quantity FROM dbo.lots WITH (UPDLOCK,HOLDLOCK) WHERE id=@lotId",
      );
    const lot = lotResult.recordset[0];
    if (!lot) throw new BusinessError("lot_not_found", "Lot not found", 404);
    const state = await request(tx)
      .input("lotId", sql.VarChar(36), input.lotId)
      .input("id", sql.VarChar(36), input.id ?? "").query<{
      reserved: number;
      claimed: number;
    }>(`SELECT
        COALESCE((SELECT SUM(reserved_remaining) FROM dbo.allocations WHERE lot_id=@lotId AND status='active' AND id<>@id),0) reserved,
        COALESCE((SELECT SUM(quantity) FROM dbo.alternative_claims WHERE lot_id=@lotId AND state='active'),0) claimed`);
    const available =
      lot.recorded_quantity -
      (state.recordset[0]?.reserved ?? 0) -
      (state.recordset[0]?.claimed ?? 0);
    if (input.quantity > available)
      throw new BusinessError(
        "insufficient_inventory",
        `Only ${available} plants are free`,
      );
    const id = input.id ?? randomUUID();
    await request(tx)
      .input("id", sql.VarChar(36), id)
      .input("truckId", sql.VarChar(36), input.truckId)
      .input("lotId", sql.VarChar(36), input.lotId)
      .input("quantity", sql.Int, input.quantity)
      .query(`IF EXISTS (SELECT 1 FROM dbo.allocations WHERE id=@id)
        UPDATE dbo.allocations SET truck_id=@truckId,lot_id=@lotId,quantity=@quantity,reserved_remaining=@quantity,status='active' WHERE id=@id
        ELSE INSERT dbo.allocations (id,truck_id,lot_id,quantity,reserved_remaining) VALUES (@id,@truckId,@lotId,@quantity,@quantity)`);
    return { id, availableAfter: available - input.quantity };
  });
}

export async function cancelAllocation(allocationId: string) {
  return withTransaction(async (tx) => {
    const lookup = await request(tx).input("id", sql.VarChar(36), allocationId)
      .query<{
      plan_id: string;
    }>(`SELECT t.daily_plan_id plan_id FROM dbo.allocations a
        JOIN dbo.trucks t ON t.id=a.truck_id WHERE a.id=@id`);
    const planId = lookup.recordset[0]?.plan_id;
    if (!planId)
      throw new BusinessError(
        "allocation_not_found",
        "Allocation not found",
        404,
      );
    const plan = await request(tx)
      .input("planId", sql.VarChar(36), planId)
      .query<{ status: string }>(
        "SELECT status FROM dbo.daily_plans WITH (UPDLOCK,HOLDLOCK) WHERE id=@planId",
      );
    if (plan.recordset[0]?.status !== "draft")
      throw new BusinessError(
        "published_plan_immutable",
        "Published plans cannot be changed",
      );
    const allocation = await request(tx)
      .input("id", sql.VarChar(36), allocationId)
      .input("planId", sql.VarChar(36), planId).query<{
      id: string;
    }>(`SELECT a.id FROM dbo.allocations a WITH (UPDLOCK,HOLDLOCK)
        JOIN dbo.trucks t ON t.id=a.truck_id
        WHERE a.id=@id AND t.daily_plan_id=@planId`);
    if (!allocation.recordset[0])
      throw new BusinessError(
        "allocation_not_found",
        "Allocation not found",
        404,
      );
    await request(tx)
      .input("id", sql.VarChar(36), allocationId)
      .query(
        "UPDATE dbo.allocations SET status='cancelled',reserved_remaining=0 WHERE id=@id",
      );
    return { id: allocationId, status: "cancelled" };
  });
}

export interface FieldCommand {
  operationId: string;
  type: string;
  payload: Record<string, unknown>;
}

export async function processFieldCommand(command: FieldCommand) {
  const payloadHash = hash({ type: command.type, payload: command.payload });
  return withTransaction(async (tx) => {
    const prior = await request(tx)
      .input("id", sql.VarChar(36), command.operationId)
      .query<{ payload_hash: string; result: string }>(
        "SELECT payload_hash,result FROM dbo.processed_operations WITH (UPDLOCK,HOLDLOCK) WHERE operation_id=@id",
      );
    if (prior.recordset[0]) {
      if (prior.recordset[0].payload_hash !== payloadHash)
        throw new BusinessError(
          "operation_id_reused",
          "Operation ID was already used for another payload",
        );
      return {
        ...(JSON.parse(prior.recordset[0].result) as object),
        idempotent: true,
      };
    }
    const result = await applyFieldCommand(tx, command);
    await request(tx)
      .input("id", sql.VarChar(36), command.operationId)
      .input("type", sql.VarChar(40), command.type)
      .input("hash", sql.VarChar(64), payloadHash)
      .input("result", sql.NVarChar(sql.MAX), JSON.stringify(result))
      .query(
        "INSERT dbo.processed_operations (operation_id,operation_type,payload_hash,result) VALUES (@id,@type,@hash,@result)",
      );
    return { ...result, idempotent: false };
  });
}

async function applyFieldCommand(
  tx: Transaction,
  command: FieldCommand,
): Promise<Record<string, unknown>> {
  const p = command.payload;
  if (
    command.type === "planned_pickup" ||
    command.type === "alternative_pickup"
  ) {
    const assignmentId = String(p.assignmentId);
    const lotId = String(p.lotId);
    const quantity = Number(p.quantity);
    const source =
      command.type === "planned_pickup" ? "planned" : "alternative";
    const assignmentResult = await request(tx)
      .input("id", sql.VarChar(36), assignmentId)
      .query<{
        quantity: number;
        planned_picked_quantity: number;
        allocation_id: string;
        team_number: number;
        lot_id: string;
        product_id: string;
      }>(
        `SELECT ta.quantity,ta.planned_picked_quantity,ta.allocation_id,ta.team_number,a.lot_id,l.product_id
        FROM dbo.team_assignments ta WITH (UPDLOCK,HOLDLOCK)
        JOIN dbo.allocations a ON a.id=ta.allocation_id
        JOIN dbo.lots l ON l.id=a.lot_id WHERE ta.id=@id`,
      );
    const assignment = assignmentResult.recordset[0];
    if (!assignment)
      throw new BusinessError(
        "assignment_not_found",
        "Assignment not found",
        404,
      );
    if (source === "planned" && lotId !== assignment.lot_id)
      throw new BusinessError(
        "planned_lot_mismatch",
        "A planned pickup must use its allocated lot",
      );
    let claimQuantity: number | undefined;
    if (source === "alternative") {
      if (typeof p.claimId !== "string")
        throw new BusinessError(
          "claim_required",
          "An alternative pickup requires a claim",
        );
      const claimResult = await request(tx).input(
        "claimId",
        sql.VarChar(36),
        p.claimId,
      ).query<{
        assignment_id: string;
        team_number: number;
        lot_id: string;
        quantity: number;
        state: string;
      }>(`SELECT assignment_id,team_number,lot_id,quantity,state
          FROM dbo.alternative_claims WITH (UPDLOCK,HOLDLOCK) WHERE id=@claimId`);
      const claim = claimResult.recordset[0];
      if (!claim)
        throw new BusinessError("claim_not_found", "Claim not found", 404);
      if (
        claim.state !== "active" ||
        claim.assignment_id !== assignmentId ||
        claim.team_number !== assignment.team_number ||
        claim.lot_id !== lotId
      )
        throw new BusinessError(
          "claim_mismatch",
          "The active claim does not match this pickup",
        );
      claimQuantity = claim.quantity;
    }
    const targetLot = await request(tx)
      .input("lotId", sql.VarChar(36), lotId)
      .query<{ product_id: string }>(
        "SELECT product_id FROM dbo.lots WITH (UPDLOCK,HOLDLOCK) WHERE id=@lotId",
      );
    if (!targetLot.recordset[0])
      throw new BusinessError("lot_not_found", "Lot not found", 404);
    if (targetLot.recordset[0].product_id !== assignment.product_id)
      throw new BusinessError(
        "product_mismatch",
        "The pickup lot must contain the assigned product",
      );
    const pickupId = randomUUID();
    await request(tx)
      .input("id", sql.VarChar(36), pickupId)
      .input("assignmentId", sql.VarChar(36), assignmentId)
      .input("team", sql.Int, assignment.team_number)
      .input("lotId", sql.VarChar(36), lotId)
      .input("quantity", sql.Int, quantity)
      .input("source", sql.VarChar(16), source)
      .input(
        "claimId",
        sql.VarChar(36),
        typeof p.claimId === "string" ? p.claimId : null,
      )
      .input("operationId", sql.VarChar(36), command.operationId)
      .input(
        "recordedAt",
        sql.DateTimeOffset,
        new Date(
          typeof p.recordedAtClient === "string"
            ? p.recordedAtClient
            : new Date().toISOString(),
        ),
      )
      .query(`INSERT dbo.pickups (id,assignment_id,team_number,lot_id,quantity,source,claim_id,operation_id,recorded_at_client)
        VALUES (@id,@assignmentId,@team,@lotId,@quantity,@source,@claimId,@operationId,@recordedAt);
        INSERT dbo.pickup_effects (pickup_id,effective_lot_id,effective_quantity,effective_source) VALUES (@id,@lotId,@quantity,@source);
        UPDATE dbo.lots SET recorded_quantity=recorded_quantity-@quantity,version=version+1,updated_at=SYSUTCDATETIME() WHERE id=@lotId;`);
    if (source === "planned") {
      const consumed = consumedPlannedReservation(
        quantity,
        Math.max(0, assignment.quantity - assignment.planned_picked_quantity),
      );
      await request(tx)
        .input("assignmentId", sql.VarChar(36), assignmentId)
        .input("allocationId", sql.VarChar(36), assignment.allocation_id)
        .input("consumed", sql.Int, consumed)
        .query(`UPDATE dbo.team_assignments SET planned_picked_quantity=planned_picked_quantity+@consumed WHERE id=@assignmentId;
          UPDATE dbo.allocations SET reserved_remaining=reserved_remaining-@consumed WHERE id=@allocationId`);
      if (quantity > assignment.quantity - assignment.planned_picked_quantity)
        await createException(tx, {
          type: "over_pick",
          subjectType: "pickup",
          subjectId: pickupId,
          assignmentId,
          pickupId,
          details: {
            quantity,
            assignedRemaining:
              assignment.quantity - assignment.planned_picked_quantity,
          },
        });
    } else if (typeof p.claimId === "string") {
      const claimUpdate = await request(tx)
        .input("id", sql.VarChar(36), p.claimId)
        .query(
          "UPDATE dbo.alternative_claims SET state='picked',updated_at=SYSUTCDATETIME() WHERE id=@id AND state='active'",
        );
      if ((claimUpdate.rowsAffected[0] ?? 0) !== 1)
        throw new BusinessError(
          "claim_not_active",
          "The alternative claim was already used",
        );
      if (claimQuantity !== undefined && quantity > claimQuantity)
        await createException(tx, {
          type: "claim_over_pick",
          subjectType: "pickup",
          subjectId: pickupId,
          assignmentId,
          pickupId,
          details: { quantity, claimedQuantity: claimQuantity },
        });
    }
    const lotState = await request(tx)
      .input("lotId", sql.VarChar(36), lotId)
      .query<{ recorded_quantity: number; flagged: number }>(
        "SELECT l.recorded_quantity,CASE WHEN EXISTS(SELECT 1 FROM dbo.lot_flags f WHERE f.lot_id=l.id AND f.status='active') THEN 1 ELSE 0 END flagged FROM dbo.lots l WHERE l.id=@lotId",
      );
    if ((lotState.recordset[0]?.recorded_quantity ?? 0) < 0)
      await createException(tx, {
        type: "overdraw",
        subjectType: "lot",
        subjectId: lotId,
        assignmentId,
        pickupId,
        participantLotId: lotId,
        details: {
          lotId,
          resultingQuantity: lotState.recordset[0]?.recorded_quantity,
        },
      });
    if (lotState.recordset[0]?.flagged)
      await createException(tx, {
        type: "flagged_source",
        subjectType: "pickup",
        subjectId: pickupId,
        assignmentId,
        pickupId,
        details: { lotId },
      });
    return { pickupId };
  }
  if (command.type === "shortage") {
    const id = randomUUID();
    await request(tx)
      .input("id", sql.VarChar(36), id)
      .input("assignmentId", sql.VarChar(36), String(p.assignmentId))
      .input("expected", sql.Int, Number(p.expectedQuantity))
      .input("picked", sql.Int, Number(p.pickedQuantity))
      .input("reason", sql.VarChar(32), String(p.reason))
      .input(
        "other",
        sql.NVarChar(400),
        typeof p.otherReason === "string" ? p.otherReason : null,
      )
      .input("flag", sql.Bit, Boolean(p.flagRequested))
      .input("operationId", sql.VarChar(36), command.operationId)
      .query(
        "INSERT dbo.shortage_reports (id,assignment_id,expected_quantity,picked_quantity,reason,other_reason,flag_requested,operation_id) VALUES (@id,@assignmentId,@expected,@picked,@reason,@other,@flag,@operationId)",
      );
    if (p.flagRequested)
      await createLotFlag(
        tx,
        String(p.lotId),
        String(p.flagReason ?? p.reason),
        Number(p.teamNumber),
      );
    return { shortageReportId: id };
  }
  if (command.type === "claim_alternative") {
    const id = String(p.claimId);
    const assignment = await request(tx)
      .input("assignmentId", sql.VarChar(36), String(p.assignmentId))
      .query<{
        team_number: number;
        product_id: string;
        planned_lot_id: string;
      }>(
        `SELECT ta.team_number,l.product_id,a.lot_id planned_lot_id
        FROM dbo.team_assignments ta WITH (UPDLOCK,HOLDLOCK)
        JOIN dbo.allocations a ON a.id=ta.allocation_id
        JOIN dbo.lots l ON l.id=a.lot_id WHERE ta.id=@assignmentId`,
      );
    const assigned = assignment.recordset[0];
    if (!assigned)
      throw new BusinessError(
        "assignment_not_found",
        "Assignment not found",
        404,
      );
    if (assigned.team_number !== Number(p.teamNumber))
      throw new BusinessError(
        "team_mismatch",
        "The claim team does not own this assignment",
      );
    if (assigned.planned_lot_id === String(p.lotId))
      throw new BusinessError(
        "alternative_lot_required",
        "Choose a different lot for an alternative claim",
      );
    const alternativeLot = await request(tx)
      .input("lotId", sql.VarChar(36), String(p.lotId))
      .query<{ product_id: string }>(
        "SELECT product_id FROM dbo.lots WITH (UPDLOCK,HOLDLOCK) WHERE id=@lotId",
      );
    if (!alternativeLot.recordset[0])
      throw new BusinessError("lot_not_found", "Lot not found", 404);
    if (alternativeLot.recordset[0].product_id !== assigned.product_id)
      throw new BusinessError(
        "product_mismatch",
        "An alternative lot must contain the assigned product",
      );
    const reusedClaim = await request(tx)
      .input("id", sql.VarChar(36), id)
      .query<{ id: string }>(
        "SELECT id FROM dbo.alternative_claims WITH (UPDLOCK,HOLDLOCK) WHERE id=@id",
      );
    if (reusedClaim.recordset[0])
      throw new BusinessError("claim_id_reused", "Claim ID was already used");
    await request(tx)
      .input("id", sql.VarChar(36), id)
      .input("assignmentId", sql.VarChar(36), String(p.assignmentId))
      .input("team", sql.Int, Number(p.teamNumber))
      .input("lotId", sql.VarChar(36), String(p.lotId))
      .input("quantity", sql.Int, Number(p.quantity))
      .input("operationId", sql.VarChar(36), command.operationId)
      .query(
        "INSERT dbo.alternative_claims (id,assignment_id,team_number,lot_id,quantity,operation_id) VALUES (@id,@assignmentId,@team,@lotId,@quantity,@operationId)",
      );
    return { claimId: id };
  }
  if (command.type === "cancel_claim") {
    await request(tx)
      .input("id", sql.VarChar(36), String(p.claimId))
      .query(
        "UPDATE dbo.alternative_claims SET state='cancelled',updated_at=SYSUTCDATETIME() WHERE id=@id AND state='active'",
      );
    return { claimId: String(p.claimId), state: "cancelled" };
  }
  if (command.type === "flag_lot") {
    return {
      flagId: await createLotFlag(
        tx,
        String(p.lotId),
        String(p.reason),
        Number(p.teamNumber),
      ),
    };
  }
  if (command.type === "complete_truck") {
    const truckId = String(p.truckId);
    const teamNumber = Number(p.teamNumber);
    const truck = await request(tx)
      .input("truckId", sql.VarChar(36), truckId)
      .input("team", sql.Int, teamNumber).query<{
      team_count: number;
    }>(`SELECT dp.team_count FROM dbo.trucks t WITH (UPDLOCK,HOLDLOCK)
        JOIN dbo.daily_plans dp WITH (UPDLOCK,HOLDLOCK) ON dp.id=t.daily_plan_id
        WHERE t.id=@truckId AND @team BETWEEN 1 AND dp.team_count`);
    if (!truck.recordset[0])
      throw new BusinessError(
        "truck_or_team_not_found",
        "Truck or team not found",
        404,
      );
    const completed = await request(tx)
      .input("truckId", sql.VarChar(36), truckId)
      .input("team", sql.Int, teamNumber).query<{
      id: string;
    }>(`SELECT id FROM dbo.truck_completions WITH (UPDLOCK,HOLDLOCK)
        WHERE truck_id=@truckId AND team_number=@team`);
    if (completed.recordset[0])
      return {
        truckId,
        completionId: completed.recordset[0].id,
        abandonedClaims: 0,
        alreadyCompleted: true,
      };
    const completionId = randomUUID();
    await request(tx)
      .input("id", sql.VarChar(36), completionId)
      .input("truckId", sql.VarChar(36), truckId)
      .input("team", sql.Int, teamNumber)
      .input("operationId", sql.VarChar(36), command.operationId)
      .query(`INSERT dbo.truck_completions (id,truck_id,team_number,operation_id)
        VALUES (@id,@truckId,@team,@operationId)`);
    const active = await request(tx)
      .input("truckId", sql.VarChar(36), truckId)
      .input("team", sql.Int, teamNumber).query<{
      id: string;
      assignment_id: string;
    }>(`SELECT c.id,c.assignment_id FROM dbo.alternative_claims c
        JOIN dbo.team_assignments ta ON ta.id=c.assignment_id JOIN dbo.allocations a ON a.id=ta.allocation_id
        WHERE a.truck_id=@truckId AND c.team_number=@team AND c.state='active'`);
    for (const claim of active.recordset)
      await createException(tx, {
        type: "abandoned_claim",
        subjectType: "claim",
        subjectId: claim.id,
        assignmentId: claim.assignment_id,
        details: { claimId: claim.id, truckId },
      });
    return {
      truckId,
      completionId,
      abandonedClaims: active.recordset.length,
      alreadyCompleted: false,
    };
  }
  throw new BusinessError(
    "unsupported_operation",
    `Unsupported field operation: ${command.type}`,
    400,
  );
}

async function createLotFlag(
  tx: Transaction,
  lotId: string,
  reason: string,
  teamNumber: number,
): Promise<string> {
  const existing = await request(tx)
    .input("lotId", sql.VarChar(36), lotId)
    .query<{ id: string }>(
      "SELECT id FROM dbo.lot_flags WHERE lot_id=@lotId AND status='active'",
    );
  if (existing.recordset[0]) return existing.recordset[0].id;
  const id = randomUUID();
  await request(tx)
    .input("id", sql.VarChar(36), id)
    .input("lotId", sql.VarChar(36), lotId)
    .input("reason", sql.NVarChar(400), reason)
    .input("team", sql.Int, teamNumber)
    .query(
      "INSERT dbo.lot_flags (id,lot_id,reason,created_by_team_number) VALUES (@id,@lotId,@reason,@team)",
    );
  return id;
}
