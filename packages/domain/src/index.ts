import { z } from "zod";

export const serviceHealthSchema = z.object({
  status: z.literal("ok"),
  service: z.string().min(1),
  timestamp: z.string().datetime(),
});

export type ServiceHealth = z.infer<typeof serviceHealthSchema>;

export const planStatusSchema = z.enum(["draft", "published"]);
export const claimStateSchema = z.enum(["active", "picked", "cancelled"]);
export const shortageReasonSchema = z.enum([
  "dead_or_damaged",
  "incorrect_count",
  "inaccessible_lot",
  "wrong_product",
  "no_lot_problem",
  "other",
]);

export const defaultFlagDecision: Readonly<
  Record<z.infer<typeof shortageReasonSchema>, boolean | null>
> = {
  dead_or_damaged: true,
  incorrect_count: true,
  inaccessible_lot: true,
  wrong_product: true,
  no_lot_problem: false,
  other: null,
};

export interface TeamShare {
  teamNumber: number;
  quantity: number;
}

export function splitQuantity(
  quantity: number,
  teamCount: number,
): TeamShare[] {
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new RangeError("quantity must be a non-negative integer");
  }
  if (!Number.isSafeInteger(teamCount) || teamCount < 1) {
    throw new RangeError("teamCount must be a positive integer");
  }

  const base = Math.floor(quantity / teamCount);
  const remainder = quantity % teamCount;

  return Array.from({ length: teamCount }, (_, index) => ({
    teamNumber: index + 1,
    quantity: base + (index < remainder ? 1 : 0),
  })).filter((share) => share.quantity > 0);
}

export function calculateFreeQuantity(input: {
  recordedQuantity: number;
  reservedRemaining: number;
  activeClaims: number;
}): number {
  return input.recordedQuantity - input.reservedRemaining - input.activeClaims;
}

export function consumedPlannedReservation(
  actualQuantity: number,
  assignmentRemaining: number,
): number {
  if (actualQuantity < 0 || assignmentRemaining < 0) {
    throw new RangeError("quantities must be non-negative");
  }
  return Math.min(actualQuantity, assignmentRemaining);
}
