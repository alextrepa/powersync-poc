import {
  column,
  PowerSyncDatabase,
  Schema,
  Table,
  type AbstractPowerSyncDatabase,
  type PowerSyncBackendConnector,
} from "@powersync/web";

const syncProbes = new Table({ message: column.text, created_at: column.text });
const dailyPlans = new Table({
  service_date: column.text,
  team_count: column.integer,
  status: column.text,
  published_at: column.text,
  created_at: column.text,
  updated_at: column.text,
});
const trucks = new Table({
  daily_plan_id: column.text,
  truck_number: column.integer,
});
const allocations = new Table({
  truck_id: column.text,
  lot_id: column.text,
  quantity: column.integer,
  reserved_remaining: column.integer,
  status: column.text,
  created_at: column.text,
});
const teamAssignments = new Table({
  allocation_id: column.text,
  team_number: column.integer,
  quantity: column.integer,
  planned_picked_quantity: column.integer,
});
const products = new Table({
  name: column.text,
  created_at: column.text,
  updated_at: column.text,
});
const lots = new Table({
  product_id: column.text,
  code: column.text,
  location: column.text,
  recorded_quantity: column.integer,
  version: column.integer,
  created_at: column.text,
  updated_at: column.text,
});
const lotFlags = new Table({
  lot_id: column.text,
  reason: column.text,
  status: column.text,
  created_by_team_number: column.integer,
  created_at: column.text,
  cleared_at: column.text,
});
const alternativeClaims = new Table({
  assignment_id: column.text,
  team_number: column.integer,
  lot_id: column.text,
  quantity: column.integer,
  state: column.text,
  operation_id: column.text,
  created_at: column.text,
  updated_at: column.text,
});
const pickups = new Table({
  assignment_id: column.text,
  team_number: column.integer,
  lot_id: column.text,
  quantity: column.integer,
  source: column.text,
  claim_id: column.text,
  operation_id: column.text,
  recorded_at_client: column.text,
  created_at: column.text,
});
const shortageReports = new Table({
  assignment_id: column.text,
  expected_quantity: column.integer,
  picked_quantity: column.integer,
  reason: column.text,
  other_reason: column.text,
  flag_requested: column.integer,
  operation_id: column.text,
  created_at: column.text,
});
const exceptions = new Table({
  type: column.text,
  status: column.text,
  subject_type: column.text,
  subject_id: column.text,
  details: column.text,
  created_at: column.text,
  resolved_at: column.text,
});
const exceptionParticipants = new Table({
  exception_id: column.text,
  plan_id: column.text,
  team_number: column.integer,
  pickup_id: column.text,
});
const corrections = new Table({
  command_id: column.text,
  payload_hash: column.text,
  exception_id: column.text,
  kind: column.text,
  details: column.text,
  created_at: column.text,
});
const truckCompletions = new Table({
  truck_id: column.text,
  team_number: column.integer,
  operation_id: column.text,
  completed_at: column.text,
});
const fieldOperations = new Table({
  operation_id: column.text,
  type: column.text,
  payload: column.text,
  created_at: column.text,
});

export const AppSchema = new Schema({
  sync_probes: syncProbes,
  daily_plans: dailyPlans,
  trucks,
  allocations,
  team_assignments: teamAssignments,
  products,
  lots,
  lot_flags: lotFlags,
  alternative_claims: alternativeClaims,
  pickups,
  shortage_reports: shortageReports,
  exceptions,
  exception_participants: exceptionParticipants,
  corrections,
  truck_completions: truckCompletions,
  field_operations: fieldOperations,
});

class FieldConnector implements PowerSyncBackendConnector {
  async fetchCredentials() {
    const response = await fetch("/api/sync/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    if (!response.ok)
      throw new Error(`Token request failed (${response.status})`);
    const credentials = (await response.json()) as { token: string };
    return {
      endpoint: new URL("/powersync", window.location.origin).toString(),
      token: credentials.token,
    };
  }

  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction();
    if (!transaction) return;
    const operations = transaction.crud
      .filter((item) => item.table === "field_operations" && item.opData)
      .map((item) => {
        const data = item.opData as
          | { operation_id?: string; type?: string; payload?: string }
          | undefined;
        return {
          operationId: data?.operation_id,
          type: data?.type,
          payload: JSON.parse(data?.payload ?? "{}") as Record<string, unknown>,
        };
      });
    if (operations.length > 0) {
      const response = await fetch("/api/field/upload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ operations }),
      });
      if (!response.ok)
        throw new Error(
          `Upload failed (${response.status}): ${await response.text()}`,
        );
    }
    await transaction.complete();
  }
}

export const powerSync = new PowerSyncDatabase({
  database: { dbFilename: "canopy-field.db" },
  schema: AppSchema,
});

export async function initializePowerSync(): Promise<void> {
  await powerSync.init();
  await powerSync.connect(new FieldConnector());
}

export async function queueCommands(
  commands: Array<{ type: string; payload: Record<string, unknown> }>,
): Promise<void> {
  await powerSync.writeTransaction(async (tx) => {
    for (const command of commands) {
      const operationId = crypto.randomUUID();
      await tx.execute(
        "INSERT INTO field_operations (id,operation_id,type,payload,created_at) VALUES (?,?,?,?,?)",
        [
          operationId,
          operationId,
          command.type,
          JSON.stringify(command.payload),
          new Date().toISOString(),
        ],
      );
    }
  });
}

export interface Selection {
  planId: string;
  teamNumber: number;
  date: string;
}
const selectionKey = "canopy-active-package-v1";

export function loadSelection(): Selection | null {
  const value = localStorage.getItem(selectionKey);
  if (!value) return null;
  try {
    return JSON.parse(value) as Selection;
  } catch {
    return null;
  }
}

export function saveSelection(selection: Selection): void {
  localStorage.setItem(selectionKey, JSON.stringify(selection));
  localStorage.setItem("canopy-team-number", String(selection.teamNumber));
}
