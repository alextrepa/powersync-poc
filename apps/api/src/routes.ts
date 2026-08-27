import { createHash, randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { SignJWT } from "jose";
import { z } from "zod";
import { splitQuantity } from "@plant-route/domain";
import { getPool, request, sql, withTransaction } from "./database.js";
import {
  BusinessError,
  cancelAllocation,
  createException,
  processFieldCommand,
  publishPlan,
  reserveAllocation,
} from "./domain-service.js";

const id = z.string().uuid();
const positiveInt = z.coerce.number().int().positive();
const nonnegativeInt = z.coerce.number().int().nonnegative();
const fieldCommandSchema = z.discriminatedUnion("type", [
  z.object({
    operationId: id,
    type: z.literal("planned_pickup"),
    payload: z.object({
      assignmentId: id,
      lotId: id,
      quantity: nonnegativeInt,
      recordedAtClient: z.iso.datetime().optional(),
    }),
  }),
  z.object({
    operationId: id,
    type: z.literal("alternative_pickup"),
    payload: z.object({
      assignmentId: id,
      lotId: id,
      claimId: id,
      quantity: nonnegativeInt,
      recordedAtClient: z.iso.datetime().optional(),
    }),
  }),
  z.object({
    operationId: id,
    type: z.literal("shortage"),
    payload: z.object({
      assignmentId: id,
      lotId: id,
      teamNumber: positiveInt,
      expectedQuantity: nonnegativeInt,
      pickedQuantity: nonnegativeInt,
      reason: z.enum([
        "dead_or_damaged",
        "incorrect_count",
        "inaccessible_lot",
        "wrong_product",
        "no_lot_problem",
        "other",
      ]),
      otherReason: z.string().trim().min(1).max(400).optional(),
      flagRequested: z.boolean(),
      flagReason: z.string().trim().min(1).max(400).optional(),
    }),
  }),
  z.object({
    operationId: id,
    type: z.literal("claim_alternative"),
    payload: z.object({
      claimId: id,
      assignmentId: id,
      lotId: id,
      teamNumber: positiveInt,
      quantity: positiveInt,
    }),
  }),
  z.object({
    operationId: id,
    type: z.literal("cancel_claim"),
    payload: z.object({ claimId: id }),
  }),
  z.object({
    operationId: id,
    type: z.literal("flag_lot"),
    payload: z.object({
      lotId: id,
      teamNumber: positiveInt,
      reason: z.string().trim().min(1).max(400),
    }),
  }),
  z.object({
    operationId: id,
    type: z.literal("complete_truck"),
    payload: z.object({ truckId: id, teamNumber: positiveInt }),
  }),
]);
const correctionSchema = z.discriminatedUnion("kind", [
  z.object({
    commandId: id,
    exceptionId: id.optional(),
    kind: z.literal("inventory_recount"),
    details: z.object({
      lotId: id,
      quantity: nonnegativeInt,
      note: z.string().max(400).optional(),
    }),
  }),
  z.object({
    commandId: id,
    exceptionId: id.optional(),
    kind: z.literal("return_to_lot"),
    details: z.object({
      lotId: id,
      quantity: positiveInt,
      note: z.string().max(400).optional(),
    }),
  }),
  z.object({
    commandId: id,
    exceptionId: id.optional(),
    kind: z.literal("release_reserved_remainder"),
    details: z.object({
      allocationId: id,
      quantity: positiveInt,
      note: z.string().max(400).optional(),
    }),
  }),
  z.object({
    commandId: id,
    exceptionId: id.optional(),
    kind: z.literal("correct_pickup_quantity"),
    details: z.object({
      pickupId: id,
      quantity: nonnegativeInt,
      note: z.string().max(400).optional(),
    }),
  }),
  z.object({
    commandId: id,
    exceptionId: id.optional(),
    kind: z.literal("reassign_pickup_lot"),
    details: z.object({
      pickupId: id,
      lotId: id,
      note: z.string().max(400).optional(),
    }),
  }),
  z.object({
    commandId: id,
    exceptionId: id.optional(),
    kind: z.literal("resolve_exception"),
    details: z.object({ note: z.string().trim().min(1).max(400) }),
  }),
]);

function body<T extends z.ZodType>(
  schema: T,
  req: FastifyRequest,
): z.output<T> {
  return schema.parse(req.body);
}

export function registerRoutes(app: FastifyInstance) {
  let oneShotFault:
    | "fail-upload-before-commit"
    | "lost-upload-response"
    | "lost-correction-response"
    | null = null;
  const consumeFault = (mode: typeof oneShotFault) => {
    if (oneShotFault !== mode) return;
    oneShotFault = null;
    throw new BusinessError(
      mode === "fail-upload-before-commit"
        ? "simulated_precommit_failure"
        : "simulated_response_loss",
      mode === "fail-upload-before-commit"
        ? "The POC intentionally failed before processing the upload"
        : "The POC intentionally dropped a committed response",
      503,
    );
  };
  app.get("/ready", async () => {
    await (await getPool()).request().query("SELECT 1 ready");
    return { status: "ready" };
  });
  app.post("/diagnostics/faults", (req) => {
    if (process.env.POC_FAULTS_ENABLED !== "true")
      throw new BusinessError(
        "diagnostics_disabled",
        "Fault controls are disabled",
        404,
      );
    const input = body(
      z.object({
        mode: z.enum([
          "clear",
          "fail-upload-before-commit",
          "lost-upload-response",
          "lost-correction-response",
        ]),
      }),
      req,
    );
    oneShotFault = input.mode === "clear" ? null : input.mode;
    return { armed: oneShotFault };
  });

  app.post("/sync/token", async (req) => {
    const input = body(
      z.object({ planId: id.optional(), teamNumber: positiveInt.optional() }),
      req,
    );
    const key = Buffer.from(
      process.env.POWERSYNC_CLIENT_AUTH_KEY ?? "",
      "base64url",
    );
    const token = await new SignJWT({
      plan_id: input.planId,
      team_number: input.teamNumber,
    })
      .setProtectedHeader({ alg: "HS256", kid: "local-dev" })
      .setSubject("poc-field-device")
      .setIssuer("plant-route-poc")
      .setAudience("powersync")
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(key);
    return { token, endpoint: "/powersync" };
  });

  app.get(
    "/products",
    async () =>
      (
        await (
          await getPool()
        )
          .request()
          .query("SELECT * FROM dbo.products ORDER BY name")
      ).recordset,
  );
  app.post("/products", async (req, reply) => {
    const input = body(
      z.object({ name: z.string().trim().min(1).max(160) }),
      req,
    );
    const productId = randomUUID();
    await (
      await getPool()
    )
      .request()
      .input("id", sql.VarChar(36), productId)
      .input("name", sql.NVarChar(160), input.name)
      .query("INSERT dbo.products (id,name) VALUES (@id,@name)");
    return reply.code(201).send({ id: productId, name: input.name });
  });
  app.put("/products/:id", async (req) => {
    const productId = id.parse((req.params as { id: string }).id);
    const input = body(
      z.object({ name: z.string().trim().min(1).max(160) }),
      req,
    );
    await (
      await getPool()
    )
      .request()
      .input("id", sql.VarChar(36), productId)
      .input("name", sql.NVarChar(160), input.name)
      .query(
        "UPDATE dbo.products SET name=@name,updated_at=SYSUTCDATETIME() WHERE id=@id",
      );
    return { id: productId, ...input };
  });

  app.get(
    "/lots",
    async () =>
      (
        await (await getPool()).request().query(`SELECT l.*,p.name product_name,
    COALESCE((SELECT SUM(a.reserved_remaining) FROM dbo.allocations a WHERE a.lot_id=l.id AND a.status='active'),0) reserved_remaining,
    COALESCE((SELECT SUM(c.quantity) FROM dbo.alternative_claims c WHERE c.lot_id=l.id AND c.state='active'),0) active_claims,
    f.id active_flag_id,f.reason active_flag_reason
    FROM dbo.lots l JOIN dbo.products p ON p.id=l.product_id
    LEFT JOIN dbo.lot_flags f ON f.lot_id=l.id AND f.status='active' ORDER BY p.name,l.code`)
      ).recordset,
  );
  app.post("/lots", async (req, reply) => {
    const input = body(
      z.object({
        productId: id,
        code: z.string().trim().min(1).max(80),
        location: z.string().trim().min(1).max(160),
        recordedQuantity: z.coerce.number().int().nonnegative(),
      }),
      req,
    );
    const lotId = randomUUID();
    await (
      await getPool()
    )
      .request()
      .input("id", sql.VarChar(36), lotId)
      .input("productId", sql.VarChar(36), input.productId)
      .input("code", sql.NVarChar(80), input.code)
      .input("location", sql.NVarChar(160), input.location)
      .input("quantity", sql.Int, input.recordedQuantity)
      .query(
        "INSERT dbo.lots (id,product_id,code,location,recorded_quantity) VALUES (@id,@productId,@code,@location,@quantity)",
      );
    return reply.code(201).send({ id: lotId, ...input });
  });
  app.put("/lots/:id/quantity", async (req) => {
    const lotId = id.parse((req.params as { id: string }).id);
    const input = body(
      z.object({
        quantity: z.coerce.number().int().nonnegative(),
        reason: z.string().trim().min(1).max(400),
      }),
      req,
    );
    return withTransaction(async (tx) => {
      const previous = await request(tx)
        .input("id", sql.VarChar(36), lotId)
        .query<{ recorded_quantity: number }>(
          "SELECT recorded_quantity FROM dbo.lots WITH (UPDLOCK,HOLDLOCK) WHERE id=@id",
        );
      if (!previous.recordset[0])
        throw new BusinessError("lot_not_found", "Lot not found", 404);
      await request(tx)
        .input("id", sql.VarChar(36), lotId)
        .input("quantity", sql.Int, input.quantity)
        .query(
          "UPDATE dbo.lots SET recorded_quantity=@quantity,version=version+1,updated_at=SYSUTCDATETIME() WHERE id=@id",
        );
      const adjustmentId = randomUUID();
      await request(tx)
        .input("id", sql.VarChar(36), adjustmentId)
        .input("lotId", sql.VarChar(36), lotId)
        .input("previous", sql.Int, previous.recordset[0].recorded_quantity)
        .input("next", sql.Int, input.quantity)
        .input("reason", sql.NVarChar(400), input.reason)
        .query(
          "INSERT dbo.inventory_adjustments (id,lot_id,previous_quantity,new_quantity,reason) VALUES (@id,@lotId,@previous,@next,@reason)",
        );
      return { id: lotId, recordedQuantity: input.quantity, adjustmentId };
    });
  });
  app.get(
    "/flags",
    async () =>
      (
        await (await getPool()).request()
          .query(`SELECT f.*,l.code lot_code,p.name product_name FROM dbo.lot_flags f
    JOIN dbo.lots l ON l.id=f.lot_id JOIN dbo.products p ON p.id=l.product_id ORDER BY f.created_at DESC`)
      ).recordset,
  );
  app.post("/lots/:id/flags", async (req, reply) => {
    const lotId = id.parse((req.params as { id: string }).id);
    const input = body(
      z.object({ reason: z.string().trim().min(1).max(400) }),
      req,
    );
    const flagId = randomUUID();
    await (
      await getPool()
    )
      .request()
      .input("id", sql.VarChar(36), flagId)
      .input("lotId", sql.VarChar(36), lotId)
      .input("reason", sql.NVarChar(400), input.reason)
      .query(
        "INSERT dbo.lot_flags (id,lot_id,reason) VALUES (@id,@lotId,@reason)",
      );
    return reply.code(201).send({ id: flagId, lotId, ...input });
  });
  app.post("/flags/:id/clear", async (req) => {
    const flagId = id.parse((req.params as { id: string }).id);
    await (
      await getPool()
    )
      .request()
      .input("id", sql.VarChar(36), flagId)
      .query(
        "UPDATE dbo.lot_flags SET status='cleared',cleared_at=SYSUTCDATETIME() WHERE id=@id AND status='active'",
      );
    return { id: flagId, status: "cleared" };
  });

  app.get(
    "/plans",
    async () =>
      (
        await (await getPool()).request().query(`SELECT p.*,
    (SELECT COUNT(*) FROM dbo.trucks t WHERE t.daily_plan_id=p.id) truck_count,
    (SELECT COALESCE(SUM(a.quantity),0) FROM dbo.allocations a JOIN dbo.trucks t ON t.id=a.truck_id WHERE t.daily_plan_id=p.id AND a.status='active') allocated_quantity
    FROM dbo.daily_plans p ORDER BY service_date DESC,created_at DESC`)
      ).recordset,
  );
  app.post("/plans", async (req, reply) => {
    const input = body(
      z.object({
        serviceDate: z.iso.date(),
        teamCount: positiveInt,
        truckCount: positiveInt.max(20),
      }),
      req,
    );
    const planId = randomUUID();
    await withTransaction(async (tx) => {
      await request(tx)
        .input("id", sql.VarChar(36), planId)
        .input("date", sql.Date, input.serviceDate)
        .input("teams", sql.Int, input.teamCount)
        .query(
          "INSERT dbo.daily_plans (id,service_date,team_count) VALUES (@id,@date,@teams)",
        );
      for (
        let truckNumber = 1;
        truckNumber <= input.truckCount;
        truckNumber += 1
      ) {
        await request(tx)
          .input("id", sql.VarChar(36), randomUUID())
          .input("planId", sql.VarChar(36), planId)
          .input("number", sql.Int, truckNumber)
          .query(
            "INSERT dbo.trucks (id,daily_plan_id,truck_number) VALUES (@id,@planId,@number)",
          );
      }
    });
    return reply.code(201).send({ id: planId, ...input });
  });
  app.get("/plans/:id", async (req) => {
    const planId = id.parse((req.params as { id: string }).id);
    const pool = await getPool();
    const plan = (
      await pool
        .request()
        .input("id", sql.VarChar(36), planId)
        .query<Record<string, unknown>>(
          "SELECT * FROM dbo.daily_plans WHERE id=@id",
        )
    ).recordset[0];
    const trucks = (
      await pool.request().input("id", sql.VarChar(36), planId).query<
        Record<string, unknown>
      >(`SELECT t.*,a.id allocation_id,a.lot_id,a.quantity,a.reserved_remaining,l.code lot_code,l.location,p.name product_name
      FROM dbo.trucks t LEFT JOIN dbo.allocations a ON a.truck_id=t.id AND a.status='active' LEFT JOIN dbo.lots l ON l.id=a.lot_id LEFT JOIN dbo.products p ON p.id=l.product_id
      WHERE t.daily_plan_id=@id ORDER BY t.truck_number,p.name`)
    ).recordset;
    return { plan, trucks };
  });
  app.post("/allocations", async (req, reply) => {
    const input = body(
      z.object({
        id: id.optional(),
        truckId: id,
        lotId: id,
        quantity: positiveInt,
      }),
      req,
    );
    return reply
      .code(input.id ? 200 : 201)
      .send(await reserveAllocation(input));
  });
  app.delete("/allocations/:id", async (req) => {
    const allocationId = id.parse((req.params as { id: string }).id);
    return cancelAllocation(allocationId);
  });
  app.get("/plans/:id/preview", async (req) => {
    const planId = id.parse((req.params as { id: string }).id);
    const pool = await getPool();
    const plan = (
      await pool
        .request()
        .input("id", sql.VarChar(36), planId)
        .query<{ team_count: number }>(
          "SELECT team_count FROM dbo.daily_plans WHERE id=@id",
        )
    ).recordset[0];
    if (!plan) throw new BusinessError("plan_not_found", "Plan not found", 404);
    const allocations = (
      await pool.request().input("id", sql.VarChar(36), planId).query<{
        id: string;
        quantity: number;
        truck_number: number;
        lot_code: string;
        product_name: string;
      }>(`SELECT a.id,a.quantity,t.truck_number,l.code lot_code,p.name product_name FROM dbo.allocations a
      JOIN dbo.trucks t ON t.id=a.truck_id JOIN dbo.lots l ON l.id=a.lot_id JOIN dbo.products p ON p.id=l.product_id WHERE t.daily_plan_id=@id AND a.status='active' ORDER BY t.truck_number,p.name`)
    ).recordset;
    return allocations.flatMap((allocation) =>
      splitQuantity(allocation.quantity, plan.team_count).map((share) => ({
        ...allocation,
        ...share,
      })),
    );
  });
  app.post("/plans/:id/publish", async (req) =>
    publishPlan(id.parse((req.params as { id: string }).id)),
  );

  app.get("/field/day", async (req) => {
    const query = z
      .object({ date: z.iso.date(), team: positiveInt })
      .parse(req.query);
    const pool = await getPool();
    const plan = (
      await pool
        .request()
        .input("date", sql.Date, query.date)
        .query<{ id: string }>(
          "SELECT * FROM dbo.daily_plans WHERE service_date=@date AND status='published'",
        )
    ).recordset[0];
    if (!plan)
      throw new BusinessError(
        "day_not_published",
        "No published work for this date",
        404,
      );
    const assignments = (
      await pool
        .request()
        .input("planId", sql.VarChar(36), plan.id)
        .input("team", sql.Int, query.team)
        .query(`SELECT ta.*,t.id truck_id,t.truck_number,a.lot_id,l.code lot_code,l.location,p.id product_id,p.name product_name,
      CASE WHEN EXISTS(SELECT 1 FROM dbo.lot_flags f WHERE f.lot_id=l.id AND f.status='active') THEN 1 ELSE 0 END lot_flagged
      FROM dbo.team_assignments ta JOIN dbo.allocations a ON a.id=ta.allocation_id JOIN dbo.trucks t ON t.id=a.truck_id
      JOIN dbo.lots l ON l.id=a.lot_id JOIN dbo.products p ON p.id=l.product_id WHERE t.daily_plan_id=@planId AND ta.team_number=@team ORDER BY t.truck_number,p.name`)
    ).recordset;
    const lots = (
      await pool
        .request()
        .input("planId", sql.VarChar(36), plan.id)
        .input("team", sql.Int, query.team)
        .query(`SELECT l.*,p.name product_name,
      COALESCE((SELECT SUM(a2.reserved_remaining) FROM dbo.allocations a2 WHERE a2.lot_id=l.id AND a2.status='active'),0) reserved_remaining,
      COALESCE((SELECT SUM(c.quantity) FROM dbo.alternative_claims c WHERE c.lot_id=l.id AND c.state='active'),0) active_claims,
      CASE WHEN EXISTS(SELECT 1 FROM dbo.lot_flags f WHERE f.lot_id=l.id AND f.status='active') THEN 1 ELSE 0 END flagged
      FROM dbo.lots l JOIN dbo.products p ON p.id=l.product_id WHERE l.product_id IN (
        SELECT planned.product_id FROM dbo.lots planned JOIN dbo.allocations a ON a.lot_id=planned.id JOIN dbo.trucks t ON t.id=a.truck_id
        JOIN dbo.team_assignments ta ON ta.allocation_id=a.id WHERE t.daily_plan_id=@planId AND ta.team_number=@team)
      ORDER BY flagged,l.recorded_quantity DESC,l.code`)
    ).recordset;
    const exceptions = (
      await pool
        .request()
        .input("planId", sql.VarChar(36), plan.id)
        .input("team", sql.Int, query.team)
        .query(
          `SELECT e.* FROM dbo.exceptions e JOIN dbo.exception_participants ep ON ep.exception_id=e.id WHERE ep.plan_id=@planId AND ep.team_number=@team ORDER BY e.created_at DESC`,
        )
    ).recordset;
    return { plan, teamNumber: query.team, assignments, lots, exceptions };
  });
  app.post("/field/operations", async (req, reply) => {
    consumeFault("fail-upload-before-commit");
    const result = await processFieldCommand(body(fieldCommandSchema, req));
    consumeFault("lost-upload-response");
    return reply.code(202).send(result);
  });
  app.post("/field/upload", async (req) => {
    const input = body(
      z.object({ operations: z.array(fieldCommandSchema).min(1) }),
      req,
    );
    consumeFault("fail-upload-before-commit");
    const results = [];
    for (const operation of input.operations)
      results.push(await processFieldCommand(operation));
    consumeFault("lost-upload-response");
    return { results };
  });

  app.get("/operations", async () => {
    const pool = await getPool();
    const [pickups, claims, exceptions, corrections] = await Promise.all([
      pool
        .request()
        .query(
          `SELECT p.*,pr.name product_name,l.code lot_code FROM dbo.pickups p JOIN dbo.lots l ON l.id=p.lot_id JOIN dbo.products pr ON pr.id=l.product_id ORDER BY p.created_at DESC`,
        ),
      pool
        .request()
        .query(
          `SELECT c.*,pr.name product_name,l.code lot_code FROM dbo.alternative_claims c JOIN dbo.lots l ON l.id=c.lot_id JOIN dbo.products pr ON pr.id=l.product_id ORDER BY c.created_at DESC`,
        ),
      pool
        .request()
        .query("SELECT * FROM dbo.exceptions ORDER BY created_at DESC"),
      pool
        .request()
        .query("SELECT * FROM dbo.corrections ORDER BY created_at DESC"),
    ]);
    return {
      pickups: pickups.recordset,
      claims: claims.recordset,
      exceptions: exceptions.recordset,
      corrections: corrections.recordset,
    };
  });
  app.post("/corrections", async (req) => {
    const input = body(correctionSchema, req);
    const result = await applyCorrection(input);
    consumeFault("lost-correction-response");
    return result;
  });
}

async function applyCorrection(input: {
  commandId: string;
  exceptionId?: string | undefined;
  kind: string;
  details: Record<string, unknown>;
}) {
  return withTransaction(async (tx) => {
    const serialized = JSON.stringify({
      kind: input.kind,
      exceptionId: input.exceptionId,
      details: input.details,
    });
    const payloadHash = createHash("sha256").update(serialized).digest("hex");
    const prior = await request(tx)
      .input("id", sql.VarChar(36), input.commandId)
      .query<{ payload_hash: string; id: string }>(
        "SELECT id,payload_hash FROM dbo.corrections WITH (UPDLOCK,HOLDLOCK) WHERE command_id=@id",
      );
    if (prior.recordset[0]) {
      if (prior.recordset[0].payload_hash !== payloadHash)
        throw new BusinessError(
          "command_id_reused",
          "Command ID was already used for another correction",
        );
      return { id: prior.recordset[0].id, idempotent: true };
    }
    const d = input.details;
    const correctionSubjectId =
      input.kind === "correct_pickup_quantity" ||
      input.kind === "reassign_pickup_lot"
        ? String(d.pickupId)
        : input.kind === "inventory_recount" || input.kind === "return_to_lot"
          ? String(d.lotId)
          : input.kind === "release_reserved_remainder"
            ? String(d.allocationId)
            : undefined;
    if (input.kind === "resolve_exception" && !input.exceptionId)
      throw new BusinessError(
        "exception_required",
        "Choose an exception to resolve",
        400,
      );
    if (input.exceptionId)
      await validateCorrectionException(
        tx,
        input.exceptionId,
        input.kind,
        correctionSubjectId,
      );
    let affectedPickup:
      { pickupId: string; assignmentId: string; lotId: string } | undefined;
    if (input.kind === "inventory_recount") {
      const lot = await request(tx)
        .input("lotId", sql.VarChar(36), String(d.lotId))
        .query<{ id: string }>(
          "SELECT id FROM dbo.lots WITH (UPDLOCK,HOLDLOCK) WHERE id=@lotId",
        );
      if (!lot.recordset[0])
        throw new BusinessError("lot_not_found", "Lot not found", 404);
      await request(tx)
        .input("lotId", sql.VarChar(36), String(d.lotId))
        .input("quantity", sql.Int, Number(d.quantity))
        .query(
          "UPDATE dbo.lots SET recorded_quantity=@quantity,version=version+1,updated_at=SYSUTCDATETIME() WHERE id=@lotId",
        );
    } else if (input.kind === "return_to_lot") {
      const lot = await request(tx)
        .input("lotId", sql.VarChar(36), String(d.lotId))
        .query<{ id: string }>(
          "SELECT id FROM dbo.lots WITH (UPDLOCK,HOLDLOCK) WHERE id=@lotId",
        );
      if (!lot.recordset[0])
        throw new BusinessError("lot_not_found", "Lot not found", 404);
      await request(tx)
        .input("lotId", sql.VarChar(36), String(d.lotId))
        .input("quantity", sql.Int, Number(d.quantity))
        .query(
          "UPDATE dbo.lots SET recorded_quantity=recorded_quantity+@quantity,version=version+1,updated_at=SYSUTCDATETIME() WHERE id=@lotId",
        );
    } else if (input.kind === "release_reserved_remainder") {
      const allocation = await request(tx)
        .input("allocationId", sql.VarChar(36), String(d.allocationId))
        .query<{ reserved_remaining: number }>(
          "SELECT reserved_remaining FROM dbo.allocations WITH (UPDLOCK,HOLDLOCK) WHERE id=@allocationId",
        );
      if (!allocation.recordset[0])
        throw new BusinessError(
          "allocation_not_found",
          "Allocation not found",
          404,
        );
      if (Number(d.quantity) > allocation.recordset[0].reserved_remaining)
        throw new BusinessError(
          "release_exceeds_reserved",
          "Cannot release more than the remaining reservation",
        );
    } else if (input.kind === "correct_pickup_quantity") {
      const pickup = await request(tx).input(
        "pickupId",
        sql.VarChar(36),
        String(d.pickupId),
      ).query<{
        pickup_id: string;
        assignment_id: string;
        effective_lot_id: string;
      }>(`SELECT pe.pickup_id,p.assignment_id,pe.effective_lot_id
          FROM dbo.pickup_effects pe WITH (UPDLOCK,HOLDLOCK)
          JOIN dbo.pickups p ON p.id=pe.pickup_id
          JOIN dbo.lots l WITH (UPDLOCK,HOLDLOCK) ON l.id=pe.effective_lot_id
          WHERE pe.pickup_id=@pickupId`);
      const current = pickup.recordset[0];
      if (!current)
        throw new BusinessError("pickup_not_found", "Pickup not found", 404);
      await request(tx)
        .input("pickupId", sql.VarChar(36), String(d.pickupId))
        .input("quantity", sql.Int, Number(d.quantity))
        .query(`UPDATE l SET l.recorded_quantity=l.recorded_quantity+(pe.effective_quantity-@quantity),l.version=l.version+1
        FROM dbo.lots l JOIN dbo.pickup_effects pe ON pe.effective_lot_id=l.id WHERE pe.pickup_id=@pickupId;
        UPDATE dbo.pickup_effects SET effective_quantity=@quantity,version=version+1 WHERE pickup_id=@pickupId`);
      affectedPickup = {
        pickupId: current.pickup_id,
        assignmentId: current.assignment_id,
        lotId: current.effective_lot_id,
      };
    } else if (input.kind === "reassign_pickup_lot") {
      const compatibility = await request(tx)
        .input("pickupId", sql.VarChar(36), String(d.pickupId))
        .input("lotId", sql.VarChar(36), String(d.lotId)).query<{
        compatible: number;
        assignment_id: string;
      }>(`SELECT CASE WHEN oldLot.product_id=newLot.product_id THEN 1 ELSE 0 END compatible,p.assignment_id
          FROM dbo.pickup_effects pe WITH (UPDLOCK,HOLDLOCK)
          JOIN dbo.pickups p ON p.id=pe.pickup_id
          JOIN dbo.lots oldLot WITH (UPDLOCK,HOLDLOCK) ON oldLot.id=pe.effective_lot_id
          JOIN dbo.lots newLot WITH (UPDLOCK,HOLDLOCK) ON newLot.id=@lotId
          WHERE pe.pickup_id=@pickupId`);
      if (!compatibility.recordset[0])
        throw new BusinessError(
          "pickup_or_lot_not_found",
          "Pickup or target lot not found",
          404,
        );
      if (!compatibility.recordset[0].compatible)
        throw new BusinessError(
          "product_mismatch",
          "A pickup can only move to another lot for the same product",
        );
      await request(tx)
        .input("pickupId", sql.VarChar(36), String(d.pickupId))
        .input("lotId", sql.VarChar(36), String(d.lotId))
        .query(`UPDATE oldLot SET oldLot.recorded_quantity=oldLot.recorded_quantity+pe.effective_quantity,oldLot.version=oldLot.version+1
        FROM dbo.lots oldLot JOIN dbo.pickup_effects pe ON pe.effective_lot_id=oldLot.id WHERE pe.pickup_id=@pickupId;
        UPDATE newLot SET newLot.recorded_quantity=newLot.recorded_quantity-pe.effective_quantity,newLot.version=newLot.version+1
        FROM dbo.lots newLot CROSS JOIN dbo.pickup_effects pe WHERE pe.pickup_id=@pickupId AND newLot.id=@lotId;
        UPDATE pe SET pe.effective_lot_id=@lotId,
          pe.effective_source=CASE WHEN a.lot_id=@lotId THEN 'planned' ELSE 'alternative' END,
          pe.version=pe.version+1
        FROM dbo.pickup_effects pe JOIN dbo.pickups p ON p.id=pe.pickup_id
        JOIN dbo.team_assignments ta ON ta.id=p.assignment_id JOIN dbo.allocations a ON a.id=ta.allocation_id
        WHERE pe.pickup_id=@pickupId`);
      affectedPickup = {
        pickupId: String(d.pickupId),
        assignmentId: compatibility.recordset[0].assignment_id,
        lotId: String(d.lotId),
      };
    }
    const correctionId = randomUUID();
    await request(tx)
      .input("id", sql.VarChar(36), correctionId)
      .input("commandId", sql.VarChar(36), input.commandId)
      .input("hash", sql.VarChar(64), payloadHash)
      .input("exceptionId", sql.VarChar(36), input.exceptionId ?? null)
      .input("kind", sql.VarChar(40), input.kind)
      .input("details", sql.NVarChar(sql.MAX), JSON.stringify(input.details))
      .query(
        "INSERT dbo.corrections (id,command_id,payload_hash,exception_id,kind,details) VALUES (@id,@commandId,@hash,@exceptionId,@kind,@details)",
      );
    if (input.kind === "release_reserved_remainder") {
      await recomputeAllocation(tx, String(d.allocationId));
    } else if (
      input.kind === "correct_pickup_quantity" ||
      input.kind === "reassign_pickup_lot"
    ) {
      await recomputePickupProjections(tx, String(d.pickupId));
    }
    if (affectedPickup)
      await createCorrectionOverdrawException(tx, affectedPickup);
    if (input.exceptionId)
      await request(tx)
        .input("id", sql.VarChar(36), input.exceptionId)
        .query(
          "UPDATE dbo.exceptions SET status='resolved',resolved_at=SYSUTCDATETIME() WHERE id=@id AND status='open'",
        );
    return { id: correctionId, idempotent: false };
  });
}

async function validateCorrectionException(
  tx: sql.Transaction,
  exceptionId: string,
  kind: string,
  subjectId?: string,
): Promise<void> {
  const result = await request(tx)
    .input("id", sql.VarChar(36), exceptionId)
    .input("subjectId", sql.VarChar(36), subjectId ?? null).query<{
    id: string;
  }>(`SELECT e.id FROM dbo.exceptions e WITH (UPDLOCK,HOLDLOCK)
      WHERE e.id=@id AND e.status='open' AND (
        @subjectId IS NULL OR e.subject_id=@subjectId OR
        EXISTS (SELECT 1 FROM dbo.exception_participants ep
          WHERE ep.exception_id=e.id AND ep.pickup_id=@subjectId)
      )`);
  if (!result.recordset[0])
    throw new BusinessError(
      "exception_mismatch",
      kind === "resolve_exception"
        ? "Exception is not open"
        : "Exception does not belong to the corrected fact",
    );
}

async function createCorrectionOverdrawException(
  tx: sql.Transaction,
  input: { pickupId: string; assignmentId: string; lotId: string },
): Promise<void> {
  const lot = await request(tx)
    .input("lotId", sql.VarChar(36), input.lotId)
    .query<{ recorded_quantity: number }>(
      "SELECT recorded_quantity FROM dbo.lots WHERE id=@lotId",
    );
  const resultingQuantity = lot.recordset[0]?.recorded_quantity;
  if (resultingQuantity === undefined)
    throw new BusinessError("lot_not_found", "Lot not found", 404);
  if (resultingQuantity < 0)
    await createException(tx, {
      type: "overdraw",
      subjectType: "lot",
      subjectId: input.lotId,
      assignmentId: input.assignmentId,
      pickupId: input.pickupId,
      participantLotId: input.lotId,
      details: {
        lotId: input.lotId,
        resultingQuantity,
        source: "admin_correction",
      },
    });
}

async function recomputePickupProjections(
  tx: sql.Transaction,
  pickupId: string,
): Promise<void> {
  const result = await request(tx).input("pickupId", sql.VarChar(36), pickupId)
    .query<{
    allocation_id: string;
  }>(`SELECT ta.allocation_id FROM dbo.pickups p
      JOIN dbo.team_assignments ta ON ta.id=p.assignment_id WHERE p.id=@pickupId`);
  if (!result.recordset[0])
    throw new BusinessError("pickup_not_found", "Pickup not found", 404);
  await recomputeAllocation(tx, result.recordset[0].allocation_id);
}

async function recomputeAllocation(
  tx: sql.Transaction,
  allocationId: string,
): Promise<void> {
  await request(tx).input("allocationId", sql.VarChar(36), allocationId)
    .query(`UPDATE ta SET planned_picked_quantity=CASE WHEN picked.total>ta.quantity THEN ta.quantity ELSE picked.total END
      FROM dbo.team_assignments ta CROSS APPLY (SELECT COALESCE(SUM(pe.effective_quantity),0) total
        FROM dbo.pickups p JOIN dbo.pickup_effects pe ON pe.pickup_id=p.id
        WHERE p.assignment_id=ta.id AND pe.effective_source='planned') picked
      WHERE ta.allocation_id=@allocationId;

      UPDATE a SET reserved_remaining=CASE WHEN projection.remaining>0 THEN projection.remaining ELSE 0 END
      FROM dbo.allocations a CROSS APPLY (SELECT a.quantity
        - COALESCE((SELECT SUM(ta.planned_picked_quantity) FROM dbo.team_assignments ta WHERE ta.allocation_id=a.id),0)
        - COALESCE((SELECT SUM(TRY_CONVERT(int,JSON_VALUE(c.details,'$.quantity'))) FROM dbo.corrections c
          WHERE c.kind='release_reserved_remainder' AND JSON_VALUE(c.details,'$.allocationId')=a.id),0) remaining) projection
      WHERE a.id=@allocationId`);
}
