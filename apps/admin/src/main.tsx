/* eslint-disable @typescript-eslint/unbound-method -- React callback props are intentionally forwarded. */
import { StrictMode, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import {
  AlertTriangle,
  Boxes,
  CalendarDays,
  Check,
  ChevronRight,
  CircleDot,
  ClipboardList,
  Flag,
  Leaf,
  PackagePlus,
  Plus,
  RefreshCw,
  Route,
  Truck,
  Users,
} from "lucide-react";
import "./styles.css";

type View = "overview" | "inventory" | "planning" | "operations";
interface Product {
  id: string;
  name: string;
}
interface Lot {
  id: string;
  product_id: string;
  product_name: string;
  code: string;
  location: string;
  recorded_quantity: number;
  reserved_remaining: number;
  active_claims: number;
  active_flag_id?: string;
  active_flag_reason?: string;
}
interface Plan {
  id: string;
  service_date: string;
  team_count: number;
  status: string;
  truck_count: number;
  allocated_quantity: number;
}
interface PlanDetail {
  plan: Plan;
  trucks: Array<{
    id: string;
    truck_number: number;
    allocation_id?: string;
    lot_id?: string;
    quantity?: number;
    reserved_remaining?: number;
    lot_code?: string;
    product_name?: string;
  }>;
}
interface Ops {
  pickups: Array<Record<string, unknown>>;
  claims: Array<Record<string, unknown>>;
  exceptions: Array<Record<string, unknown>>;
  corrections: Array<Record<string, unknown>>;
}
const api = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const error = (await response
      .json()
      .catch(() => ({ message: `Request failed (${response.status})` }))) as {
      message?: string;
    };
    throw new Error(error.message ?? `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
};
interface CorrectionDraft {
  kind: string;
  exceptionId?: string;
  details: Record<string, unknown>;
}
interface PendingCorrection extends CorrectionDraft {
  commandId: string;
}
const pendingCorrectionKey = "canopy-admin-pending-correction-v1";

async function submitCorrection(draft: CorrectionDraft): Promise<unknown> {
  const saved = localStorage.getItem(pendingCorrectionKey);
  let pending: PendingCorrection | null = saved
    ? (JSON.parse(saved) as PendingCorrection)
    : null;
  const signature = JSON.stringify(draft);
  if (
    pending &&
    JSON.stringify({
      kind: pending.kind,
      exceptionId: pending.exceptionId,
      details: pending.details,
    }) !== signature
  ) {
    const operations = await api<Ops>("/operations");
    if (
      operations.corrections.some(
        (item) => item.command_id === pending?.commandId,
      )
    ) {
      localStorage.removeItem(pendingCorrectionKey);
      pending = null;
    } else {
      throw new Error(
        "A previous correction has an uncertain result. Retry that same action before starting another.",
      );
    }
  }
  pending ??= { ...draft, commandId: crypto.randomUUID() };
  localStorage.setItem(pendingCorrectionKey, JSON.stringify(pending));
  try {
    const result = await api("/corrections", {
      method: "POST",
      body: JSON.stringify(pending),
    });
    localStorage.removeItem(pendingCorrectionKey);
    return result;
  } catch (error) {
    try {
      const operations = await api<Ops>("/operations");
      if (
        operations.corrections.some(
          (item) => item.command_id === pending?.commandId,
        )
      ) {
        localStorage.removeItem(pendingCorrectionKey);
        return { reconciled: true };
      }
    } catch {
      // Keep the exact command in local storage for a later retry.
    }
    throw error;
  }
}
const dateValue = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

function AdminApp() {
  const [view, setView] = useState<View>("overview");
  const [products, setProducts] = useState<Product[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [ops, setOps] = useState<Ops>({
    pickups: [],
    claims: [],
    exceptions: [],
    corrections: [],
  });
  const [selectedPlan, setSelectedPlan] = useState<PlanDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const [p, l, d, o] = await Promise.all([
        api<Product[]>("/products"),
        api<Lot[]>("/lots"),
        api<Plan[]>("/plans"),
        api<Ops>("/operations"),
      ]);
      setProducts(p);
      setLots(l);
      setPlans(d);
      setOps(o);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not refresh");
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const openPlan = async (id: string) => {
    setSelectedPlan(await api<PlanDetail>(`/plans/${id}`));
    setView("planning");
  };
  const action = async (work: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await work();
      await refresh();
      if (selectedPlan)
        setSelectedPlan(
          await api<PlanDetail>(`/plans/${selectedPlan.plan.id}`),
        );
      setError(null);
    } catch (e) {
      await refresh();
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };
  const openExceptions = ops.exceptions.filter(
      (x) => x.status === "open",
    ).length,
    activeFlags = lots.filter((l) => l.active_flag_id).length;
  return (
    <div className="admin-shell">
      <aside>
        <div className="admin-brand">
          <span>
            <Leaf />
          </span>
          <div>
            <b>Canopy</b>
            <small>OPERATIONS</small>
          </div>
        </div>
        <nav>
          <Nav
            active={view === "overview"}
            icon={<Route />}
            label="Day overview"
            onClick={() => setView("overview")}
          />
          <Nav
            active={view === "inventory"}
            icon={<Boxes />}
            label="Inventory"
            count={activeFlags || undefined}
            onClick={() => setView("inventory")}
          />
          <Nav
            active={view === "planning"}
            icon={<CalendarDays />}
            label="Route planning"
            onClick={() => setView("planning")}
          />
          <Nav
            active={view === "operations"}
            icon={<ClipboardList />}
            label="Field activity"
            count={openExceptions || undefined}
            onClick={() => setView("operations")}
          />
        </nav>
        <div className="system-card">
          <span className="live-dot" />
          <div>
            <b>Local stack online</b>
            <small>SQL Server · PowerSync</small>
          </div>
        </div>
      </aside>
      <section className="workspace">
        <header>
          <div>
            <p className="crumb">DISPATCH DESK / {view.toUpperCase()}</p>
            <h1>
              {view === "overview"
                ? "Good morning."
                : view === "inventory"
                  ? "Inventory & lots"
                  : view === "planning"
                    ? "Route planning"
                    : "Field activity"}
            </h1>
          </div>
          <button
            className="icon-button"
            onClick={() => void refresh()}
            aria-label="Refresh"
          >
            <RefreshCw />
          </button>
        </header>
        {error && (
          <div className="admin-alert">
            <AlertTriangle />
            {error}
          </div>
        )}
        {view === "overview" && (
          <Overview
            plans={plans}
            lots={lots}
            exceptions={openExceptions}
            openPlan={openPlan}
            setView={setView}
          />
        )}{" "}
        {view === "inventory" && (
          <Inventory
            products={products}
            lots={lots}
            busy={busy}
            action={action}
          />
        )}{" "}
        {view === "planning" && (
          <Planning
            plans={plans}
            detail={selectedPlan}
            lots={lots}
            busy={busy}
            action={action}
            openPlan={openPlan}
          />
        )}{" "}
        {view === "operations" && (
          <Operations ops={ops} lots={lots} busy={busy} action={action} />
        )}
      </section>
    </div>
  );
}
function Nav(p: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  count?: number | undefined;
  onClick(): void;
}) {
  return (
    <button className={p.active ? "active" : ""} onClick={() => p.onClick()}>
      {p.icon}
      <span>{p.label}</span>
      {p.count && <i>{p.count}</i>}
    </button>
  );
}
function Overview({
  plans,
  lots,
  exceptions,
  openPlan,
  setView,
}: {
  plans: Plan[];
  lots: Lot[];
  exceptions: number;
  openPlan(id: string): Promise<void>;
  setView(v: View): void;
}) {
  const published = plans.find((p) => p.status === "published");
  return (
    <>
      <section className="metrics">
        <Metric
          icon={<Truck />}
          label="TODAY'S TRUCKS"
          value={String(published?.truck_count ?? 0)}
          note={published ? "Published and ready" : "No published plan"}
        />
        <Metric
          icon={<Users />}
          label="FIELD TEAMS"
          value={String(published?.team_count ?? 0)}
          note="Numbered automatically"
        />
        <Metric
          icon={<Flag />}
          label="FLAGGED LOTS"
          value={String(lots.filter((l) => l.active_flag_id).length)}
          note="Unavailable for rerouting"
          warning
        />
        <Metric
          icon={<AlertTriangle />}
          label="OPEN EXCEPTIONS"
          value={String(exceptions)}
          note="Needs office review"
          warning={exceptions > 0}
        />
      </section>
      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="kicker">ROUTE BOARD</p>
            <h2>Recent plans</h2>
          </div>
          <button onClick={() => setView("planning")}>
            <Plus />
            New plan
          </button>
        </div>
        <div className="route-table">
          {plans.slice(0, 6).map((plan) => (
            <button key={plan.id} onClick={() => void openPlan(plan.id)}>
              <span className={`date-tile ${plan.status}`}>
                <b>{new Date(plan.service_date).getUTCDate()}</b>
                <small>
                  {new Date(plan.service_date)
                    .toLocaleDateString(undefined, {
                      month: "short",
                      timeZone: "UTC",
                    })
                    .toUpperCase()}
                </small>
              </span>
              <span>
                <b>{dateValue(plan.service_date)}</b>
                <small>
                  {plan.truck_count} trucks · {plan.team_count} teams ·{" "}
                  {plan.allocated_quantity} plants
                </small>
              </span>
              <em className={plan.status}>{plan.status}</em>
              <ChevronRight />
            </button>
          ))}
          {!plans.length && <Empty text="Create the first pickup plan." />}
        </div>
      </section>
    </>
  );
}
function Metric({
  icon,
  label,
  value,
  note,
  warning,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note: string;
  warning?: boolean;
}) {
  return (
    <article className={`metric ${warning ? "warning" : ""}`}>
      <div>
        {icon}
        <span>{label}</span>
      </div>
      <b>{value}</b>
      <small>{note}</small>
    </article>
  );
}
function Inventory({
  products,
  lots,
  busy,
  action,
}: {
  products: Product[];
  lots: Lot[];
  busy: boolean;
  action(w: () => Promise<unknown>): Promise<void>;
}) {
  const [product, setProduct] = useState("");
  const [lot, setLot] = useState({
    productId: "",
    code: "",
    location: "",
    quantity: "10",
  });
  return (
    <div className="two-columns">
      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="kicker">CATALOG</p>
            <h2>Products</h2>
          </div>
        </div>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            void action(() =>
              api("/products", {
                method: "POST",
                body: JSON.stringify({ name: product }),
              }),
            ).then(() => setProduct(""));
          }}
        >
          <input
            placeholder="Plant name"
            value={product}
            onChange={(e) => setProduct(e.target.value)}
            required
          />
          <button disabled={busy}>
            <Plus />
            Add
          </button>
        </form>
        <div className="simple-list">
          {products.map((p) => (
            <div key={p.id}>
              <span className="plant-icon">
                <Leaf />
              </span>
              <b>{p.name}</b>
              <small>
                {lots.filter((l) => l.product_id === p.id).length} lots
              </small>
              <button
                className="quiet-action"
                onClick={() => {
                  const name = prompt("Product name", p.name)?.trim();
                  if (name && name !== p.name)
                    void action(() =>
                      api(`/products/${p.id}`, {
                        method: "PUT",
                        body: JSON.stringify({ name }),
                      }),
                    );
                }}
              >
                Rename
              </button>
            </div>
          ))}
        </div>
      </section>
      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="kicker">STOCK SOURCES</p>
            <h2>Lots</h2>
          </div>
        </div>
        <form
          className="lot-form"
          onSubmit={(e) => {
            e.preventDefault();
            void action(() =>
              api("/lots", {
                method: "POST",
                body: JSON.stringify({
                  ...lot,
                  recordedQuantity: Number(lot.quantity),
                }),
              }),
            );
          }}
        >
          <select
            value={lot.productId}
            onChange={(e) => setLot({ ...lot, productId: e.target.value })}
            required
          >
            <option value="">Product…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <input
            placeholder="Lot code"
            value={lot.code}
            onChange={(e) => setLot({ ...lot, code: e.target.value })}
            required
          />
          <input
            placeholder="Location"
            value={lot.location}
            onChange={(e) => setLot({ ...lot, location: e.target.value })}
            required
          />
          <input
            type="number"
            min="0"
            value={lot.quantity}
            onChange={(e) => setLot({ ...lot, quantity: e.target.value })}
          />
          <button disabled={busy}>
            <PackagePlus />
            Create lot
          </button>
        </form>
        <div className="lot-list">
          {lots.map((l) => (
            <article key={l.id} className={l.active_flag_id ? "flagged" : ""}>
              <div>
                <b>{l.product_name}</b>
                <span>
                  Lot {l.code} · {l.location}
                </span>
              </div>
              <div className="stock">
                <b>
                  {l.recorded_quantity - l.reserved_remaining - l.active_claims}
                </b>
                <span>free</span>
              </div>
              <div className="lot-actions">
                <button
                  onClick={() => {
                    const value = prompt(
                      "Recorded quantity",
                      String(l.recorded_quantity),
                    );
                    if (value === null) return;
                    const quantity = Number(value);
                    if (Number.isInteger(quantity) && quantity >= 0)
                      void action(() =>
                        submitCorrection({
                          kind: "inventory_recount",
                          details: {
                            lotId: l.id,
                            quantity,
                            note: "Admin inventory recount",
                          },
                        }),
                      );
                  }}
                >
                  Recount
                </button>
                {l.active_flag_id ? (
                  <>
                    <em>
                      <Flag /> {l.active_flag_reason}
                    </em>
                    <button
                      onClick={() =>
                        void action(() =>
                          api(`/flags/${l.active_flag_id}/clear`, {
                            method: "POST",
                          }),
                        )
                      }
                    >
                      Clear
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => {
                      const reason = prompt("Why is this lot unavailable?");
                      if (reason)
                        void action(() =>
                          api(`/lots/${l.id}/flags`, {
                            method: "POST",
                            body: JSON.stringify({ reason }),
                          }),
                        );
                    }}
                  >
                    Flag
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
function Planning({
  plans,
  detail,
  lots,
  busy,
  action,
  openPlan,
}: {
  plans: Plan[];
  detail: PlanDetail | null;
  lots: Lot[];
  busy: boolean;
  action(w: () => Promise<unknown>): Promise<void>;
  openPlan(id: string): Promise<void>;
}) {
  const [form, setForm] = useState({
    serviceDate: new Date().toISOString().slice(0, 10),
    teamCount: "2",
    truckCount: "2",
  });
  const [allocation, setAllocation] = useState({
    id: "",
    truckId: "",
    lotId: "",
    quantity: "5",
  });
  const [preview, setPreview] = useState<
    Array<{
      allocation_id: string;
      truck_number: number;
      product_name: string;
      lot_code: string;
      teamNumber: number;
      quantity: number;
    }>
  >([]);
  useEffect(() => setPreview([]), [detail?.plan.id]);
  return (
    <div className="planning-grid">
      <section className="panel plan-list">
        <div className="panel-head">
          <div>
            <p className="kicker">SCHEDULE</p>
            <h2>Plans</h2>
          </div>
        </div>
        <form
          className="stack-form"
          onSubmit={(e) => {
            e.preventDefault();
            void action(() =>
              api("/plans", {
                method: "POST",
                body: JSON.stringify({
                  serviceDate: form.serviceDate,
                  teamCount: Number(form.teamCount),
                  truckCount: Number(form.truckCount),
                }),
              }),
            );
          }}
        >
          <label>
            Date
            <input
              type="date"
              value={form.serviceDate}
              onChange={(e) =>
                setForm({ ...form, serviceDate: e.target.value })
              }
            />
          </label>
          <div>
            <label>
              Teams
              <input
                type="number"
                min="1"
                value={form.teamCount}
                onChange={(e) =>
                  setForm({ ...form, teamCount: e.target.value })
                }
              />
            </label>
            <label>
              Trucks
              <input
                type="number"
                min="1"
                value={form.truckCount}
                onChange={(e) =>
                  setForm({ ...form, truckCount: e.target.value })
                }
              />
            </label>
          </div>
          <button disabled={busy}>
            <Plus />
            Create draft
          </button>
        </form>
        <div className="plan-buttons">
          {plans.map((p) => (
            <button
              key={p.id}
              onClick={() => void openPlan(p.id)}
              className={detail?.plan.id === p.id ? "active" : ""}
            >
              <span>
                <b>{dateValue(p.service_date)}</b>
                <small>
                  {p.team_count} teams · {p.truck_count} trucks
                </small>
              </span>
              <em className={p.status}>{p.status}</em>
            </button>
          ))}
        </div>
      </section>
      <section className="panel plan-detail">
        {detail ? (
          <>
            <div className="panel-head">
              <div>
                <p className="kicker">
                  {detail.plan.status.toUpperCase()} PLAN
                </p>
                <h2>{dateValue(detail.plan.service_date)}</h2>
              </div>
              {detail.plan.status === "draft" && (
                <div className="plan-actions">
                  <button
                    onClick={() =>
                      void api<typeof preview>(
                        `/plans/${detail.plan.id}/preview`,
                      ).then(setPreview)
                    }
                  >
                    Preview split
                  </button>
                  <button
                    className="publish"
                    onClick={() =>
                      void action(() =>
                        api(`/plans/${detail.plan.id}/publish`, {
                          method: "POST",
                        }),
                      )
                    }
                  >
                    <Check />
                    Publish route
                  </button>
                </div>
              )}
            </div>
            {detail.plan.status === "draft" && (
              <form
                className="allocation-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void action(() =>
                    api("/allocations", {
                      method: "POST",
                      body: JSON.stringify({
                        ...(allocation.id ? { id: allocation.id } : {}),
                        truckId: allocation.truckId,
                        lotId: allocation.lotId,
                        quantity: Number(allocation.quantity),
                      }),
                    }),
                  ).then(() =>
                    setAllocation({
                      id: "",
                      truckId: "",
                      lotId: "",
                      quantity: "5",
                    }),
                  );
                }}
              >
                <select
                  value={allocation.truckId}
                  onChange={(e) =>
                    setAllocation({ ...allocation, truckId: e.target.value })
                  }
                  required
                >
                  <option value="">Truck…</option>
                  {[
                    ...new Map(detail.trucks.map((t) => [t.id, t])).values(),
                  ].map((t) => (
                    <option key={t.id} value={t.id}>
                      Truck {t.truck_number}
                    </option>
                  ))}
                </select>
                <select
                  value={allocation.lotId}
                  onChange={(e) =>
                    setAllocation({ ...allocation, lotId: e.target.value })
                  }
                  required
                >
                  <option value="">Lot…</option>
                  {lots
                    .filter((l) => !l.active_flag_id)
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.product_name} · {l.code} (
                        {l.recorded_quantity -
                          l.reserved_remaining -
                          l.active_claims}{" "}
                        free)
                      </option>
                    ))}
                </select>
                <input
                  type="number"
                  min="1"
                  value={allocation.quantity}
                  onChange={(e) =>
                    setAllocation({ ...allocation, quantity: e.target.value })
                  }
                />
                <button disabled={busy}>
                  {allocation.id ? <Check /> : <Plus />}
                  {allocation.id ? "Save allocation" : "Allocate"}
                </button>
                {allocation.id && (
                  <button
                    type="button"
                    className="quiet-action"
                    onClick={() =>
                      setAllocation({
                        id: "",
                        truckId: "",
                        lotId: "",
                        quantity: "5",
                      })
                    }
                  >
                    Cancel edit
                  </button>
                )}
              </form>
            )}
            {preview.length > 0 && (
              <div className="split-preview" aria-label="Team split preview">
                {preview.map((row) => (
                  <span key={`${row.allocation_id}-${row.teamNumber}`}>
                    <b>Team {row.teamNumber}</b>
                    {row.product_name} · Lot {row.lot_code}
                    <strong>{row.quantity}</strong>
                  </span>
                ))}
              </div>
            )}
            <div className="truck-groups">
              {[...new Set(detail.trucks.map((t) => t.truck_number))].map(
                (n) => (
                  <article key={n}>
                    <h3>
                      <Truck /> Truck {n}
                    </h3>
                    {detail.trucks
                      .filter((t) => t.truck_number === n && t.allocation_id)
                      .map((t) => (
                        <div key={t.allocation_id}>
                          <span>
                            <b>{t.product_name}</b>
                            <small>Lot {t.lot_code}</small>
                          </span>
                          <strong>{t.quantity}</strong>
                          {detail.plan.status === "draft" && (
                            <div className="row-actions">
                              <button
                                className="quiet-action"
                                disabled={busy}
                                onClick={() =>
                                  setAllocation({
                                    id: t.allocation_id ?? "",
                                    truckId: t.id,
                                    lotId: t.lot_id ?? "",
                                    quantity: String(t.quantity ?? ""),
                                  })
                                }
                              >
                                Edit
                              </button>
                              <button
                                className="quiet-action danger"
                                disabled={busy}
                                onClick={() =>
                                  void action(() =>
                                    api(`/allocations/${t.allocation_id}`, {
                                      method: "DELETE",
                                    }),
                                  )
                                }
                              >
                                Cancel
                              </button>
                            </div>
                          )}
                          {detail.plan.status === "published" &&
                            Boolean(t.reserved_remaining) && (
                              <button
                                className="quiet-action"
                                disabled={busy}
                                onClick={() => {
                                  const value = prompt(
                                    "Reserved quantity to release",
                                    String(t.reserved_remaining),
                                  );
                                  if (value === null) return;
                                  const quantity = Number(value);
                                  if (
                                    Number.isInteger(quantity) &&
                                    quantity > 0
                                  )
                                    void action(() =>
                                      submitCorrection({
                                        kind: "release_reserved_remainder",
                                        details: {
                                          allocationId: t.allocation_id,
                                          quantity,
                                          note: "Admin released unused reservation",
                                        },
                                      }),
                                    );
                                }}
                              >
                                Release
                              </button>
                            )}
                        </div>
                      ))}
                  </article>
                ),
              )}
            </div>
          </>
        ) : (
          <Empty text="Select a plan to allocate plants and publish team work." />
        )}
      </section>
    </div>
  );
}
function Operations({
  ops,
  lots,
  busy,
  action,
}: {
  ops: Ops;
  lots: Lot[];
  busy: boolean;
  action(w: () => Promise<unknown>): Promise<void>;
}) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <p className="kicker">SYNCED FACTS</p>
          <h2>Exceptions & field work</h2>
        </div>
      </div>
      <div className="exception-list">
        {ops.exceptions.map((e) => (
          <article key={String(e.id)}>
            <span className="exception-icon">
              <AlertTriangle />
            </span>
            <div>
              <b>{String(e.type).replaceAll("_", " ")}</b>
              <small>{String(e.details)}</small>
            </div>
            <em className={String(e.status)}>{String(e.status)}</em>
            {e.status === "open" && (
              <button
                disabled={busy}
                onClick={() =>
                  void action(() =>
                    submitCorrection({
                      exceptionId: String(e.id),
                      kind: "resolve_exception",
                      details: { note: "Reviewed in POC admin" },
                    }),
                  )
                }
              >
                Resolve
              </button>
            )}
          </article>
        ))}
        {!ops.exceptions.length && (
          <Empty text="No field exceptions have synchronized." />
        )}
      </div>
      <h3 className="section-title">Recent pickups</h3>
      <div className="data-table">
        {ops.pickups.map((p) => (
          <div key={String(p.id)}>
            <span>
              <b>{String(p.product_name)}</b>
              <small>
                Lot {String(p.lot_code)} · Team {String(p.team_number)}
              </small>
            </span>
            <strong>{String(p.quantity)}</strong>
            <em>{String(p.source)}</em>
            <span className="pickup-actions">
              <button
                disabled={busy}
                onClick={() => {
                  const value = prompt(
                    "Correct physical pickup quantity",
                    String(p.quantity),
                  );
                  if (value === null) return;
                  const quantity = Number(value);
                  if (Number.isInteger(quantity) && quantity >= 0)
                    void action(() =>
                      submitCorrection({
                        kind: "correct_pickup_quantity",
                        details: {
                          pickupId: p.id,
                          quantity,
                          note: "Admin correction",
                        },
                      }),
                    );
                }}
              >
                Correct qty
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  const code = prompt("Move the pickup to lot code")?.trim();
                  const target = lots.find(
                    (lot) =>
                      lot.code.toLocaleLowerCase() ===
                      code?.toLocaleLowerCase(),
                  );
                  if (code && !target)
                    return alert("That lot code does not exist.");
                  if (target)
                    void action(() =>
                      submitCorrection({
                        kind: "reassign_pickup_lot",
                        details: {
                          pickupId: p.id,
                          lotId: target.id,
                          note: "Admin lot reassignment",
                        },
                      }),
                    );
                }}
              >
                Move lot
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  const value = prompt(
                    "Quantity physically returned to this lot",
                    "1",
                  );
                  if (value === null) return;
                  const quantity = Number(value);
                  if (Number.isInteger(quantity) && quantity > 0)
                    void action(() =>
                      submitCorrection({
                        kind: "return_to_lot",
                        details: {
                          lotId: p.lot_id,
                          quantity,
                          note: "Admin recorded return",
                        },
                      }),
                    );
                }}
              >
                Return
              </button>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <CircleDot />
      <p>{text}</p>
    </div>
  );
}
const rootRoute = createRootRoute({ component: AdminApp });
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => null,
});
const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute]),
  basepath: "/admin",
});
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
const el = document.getElementById("root");
if (!el) throw new Error("Missing root");
createRoot(el).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
