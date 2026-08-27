/* eslint-disable @typescript-eslint/unbound-method -- React callback props are intentionally forwarded. */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeftRight,
  Check,
  ChevronRight,
  CircleDot,
  Cloud,
  CloudOff,
  Leaf,
  MapPin,
  PackageCheck,
  RefreshCw,
  Route,
  Truck,
  WifiOff,
} from "lucide-react";
import {
  initializePowerSync,
  loadSelection,
  powerSync,
  queueCommands,
  saveSelection,
  type Selection,
} from "./powersync.js";
import "./styles.css";

interface AssignmentRow {
  id: string;
  allocation_id: string;
  team_number: number;
  quantity: number;
  planned_picked_quantity: number;
  truck_id: string;
  truck_number: number;
  lot_id: string;
  lot_code: string;
  location: string;
  product_id: string;
  product_name: string;
}
interface TruckRow {
  id: string;
  daily_plan_id: string;
  truck_number: number;
}
interface LotRow {
  id: string;
  product_id: string;
  code: string;
  location: string;
  recorded_quantity: number;
  reserved: number;
  claimed: number;
  flagged: number;
}
interface ClaimRow {
  id: string;
  assignment_id: string;
  lot_id: string;
  quantity: number;
  state: string;
  code: string;
  location: string;
}
interface ExceptionRow {
  id: string;
  type: string;
  status: string;
  details: string;
  created_at: string;
}
interface PendingRow {
  id: string;
  type: string;
  payload: string;
  created_at: string;
}
interface CompletionRow {
  id: string;
  truck_id: string;
  team_number: number;
}
interface DayData {
  trucks: TruckRow[];
  assignments: AssignmentRow[];
  lots: LotRow[];
  claims: ClaimRow[];
  exceptions: ExceptionRow[];
  pending: PendingRow[];
  completions: CompletionRow[];
}
const emptyDay: DayData = {
  trucks: [],
  assignments: [],
  lots: [],
  claims: [],
  exceptions: [],
  pending: [],
  completions: [],
};
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function useDay(selection: Selection | null) {
  const [data, setData] = useState<DayData>(emptyDay);
  const refresh = useCallback(async () => {
    if (!selection) {
      setData(emptyDay);
      return;
    }
    const params = [selection.planId, selection.teamNumber];
    const [
      trucks,
      assignments,
      lots,
      claims,
      exceptions,
      pending,
      completions,
    ] = await Promise.all([
      powerSync.getAll<TruckRow>(
        "SELECT * FROM trucks WHERE daily_plan_id=? ORDER BY truck_number",
        [selection.planId],
      ),
      powerSync.getAll<AssignmentRow>(
        `SELECT ta.*,t.id truck_id,t.truck_number,a.lot_id,l.code lot_code,l.location,l.product_id,p.name product_name FROM team_assignments ta JOIN allocations a ON a.id=ta.allocation_id JOIN trucks t ON t.id=a.truck_id JOIN lots l ON l.id=a.lot_id JOIN products p ON p.id=l.product_id WHERE t.daily_plan_id=? AND ta.team_number=? ORDER BY t.truck_number,p.name`,
        params,
      ),
      powerSync.getAll<LotRow>(
        `SELECT l.*,COALESCE((SELECT SUM(a.reserved_remaining) FROM allocations a WHERE a.lot_id=l.id AND a.status='active'),0) reserved,COALESCE((SELECT SUM(c.quantity) FROM alternative_claims c WHERE c.lot_id=l.id AND c.state='active'),0) claimed,CASE WHEN EXISTS(SELECT 1 FROM lot_flags f WHERE f.lot_id=l.id AND f.status='active') THEN 1 ELSE 0 END flagged FROM lots l WHERE l.product_id IN (SELECT l2.product_id FROM lots l2 JOIN allocations a2 ON a2.lot_id=l2.id JOIN trucks t2 ON t2.id=a2.truck_id JOIN team_assignments ta2 ON ta2.allocation_id=a2.id WHERE t2.daily_plan_id=? AND ta2.team_number=?)`,
        params,
      ),
      powerSync.getAll<ClaimRow>(
        `SELECT c.*,l.code,l.location FROM alternative_claims c JOIN lots l ON l.id=c.lot_id JOIN team_assignments ta ON ta.id=c.assignment_id JOIN allocations a ON a.id=ta.allocation_id JOIN trucks t ON t.id=a.truck_id WHERE t.daily_plan_id=? AND c.team_number=? ORDER BY c.created_at DESC`,
        params,
      ),
      powerSync.getAll<ExceptionRow>(
        `SELECT e.* FROM exceptions e JOIN exception_participants ep ON ep.exception_id=e.id WHERE ep.plan_id=? AND ep.team_number=? ORDER BY e.created_at DESC`,
        params,
      ),
      powerSync.getAll<PendingRow>(
        "SELECT * FROM field_operations ORDER BY created_at",
      ),
      powerSync.getAll<CompletionRow>(
        "SELECT * FROM truck_completions WHERE team_number=?",
        [selection.teamNumber],
      ),
    ]);
    setData({
      trucks,
      assignments,
      lots,
      claims,
      exceptions,
      pending,
      completions,
    });
  }, [selection]);
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 800);
    return () => window.clearInterval(timer);
  }, [refresh]);
  return data;
}

function FieldApp() {
  const [selection, setSelection] = useState<Selection | null>(() =>
    loadSelection(),
  );
  const [team, setTeam] = useState(
    () => localStorage.getItem("canopy-team-number") ?? "1",
  );
  const [date, setDate] = useState(() => loadSelection()?.date ?? today());
  const [ready, setReady] = useState(() =>
    Boolean(
      loadSelection() &&
      localStorage.getItem(
        `canopy-ready:${loadSelection()?.planId}:${loadSelection()?.teamNumber}`,
      ),
    ),
  );
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(() =>
    localStorage.getItem("canopy-last-sync"),
  );
  const [message, setMessage] = useState<string | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [pickup, setPickup] = useState<AssignmentRow | null>(null);
  const [alternativesFor, setAlternativesFor] = useState<AssignmentRow | null>(
    null,
  );
  const data = useDay(selection);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  useEffect(() => {
    if (!selection) return;
    const controller = new AbortController();
    let disposed = false;
    let subscription: { unsubscribe(): void | Promise<void> } | undefined;
    setSyncing(true);
    void (async () => {
      try {
        const sub = await powerSync
          .syncStream("team_day", {
            plan_id: selection.planId,
            team_number: selection.teamNumber,
          })
          .subscribe();
        subscription = sub;
        if (disposed) {
          sub.unsubscribe();
          return;
        }
        await sub.waitForFirstSync(controller.signal);
        localStorage.setItem(
          `canopy-ready:${selection.planId}:${selection.teamNumber}`,
          new Date().toISOString(),
        );
        const synchronizedAt = new Date().toISOString();
        localStorage.setItem("canopy-last-sync", synchronizedAt);
        setLastSync(synchronizedAt);
        setReady(true);
        setMessage(null);
      } catch (error) {
        if (!controller.signal.aborted && !ready)
          setMessage(
            error instanceof Error
              ? error.message
              : "Could not refresh this route",
          );
      } finally {
        if (!disposed) setSyncing(false);
      }
    })();
    return () => {
      disposed = true;
      controller.abort();
      void subscription?.unsubscribe();
    };
  }, [selection]);
  useEffect(() => {
    if (!online || data.pending.length !== 0 || !ready) return;
    const synchronizedAt = new Date().toISOString();
    localStorage.setItem("canopy-last-sync", synchronizedAt);
    setLastSync(synchronizedAt);
  }, [data.pending.length, online, ready]);
  const openDay = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    setSyncing(true);
    try {
      const response = await fetch(
        `/api/field/day?date=${encodeURIComponent(date)}&team=${encodeURIComponent(team)}`,
      );
      if (!response.ok)
        throw new Error(
          response.status === 404
            ? "No published route for that team and date."
            : "Could not load the route.",
        );
      const result = (await response.json()) as { plan: { id: string } };
      const next = { planId: result.plan.id, teamNumber: Number(team), date };
      saveSelection(next);
      setSelection(next);
      setReady(false);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not load the route.",
      );
    } finally {
      setSyncing(false);
    }
  };
  if (!selection)
    return (
      <TeamEntry
        team={team}
        date={date}
        syncing={syncing}
        message={message}
        onTeam={(value) => setTeam(value)}
        onDate={(value) => setDate(value)}
        onSubmit={(event) => void openDay(event)}
      />
    );
  const pending = data.pending.map((item) => ({
    ...item,
    parsed: JSON.parse(item.payload) as Record<string, unknown>,
  }));
  const pendingCancelledClaims = new Set(
    pending
      .filter((item) => item.type === "cancel_claim")
      .map((item) => String(item.parsed.claimId)),
  );
  const pendingPickedClaims = new Set(
    pending
      .filter((item) => item.type === "alternative_pickup")
      .map((item) => String(item.parsed.claimId)),
  );
  const pendingClaims: ClaimRow[] = pending
    .filter((item) => item.type === "claim_alternative")
    .map((item) => {
      const lot = data.lots.find(
        (candidate) => candidate.id === item.parsed.lotId,
      );
      return {
        id: String(item.parsed.claimId),
        assignment_id: String(item.parsed.assignmentId),
        lot_id: String(item.parsed.lotId),
        quantity: Number(item.parsed.quantity),
        state: "active",
        code: lot?.code ?? "pending",
        location: lot?.location ?? "Saved on this phone",
      };
    });
  const optimisticClaims = [...data.claims, ...pendingClaims]
    .filter(
      (claim, index, all) =>
        all.findIndex((candidate) => candidate.id === claim.id) === index,
    )
    .filter(
      (claim) =>
        claim.state === "active" &&
        !pendingCancelledClaims.has(claim.id) &&
        !pendingPickedClaims.has(claim.id),
    );
  const pendingFlaggedLots = new Set(
    pending.flatMap((item) => {
      if (item.type === "flag_lot") return [String(item.parsed.lotId)];
      if (item.type === "shortage" && item.parsed.flagRequested)
        return [String(item.parsed.lotId)];
      return [];
    }),
  );
  const optimisticLots = data.lots.map((lot) => ({
    ...lot,
    claimed:
      lot.claimed +
      pendingClaims
        .filter(
          (claim) =>
            claim.lot_id === lot.id &&
            !pendingCancelledClaims.has(claim.id) &&
            !pendingPickedClaims.has(claim.id) &&
            !data.claims.some((serverClaim) => serverClaim.id === claim.id),
        )
        .reduce((sum, claim) => sum + claim.quantity, 0),
    flagged: lot.flagged || pendingFlaggedLots.has(lot.id) ? 1 : 0,
  }));
  const pickedFor = (assignment: AssignmentRow) =>
    assignment.planned_picked_quantity +
    pending
      .filter(
        (item) =>
          item.type === "planned_pickup" &&
          item.parsed.assignmentId === assignment.id,
      )
      .reduce((sum, item) => sum + Number(item.parsed.quantity ?? 0), 0);
  return (
    <div className="field-shell">
      <header className="field-header">
        <div className="brand">
          <span className="brand-mark">
            <Leaf size={19} />
          </span>
          <span>Canopy</span>
        </div>
        <button className="team-switcher" onClick={() => setSelection(null)}>
          Team {selection.teamNumber}
          <ChevronRight size={17} />
        </button>
      </header>
      <main>
        <section className="route-heading">
          <div>
            <p className="eyebrow">
              TODAY ·{" "}
              {new Date(`${selection.date}T12:00:00`)
                .toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })
                .toUpperCase()}
            </p>
            <h1>Your pickup route</h1>
            <p>
              {data.trucks.length} trucks · {data.assignments.length} plant lots
            </p>
          </div>
          <div className={`readiness ${ready ? "ready" : ""}`}>
            <span className="pulse-dot" />
            {ready
              ? "Ready offline"
              : syncing
                ? "Downloading route"
                : "Needs connection"}
          </div>
        </section>
        <section className="sync-strip">
          <Status
            icon={online ? <Cloud /> : <CloudOff />}
            title={online ? "Online" : "Offline"}
            detail={online ? "Sync available" : "Changes stay on this phone"}
          />
          <Status
            icon={<RefreshCw className={syncing ? "spin" : ""} />}
            title={`${data.pending.length} queued`}
            detail={
              data.pending.length
                ? "Waiting to upload"
                : lastSync
                  ? `Last sync ${new Date(lastSync).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}`
                  : "Everything uploaded"
            }
          />
          <Status
            icon={<CircleDot />}
            title={`${data.exceptions.filter((x) => x.status === "open").length} exceptions`}
            detail="Review with office"
          />
        </section>
        {message && (
          <div className="notice error">
            <AlertTriangle />
            {message}
          </div>
        )}
        {data.exceptions.some((x) => x.status === "open") && (
          <section className="exception-banner">
            <AlertTriangle />
            <div>
              <b>Office review needed</b>
              <span>
                {data.exceptions
                  .filter((x) => x.status === "open")
                  .map((x) => x.type.replaceAll("_", " "))
                  .join(" · ")}
              </span>
            </div>
          </section>
        )}
        <div className="truck-list">
          {data.trucks.map((truck) => {
            const assignments = data.assignments.filter(
              (x) => x.truck_id === truck.id,
            );
            const complete = assignments.filter(
              (x) => pickedFor(x) >= x.quantity,
            ).length;
            const completionQueued = pending.some(
              (item) =>
                item.type === "complete_truck" &&
                item.parsed.truckId === truck.id,
            );
            const truckCompleted =
              completionQueued ||
              data.completions.some((item) => item.truck_id === truck.id);
            return (
              <section className="truck-card" key={truck.id}>
                <div className="truck-card-head">
                  <div className="truck-number">
                    <Truck />
                    <span>
                      <small>TRUCK</small>
                      {truck.truck_number}
                    </span>
                  </div>
                  <div className="truck-progress">
                    <span>
                      {complete}/{assignments.length} lots
                    </span>
                    <div>
                      <i
                        style={{
                          width: `${assignments.length ? (complete / assignments.length) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
                <div>
                  {assignments.map((assignment) => {
                    const picked = pickedFor(assignment),
                      done = picked >= assignment.quantity;
                    return (
                      <article
                        className={`assignment ${done ? "done" : ""}`}
                        key={assignment.id}
                      >
                        <div className="plant-glyph">
                          <Leaf />
                        </div>
                        <div className="assignment-main">
                          <h3>{assignment.product_name}</h3>
                          <p>
                            <MapPin /> {assignment.location} · Lot{" "}
                            {assignment.lot_code}
                          </p>
                          <div className="quantity-line">
                            <b>{picked}</b>
                            <span>/ {assignment.quantity} picked</span>
                          </div>
                        </div>
                        <div className="assignment-actions">
                          {done ? (
                            <span className="done-pill">
                              <Check /> Done
                            </span>
                          ) : (
                            <>
                              <button
                                className="primary small"
                                onClick={() => setPickup(assignment)}
                              >
                                Record pickup
                              </button>
                              <button
                                className="text-button"
                                onClick={() => setAlternativesFor(assignment)}
                              >
                                <ArrowLeftRight /> Other lot
                              </button>
                            </>
                          )}
                        </div>
                      </article>
                    );
                  })}
                  {assignments.length === 0 && (
                    <div className="empty-truck-copy">
                      No pickups were assigned to this team for this truck.
                    </div>
                  )}
                </div>
                <button
                  className="complete-truck"
                  disabled={truckCompleted}
                  onClick={() =>
                    void queueCommands([
                      {
                        type: "complete_truck",
                        payload: {
                          truckId: truck.id,
                          teamNumber: selection.teamNumber,
                        },
                      },
                    ])
                  }
                >
                  <PackageCheck />
                  {truckCompleted ? "Truck complete" : "Mark truck complete"}
                </button>
              </section>
            );
          })}
          {data.trucks.length === 0 && (
            <div className="empty-state">
              <Route />
              <h2>No local route yet</h2>
              <p>
                {online
                  ? "The package is still downloading."
                  : "Reconnect once to download this route."}
              </p>
            </div>
          )}
        </div>
      </main>
      <footer className="field-footer">
        <span>
          {online ? <Cloud /> : <WifiOff />}
          {online ? "Connected" : "Working offline"}
        </span>
        <span>
          {data.pending.length
            ? `${data.pending.length} changes saved`
            : "All changes saved"}
        </span>
      </footer>
      {pickup && (
        <PickupDialog
          assignment={pickup}
          onClose={() => setPickup(null)}
          onSave={async (commands) => {
            await queueCommands(commands);
            setPickup(null);
          }}
        />
      )}
      {alternativesFor && (
        <AlternativesDialog
          assignment={alternativesFor}
          lots={optimisticLots.filter(
            (l) =>
              l.product_id === alternativesFor.product_id &&
              l.id !== alternativesFor.lot_id,
          )}
          claims={optimisticClaims.filter(
            (c) =>
              c.assignment_id === alternativesFor.id && c.state === "active",
          )}
          teamNumber={selection.teamNumber}
          onClose={() => setAlternativesFor(null)}
        />
      )}
    </div>
  );
}
function Status({
  icon,
  title,
  detail,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <div>
      {icon}
      <span>
        <b>{title}</b>
        <small>{detail}</small>
      </span>
    </div>
  );
}
function TeamEntry(p: {
  team: string;
  date: string;
  syncing: boolean;
  message: string | null;
  onTeam(v: string): void;
  onDate(v: string): void;
  onSubmit(e: React.FormEvent): void;
}) {
  return (
    <main className="entry-page">
      <section className="entry-illustration">
        <div className="sun" />
        <div className="rows" />
        <div className="entry-brand">
          <Leaf /> CANOPY FIELD
        </div>
        <blockquote>
          “A full route in your pocket,
          <br />
          even beyond the signal.”
        </blockquote>
      </section>
      <section className="entry-panel">
        <div className="entry-form">
          <p className="eyebrow">FIELD OPERATIONS</p>
          <h1>Start your route</h1>
          <p className="lede">
            Enter the team number assigned at the loading bay. We’ll save the
            entire day to this phone.
          </p>
          <form onSubmit={p.onSubmit}>
            <label>
              Team number
              <input
                inputMode="numeric"
                min="1"
                required
                value={p.team}
                onChange={(e) => p.onTeam(e.target.value)}
              />
            </label>
            <label>
              Route date
              <input
                type="date"
                required
                value={p.date}
                onChange={(e) => p.onDate(e.target.value)}
              />
            </label>
            {p.message && (
              <div className="notice error">
                <AlertTriangle />
                {p.message}
              </div>
            )}
            <button className="primary entry-submit" disabled={p.syncing}>
              {p.syncing ? <RefreshCw className="spin" /> : <Route />}Load my
              route
            </button>
          </form>
          <div className="offline-note">
            <WifiOff />
            <span>
              <b>Built for the field</b>Once loaded, your route works without a
              connection.
            </span>
          </div>
        </div>
      </section>
    </main>
  );
}
const reasons = [
  ["dead_or_damaged", "Dead or damaged", true],
  ["incorrect_count", "Incorrect count", true],
  ["inaccessible_lot", "Lot inaccessible", true],
  ["wrong_product", "Wrong product", true],
  ["no_lot_problem", "No problem with lot", false],
  ["other", "Other", null],
] as const;
function PickupDialog({
  assignment,
  onClose,
  onSave,
}: {
  assignment: AssignmentRow;
  onClose(): void;
  onSave(
    c: Array<{ type: string; payload: Record<string, unknown> }>,
  ): Promise<void>;
}) {
  const remaining = Math.max(
    0,
    assignment.quantity - assignment.planned_picked_quantity,
  );
  const [quantity, setQuantity] = useState(String(remaining)),
    [reason, setReason] = useState(""),
    [other, setOther] = useState(""),
    [flag, setFlag] = useState<boolean | null>(null);
  const actual = Number(quantity),
    short = actual < remaining;
  useEffect(() => {
    const match = reasons.find(([v]) => v === reason);
    if (match) setFlag(match[2]);
  }, [reason]);
  const save = async () => {
    if (
      actual > remaining &&
      !window.confirm(
        `This is ${actual - remaining} over the assignment. Record the physical pickup?`,
      )
    )
      return;
    const commands: Array<{ type: string; payload: Record<string, unknown> }> =
      [
        {
          type: "planned_pickup",
          payload: {
            assignmentId: assignment.id,
            lotId: assignment.lot_id,
            quantity: actual,
            recordedAtClient: new Date().toISOString(),
          },
        },
      ];
    if (short)
      commands.push({
        type: "shortage",
        payload: {
          assignmentId: assignment.id,
          lotId: assignment.lot_id,
          teamNumber: assignment.team_number,
          expectedQuantity: remaining,
          pickedQuantity: actual,
          reason,
          otherReason: other || undefined,
          flagRequested: Boolean(flag),
          flagReason: other || reason,
        },
      });
    await onSave(commands);
  };
  return (
    <div className="dialog-backdrop">
      <section className="dialog">
        <button className="dialog-close" onClick={onClose}>
          ×
        </button>
        <p className="eyebrow">LOT {assignment.lot_code}</p>
        <h2>Record {assignment.product_name}</h2>
        <p className="dialog-location">
          <MapPin /> {assignment.location}
        </p>
        <label>
          Plants picked
          <input
            className="quantity-input"
            type="number"
            min="0"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </label>
        <p className="expected">
          Assigned remaining <b>{remaining}</b>
        </p>
        {short && (
          <div className="shortage-fields">
            <h3>Why are {remaining - actual} plants left?</h3>
            {reasons.map(([v, label]) => (
              <label className="radio" key={v}>
                <input
                  type="radio"
                  checked={reason === v}
                  onChange={() => setReason(v)}
                />
                <span>{label}</span>
              </label>
            ))}
            {reason === "other" && (
              <textarea
                placeholder="Describe what happened"
                value={other}
                onChange={(e) => setOther(e.target.value)}
              />
            )}{" "}
            {reason && (
              <label className="flag-choice">
                <input
                  type="checkbox"
                  checked={Boolean(flag)}
                  onChange={(e) => setFlag(e.target.checked)}
                />
                <span>
                  <b>Flag this whole lot unavailable</b>Other teams will see the
                  warning after sync.
                </span>
              </label>
            )}
          </div>
        )}
        <button
          className="primary dialog-save"
          disabled={
            !Number.isFinite(actual) ||
            actual < 0 ||
            (short &&
              (!reason ||
                (reason === "other" && !other.trim()) ||
                flag === null))
          }
          onClick={() => void save()}
        >
          <Check />
          Save pickup
        </button>
        <p className="save-hint">
          Saved on this phone first. Safe to close offline.
        </p>
      </section>
    </div>
  );
}
function AlternativesDialog({
  assignment,
  lots,
  claims,
  teamNumber,
  onClose,
}: {
  assignment: AssignmentRow;
  lots: LotRow[];
  claims: ClaimRow[];
  teamNumber: number;
  onClose(): void;
}) {
  const sorted = useMemo(
    () =>
      [...lots].sort(
        (a, b) =>
          b.recorded_quantity -
          b.reserved -
          b.claimed -
          (a.recorded_quantity - a.reserved - a.claimed),
      ),
    [lots],
  );
  return (
    <div className="dialog-backdrop">
      <section className="dialog wide">
        <button className="dialog-close" onClick={onClose}>
          ×
        </button>
        <p className="eyebrow">ALTERNATIVE SOURCE</p>
        <h2>Find another {assignment.product_name} lot</h2>
        <p className="lede compact">
          Availability is the last synchronized estimate. Confirm the physical
          lot before picking.
        </p>
        {claims.map((c) => (
          <div className="active-claim" key={c.id}>
            <div>
              <b>Claimed · Lot {c.code}</b>
              <span>
                {c.location} · {c.quantity} plants
              </span>
            </div>
            <button
              onClick={() =>
                void queueCommands([
                  { type: "cancel_claim", payload: { claimId: c.id } },
                ])
              }
            >
              Cancel
            </button>
            <button
              className="primary small"
              onClick={() =>
                void queueCommands([
                  {
                    type: "alternative_pickup",
                    payload: {
                      assignmentId: assignment.id,
                      lotId: c.lot_id,
                      claimId: c.id,
                      quantity: c.quantity,
                      recordedAtClient: new Date().toISOString(),
                    },
                  },
                ])
              }
            >
              Picked
            </button>
          </div>
        ))}
        <div className="alternative-list">
          {sorted.map((l) => {
            const free = l.recorded_quantity - l.reserved - l.claimed;
            return (
              <article
                className={`alternative ${l.flagged ? "flagged" : ""}`}
                key={l.id}
              >
                <div>
                  <b>Lot {l.code}</b>
                  <span>
                    <MapPin />
                    {l.location}
                  </span>
                </div>
                <div className="availability">
                  <b>{free}</b>
                  <span>estimated free</span>
                </div>
                <button
                  disabled={Boolean(l.flagged)}
                  onClick={() => {
                    if (
                      free < assignment.quantity &&
                      !window.confirm(
                        "The synchronized estimate is insufficient. Claim this lot anyway?",
                      )
                    )
                      return;
                    const claimId = crypto.randomUUID();
                    void queueCommands([
                      {
                        type: "claim_alternative",
                        payload: {
                          claimId,
                          assignmentId: assignment.id,
                          lotId: l.id,
                          teamNumber,
                          quantity: assignment.quantity,
                        },
                      },
                    ]);
                  }}
                >
                  {l.flagged ? "Unavailable" : "Claim lot"}
                </button>
              </article>
            );
          })}
          {!sorted.length && (
            <p className="empty-copy">
              No other lots were included for this product.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
const rootRoute = createRootRoute({ component: FieldApp });
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => null,
});
const router = createRouter({ routeTree: rootRoute.addChildren([indexRoute]) });
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
const element = document.getElementById("root");
if (!element) throw new Error("Missing root element");
createRoot(element).render(
  <React.StrictMode>
    <PowerSyncGate />
  </React.StrictMode>,
);
function PowerSyncGate() {
  const [state, setState] = useState<"starting" | "ready" | "error">(
    "starting",
  );
  useEffect(() => {
    void initializePowerSync()
      .then(() => setState("ready"))
      .catch((error) => {
        console.error("PowerSync initialization failed", error);
        setState("error");
      });
  }, []);
  if (state === "starting")
    return (
      <div className="boot">
        <Leaf />
        <span>Opening your field notebook…</span>
      </div>
    );
  if (state === "error")
    return (
      <div className="boot error">
        <AlertTriangle />
        <span>
          Local storage could not start. Reload before leaving the bay.
        </span>
      </div>
    );
  return <RouterProvider router={router} />;
}
