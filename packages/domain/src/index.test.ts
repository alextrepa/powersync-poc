import { describe, expect, it } from "vitest";
import {
  calculateFreeQuantity,
  consumedPlannedReservation,
  defaultFlagDecision,
  splitQuantity,
} from "./index.js";

describe("splitQuantity", () => {
  it("gives the remainder to the lowest team numbers and omits zero shares", () => {
    expect(splitQuantity(5, 2)).toEqual([
      { teamNumber: 1, quantity: 3 },
      { teamNumber: 2, quantity: 2 },
    ]);
    expect(splitQuantity(2, 4)).toEqual([
      { teamNumber: 1, quantity: 1 },
      { teamNumber: 2, quantity: 1 },
    ]);
  });

  it("rejects values that cannot represent plant counts and teams", () => {
    expect(() => splitQuantity(-1, 2)).toThrow(RangeError);
    expect(() => splitQuantity(4, 0)).toThrow(RangeError);
    expect(() => splitQuantity(1.5, 2)).toThrow(RangeError);
  });
});

describe("inventory accounting", () => {
  it("subtracts allocations and active claims from recorded inventory", () => {
    expect(
      calculateFreeQuantity({
        recordedQuantity: 10,
        reservedRemaining: 5,
        activeClaims: 2,
      }),
    ).toBe(3);
  });

  it("does not consume planned reservation beyond the assignment remainder", () => {
    expect(consumedPlannedReservation(7, 5)).toBe(5);
  });
});

describe("short-pick defaults", () => {
  it("makes other an explicit choice and no-lot-problem a no-flag choice", () => {
    expect(defaultFlagDecision.other).toBeNull();
    expect(defaultFlagDecision.no_lot_problem).toBe(false);
    expect(defaultFlagDecision.dead_or_damaged).toBe(true);
  });
});
