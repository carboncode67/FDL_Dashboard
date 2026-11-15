"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { DateInput } from "@/components/ui/date-input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ContextCoverageDTO, ContextJobDTO, ContextPlanGroup, ContextPlanSkip } from "@/lib/context-types";

// Spatial context card (farm page Overview tab). A farm with nothing pulled
// gets "Pull spatial context" (products + date range + buffer). Once data
// exists the main actions are Update (from the end of what the farm has up to
// today) and Expand (widen the range). Both are planned server-side from
// what's already downloaded (lib/context-coverage.ts), so nothing is fetched
// twice. Plan: docs/context-update-and-farm-timeline-plan.md §1.
//
// API paths are props so OFE_Dashboard's copy can point at its proxies.

interface ProductOpt {
  code: string;
  label: string;
  short: string;
  needsKey: boolean;
  timeVarying: boolean;
}

// Display list — the server (lib/geodart.ts) is the source of truth for what is
// actually submitted; this only drives the picker.
const PRODUCT_OPTS: ProductOpt[] = [
  { code: "POLARIS", label: "POLARIS soil (30 m)", short: "Soil (POLARIS)", needsKey: false, timeVarying: false },
  { code: "USGS3DEP_10m", label: "USGS 3DEP terrain (10 m)", short: "Terrain", needsKey: false, timeVarying: false },
  { code: "USDroughtMonitor", label: "US Drought Monitor (weekly)", short: "Drought", needsKey: false, timeVarying: true },
  { code: "SOLUS", label: "SOLUS soil (100 m)", short: "Soil (SOLUS)", needsKey: true, timeVarying: false },
  { code: "Sentinel2", label: "Sentinel-2 imagery", short: "Sentinel-2", needsKey: true, timeVarying: true },
];
const SHORT = Object.fromEntries(PRODUCT_OPTS.map((p) => [p.code, p.short]));

const TERMINAL = new Set(["success", "partial", "failed"]);
const JOBS_SHOWN = 3;

function prevYear() {
  const y = new Date().getUTCFullYear() - 1;
  return { start: `${y}-01-01`, end: `${y}-12-31` };
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

const fmtDate = (d: string, withDay = true) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    ...(withDay ? { day: "numeric" } : {}),
    year: "numeric",
    timeZone: "UTC",
  });

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  pending: "outline",
  submitted: "secondary",
  running: "secondary",
  success: "default",
  partial: "secondary",
  failed: "destructive",
};

const MODE_LABEL: Record<string, string> = { pull: "Pull", update: "Update", expand: "Expand" };

interface Props {
  farmId: number;
  hasGeometry: boolean;
  canPull: boolean;
  hasKey: boolean;
  initialJobs: ContextJobDTO[];
  initialCoverage: ContextCoverageDTO | null;
  /** POST pull/update/expand here; GET `${apiBase}/coverage` for coverage + dry runs. */
  apiBase?: string;
  jobUrl?: (jobId: number) => string;
  fileUrl?: (filename: string) => string | null;
}

/** Overall [start, end] of a product's covered intervals. */
function span(intervals: [string, string][]): [string, string] | null {
  if (!intervals.length) return null;
  return [intervals[0][0], intervals[intervals.length - 1][1]];
}

export function SpatialContextCard({
  farmId,
  hasGeometry,
  canPull,
  hasKey,
  initialJobs,
  initialCoverage,
  apiBase = `/api/farms/${farmId}/context`,
  jobUrl = (id) => `/api/context/jobs/${id}`,
  fileUrl = (f) => `/api/files/context/${f}`,
}: Props) {
  const router = useRouter();
  const [jobs, setJobs] = useState<ContextJobDTO[]>(initialJobs);
  const [coverage, setCoverage] = useState<ContextCoverageDTO | null>(initialCoverage);
  const [dialog, setDialog] = useState<null | "pull" | "update" | "expand">(null);
  const [showAllJobs, setShowAllJobs] = useState(false);

  const refreshCoverage = useCallback(async () => {
    const r = await fetch(`${apiBase}/coverage`, { cache: "no-store" }).catch(() => null);
    if (r?.ok) setCoverage(((await r.json()) as { coverage: ContextCoverageDTO }).coverage);
  }, [apiBase]);

  const inFlight = jobs.some((j) => !TERMINAL.has(j.status));
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    const active = jobs.filter((j) => !TERMINAL.has(j.status));
    if (!active.length) return;
    const updates = await Promise.all(
      active.map((j) =>
        fetch(jobUrl(j.id), { cache: "no-store" })
          .then((r) => (r.ok ? (r.json() as Promise<ContextJobDTO>) : null))
          .catch(() => null),
      ),
    );
    let anyTerminal = false;
    setJobs((prev) =>
      prev.map((j) => {
        const u = updates.find((x) => x && x.id === j.id);
        if (!u) return j;
        if (TERMINAL.has(u.status) && !TERMINAL.has(j.status)) anyTerminal = true;
        return u;
      }),
    );
    if (anyTerminal) {
      void refreshCoverage();
      router.refresh();
    }
  }, [jobs, jobUrl, refreshCoverage, router]);

  useEffect(() => {
    if (!inFlight) {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
      return;
    }
    if (pollRef.current) return;
    pollRef.current = setInterval(poll, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [inFlight, poll]);

  function onStarted(newJobs: ContextJobDTO[]) {
    setJobs((prev) => [...newJobs, ...prev]);
    setDialog(null);
    void refreshCoverage();
  }

  const disabledReason = !canPull
    ? "You don't have permission to pull data"
    : !hasGeometry
      ? "Draw a field boundary first"
      : undefined;
  const hasData = !!coverage?.anyCovered;
  const aoiChanged = !!coverage?.aoiChanged;
  const extendBlocked = disabledReason ?? (inFlight || coverage?.inFlight ? "A download is still running" : undefined);
  const updatePlanEmpty = useMemo(() => updateIsUpToDate(coverage), [coverage]);

  const visibleJobs = showAllJobs ? jobs : jobs.slice(0, JOBS_SHOWN);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">Spatial Context</CardTitle>
        {!hasData || aoiChanged ? (
          <Button
            size="sm"
            variant="outline"
            disabled={!!disabledReason}
            title={disabledReason}
            onClick={() => setDialog("pull")}
          >
            Pull spatial context
          </Button>
        ) : (
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              disabled={!!extendBlocked || updatePlanEmpty}
              title={extendBlocked ?? (updatePlanEmpty ? "Up to date" : "Download data from the end of the current range up to today")}
              onClick={() => setDialog("update")}
            >
              {updatePlanEmpty ? "Up to date" : "Update"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!!extendBlocked}
              title={extendBlocked ?? "Widen the date range, or add a product"}
              onClick={() => setDialog("expand")}
            >
              Expand…
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                disabled={!!disabledReason}
                aria-label="More spatial context actions"
                className="rounded p-1.5 text-muted-foreground outline-none hover:bg-accent disabled:opacity-50"
              >
                <MoreHorizontal className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => setDialog("pull")}>Pull spatial context…</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {!hasGeometry && (
          <p className="text-sm text-muted-foreground">
            This farm has no field or zone geometry yet — add a boundary to enable spatial-context pulls.
          </p>
        )}

        {aoiChanged && hasGeometry && (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Field boundaries changed since the last pull, so the earlier downloads don&apos;t cover the whole farm.
            Pull spatial context again to cover the new area.
          </p>
        )}

        {hasData && !aoiChanged && coverage && <CoverageLine coverage={coverage} />}

        {jobs.length === 0 && hasGeometry && (
          <p className="text-sm text-muted-foreground">No spatial context has been pulled for this farm.</p>
        )}

        {visibleJobs.map((job) => (
          <JobRow key={job.id} job={job} fileUrl={fileUrl} />
        ))}
        {jobs.length > JOBS_SHOWN && (
          <button
            type="button"
            className="text-sm text-muted-foreground underline underline-offset-2"
            onClick={() => setShowAllJobs((v) => !v)}
          >
            {showAllJobs ? "Show fewer" : `Show all (${jobs.length})`}
          </button>
        )}
      </CardContent>

      {dialog === "pull" && (
        <PullDialog apiBase={apiBase} hasKey={hasKey} onClose={() => setDialog(null)} onStarted={onStarted} />
      )}
      {dialog === "update" && coverage && (
        <ExtendDialog mode="update" apiBase={apiBase} coverage={coverage} hasKey={hasKey} onClose={() => setDialog(null)} onStarted={onStarted} />
      )}
      {dialog === "expand" && coverage && (
        <ExtendDialog mode="expand" apiBase={apiBase} coverage={coverage} hasKey={hasKey} onClose={() => setDialog(null)} onStarted={onStarted} />
      )}
    </Card>
  );
}

// Mirrors planContextRequests' "up to date" rule closely enough to label the
// button; the dialog's dry run is what's authoritative.
const LAG: Record<string, number> = { USDroughtMonitor: 9, Sentinel2: 5 };
function updateIsUpToDate(c: ContextCoverageDTO | null): boolean {
  if (!c?.anyCovered) return false;
  const todayMs = Date.parse(`${c.today}T00:00:00Z`);
  return !Object.entries(c.products).some(([code, p]) => {
    if (p.static || !p.intervals.length) return false;
    const last = Date.parse(`${p.intervals[p.intervals.length - 1][1]}T00:00:00Z`);
    return last + 86_400_000 <= todayMs - (LAG[code] ?? 0) * 86_400_000;
  });
}

function CoverageLine({ coverage }: { coverage: ContextCoverageDTO }) {
  const parts: string[] = [];
  const statics: string[] = [];
  for (const p of PRODUCT_OPTS) {
    const c = coverage.products[p.code];
    if (!c?.covered) continue;
    if (c.static) {
      statics.push(p.short);
      continue;
    }
    const s = span(c.intervals);
    if (!s) continue;
    const gaps = c.intervals.length > 1 ? ` (${c.intervals.length - 1} gap${c.intervals.length > 2 ? "s" : ""})` : "";
    parts.push(`${p.short} ${fmtDate(s[0], false)} – ${fmtDate(s[1], false)}${gaps}`);
  }
  if (statics.length) parts.push(`${statics.join(", ")} ✓`);
  return (
    <p className="text-sm">
      <span className="text-muted-foreground">Downloaded: </span>
      {parts.join(" · ")}
    </p>
  );
}

function JobRow({ job, fileUrl }: { job: ContextJobDTO; fileUrl: (f: string) => string | null }) {
  return (
    <div className="rounded-md border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={STATUS_VARIANT[job.status] ?? "outline"}>
          {job.status}
          {!TERMINAL.has(job.status) && job.progress ? ` ${job.progress}%` : ""}
        </Badge>
        {job.mode !== "pull" && <Badge variant="outline">{MODE_LABEL[job.mode] ?? job.mode}</Badge>}
        <span className="text-muted-foreground">{job.products.map((p) => SHORT[p] ?? p).join(", ")}</span>
        {needsDatesFor(job.products) && (
          <span className="text-muted-foreground">
            · {job.start_date} → {job.end_date}
          </span>
        )}
        <span className="ml-auto text-xs text-muted-foreground">{new Date(job.created_at).toLocaleString()}</span>
      </div>

      {job.error_message && <p className="mt-1 text-destructive">{job.error_message}</p>}

      {Object.entries(job.product_results).length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {Object.entries(job.product_results).map(([p, r]) => (
            <li key={p} className={r.ok ? "text-muted-foreground" : "text-destructive"}>
              {r.ok ? "✓" : "✗"} {p}
              {!r.ok && r.detail ? ` — ${r.detail}` : ""}
            </li>
          ))}
        </ul>
      )}

      {job.rasters.length > 0 && (
        <div className="mt-2">
          {groupRasters(job.rasters).map(([product, list]) => (
            <div key={product} className="mt-1">
              <span className="font-medium">{product}</span>{" "}
              <span className="text-muted-foreground">
                ({list.length} file{list.length === 1 ? "" : "s"}, {fmtBytes(list.reduce((s, r) => s + r.bytes, 0))})
              </span>
              {list.length <= 6 && (
                <ul className="ml-3 list-disc">
                  {list.map((r) => {
                    const href = fileUrl(r.filename);
                    return (
                      <li key={r.id}>
                        {href ? (
                          <a className="underline underline-offset-2" href={href} target="_blank" rel="noreferrer">
                            {r.filename}
                          </a>
                        ) : (
                          r.filename
                        )}{" "}
                        <span className="text-muted-foreground">
                          {fmtBytes(r.bytes)}
                          {r.capture_date ? ` · ${r.capture_date}` : ""}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dialogs
// ---------------------------------------------------------------------------

interface DialogProps {
  apiBase: string;
  hasKey: boolean;
  onClose: () => void;
  onStarted: (jobs: ContextJobDTO[]) => void;
}

function ProductPicker({
  selected,
  toggle,
  hasKey,
  isDone,
}: {
  selected: Set<string>;
  toggle: (code: string) => void;
  hasKey: boolean;
  isDone?: (code: string) => boolean;
}) {
  return (
    <div className="space-y-1.5">
      {PRODUCT_OPTS.map((p) => {
        const noKey = p.needsKey && !hasKey;
        const done = isDone?.(p.code) ?? false;
        const disabled = noKey || done;
        return (
          <label key={p.code} className={`flex items-center gap-2 ${disabled ? "opacity-50" : "cursor-pointer"}`}>
            <Checkbox checked={done || selected.has(p.code)} disabled={disabled} onCheckedChange={() => toggle(p.code)} />
            <span>{p.label}</span>
            {noKey && <span className="text-xs text-muted-foreground">(needs GeoDaRT key)</span>}
            {done && !noKey && <span className="text-xs text-muted-foreground">(already downloaded)</span>}
          </label>
        );
      })}
    </div>
  );
}

function useToggleSet(initial: () => Set<string>) {
  const [selected, setSelected] = useState<Set<string>>(initial);
  const toggle = (code: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  return [selected, toggle] as const;
}

async function postContext(apiBase: string, body: object): Promise<{ jobs?: ContextJobDTO[]; error?: string }> {
  try {
    const res = await fetch(apiBase, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { error: json.error ?? "Failed to start" };
    // A pull returns one job; Update/Expand return { jobs }.
    return { jobs: Array.isArray(json.jobs) ? json.jobs : [json as ContextJobDTO] };
  } catch {
    return { error: "Network error — try again" };
  }
}

function PullDialog({ apiBase, hasKey, onClose, onStarted }: DialogProps) {
  const win = prevYear();
  const [selected, toggle] = useToggleSet(() => new Set(PRODUCT_OPTS.filter((p) => !p.needsKey).map((p) => p.code)));
  const [start, setStart] = useState(win.start);
  const [end, setEnd] = useState(win.end);
  const [bufferM, setBufferM] = useState("150");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsDates = PRODUCT_OPTS.some((p) => selected.has(p.code) && p.timeVarying);

  async function submit() {
    setSubmitting(true);
    setError(null);
    const r = await postContext(apiBase, {
      mode: "pull",
      products: [...selected],
      start_date: start,
      end_date: end,
      buffer_m: Number(bufferM) || 150,
    });
    setSubmitting(false);
    if (r.error) setError(r.error);
    else onStarted(r.jobs ?? []);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !submitting && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pull spatial context</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div>
            <div className="mb-1.5 font-medium">Products</div>
            <ProductPicker selected={selected} toggle={toggle} hasKey={hasKey} />
          </div>

          <div className={needsDates ? "" : "opacity-50"}>
            <div className="mb-1.5 font-medium">
              Date range {needsDates ? "" : "(only used by Drought Monitor / Sentinel-2)"}
            </div>
            <div className="flex items-center gap-2">
              <DateInput value={start} onChange={setStart} className="w-36" />
              <span className="text-muted-foreground">→</span>
              <DateInput value={end} onChange={setEnd} className="w-36" />
            </div>
          </div>

          <div>
            <div className="mb-1.5 font-medium">Buffer around farm (m)</div>
            <input
              type="number"
              min={0}
              value={bufferM}
              onChange={(e) => setBufferM(e.target.value)}
              className="h-8 w-28 rounded-md border border-input bg-white px-2 text-sm"
            />
          </div>

          {error && <p className="text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting || selected.size === 0}>
            {submitting ? "Starting…" : "Pull"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface PlanResult {
  groups: ContextPlanGroup[];
  skipped: ContextPlanSkip[];
}

function ExtendDialog({
  mode,
  apiBase,
  coverage,
  hasKey,
  onClose,
  onStarted,
}: DialogProps & { mode: "update" | "expand"; coverage: ContextCoverageDTO }) {
  // Expand starts from the overall covered range of the time-varying products.
  const covered = useMemo(() => {
    const spans = PRODUCT_OPTS.filter((p) => p.timeVarying)
      .map((p) => span(coverage.products[p.code]?.intervals ?? []))
      .filter((s): s is [string, string] => !!s);
    if (!spans.length) return null;
    return [spans.map((s) => s[0]).sort()[0], spans.map((s) => s[1]).sort().reverse()[0]] as [string, string];
  }, [coverage]);

  const [start, setStart] = useState(covered?.[0] ?? prevYear().start);
  const [end, setEnd] = useState(covered?.[1] ?? coverage.today);
  const [selected, toggle] = useToggleSet(
    () => new Set(PRODUCT_OPTS.filter((p) => coverage.products[p.code]?.covered && p.timeVarying).map((p) => p.code)),
  );
  const isDone = (code: string) => !!coverage.products[code]?.static && !!coverage.products[code]?.covered;

  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rangeError =
    mode === "expand" && covered
      ? start > covered[0]
        ? `Start can only move earlier than ${fmtDate(covered[0])}`
        : end < covered[1]
          ? `End can only move later than ${fmtDate(covered[1])}`
          : null
      : null;
  const products = [...selected].join(",");

  // Dry run from the same planner the POST uses, so the preview is exact.
  useEffect(() => {
    if (rangeError) return;
    if (mode === "expand" && (!start || !end || !products)) return;
    const q = new URLSearchParams({ mode });
    if (mode === "expand") {
      q.set("start_date", start);
      q.set("end_date", end);
      q.set("products", products);
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`${apiBase}/coverage?${q}`, { cache: "no-store", signal: ctrl.signal });
        const json = await r.json();
        if (!r.ok) {
          setPlan(null);
          setPlanError(json.error ?? "Couldn't work out what to download");
        } else {
          setPlan({ groups: json.groups, skipped: json.skipped });
          setPlanError(null);
        }
      } catch {
        /* aborted or offline — keep the last preview */
      }
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [apiBase, mode, start, end, products, rangeError]);

  async function submit() {
    setSubmitting(true);
    setError(null);
    const r = await postContext(
      apiBase,
      mode === "update" ? { mode } : { mode, start_date: start, end_date: end, products: [...selected] },
    );
    setSubmitting(false);
    if (r.error) setError(r.error);
    else if (!r.jobs?.length) setError("Nothing new to download.");
    else onStarted(r.jobs);
  }

  const nothingToDo = !!plan && plan.groups.length === 0;

  return (
    <Dialog open onOpenChange={(o) => !o && !submitting && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "update" ? "Update spatial context" : "Expand spatial context"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {mode === "update" ? (
            <p className="text-muted-foreground">
              Downloads data from the end of what this farm already has up to today. Soil and terrain don&apos;t
              change over time, so they aren&apos;t downloaded again.
            </p>
          ) : (
            <>
              <div>
                <div className="mb-1.5 font-medium">Products</div>
                <ProductPicker selected={selected} toggle={toggle} hasKey={hasKey} isDone={isDone} />
              </div>
              <div>
                <div className="mb-1.5 font-medium">Date range</div>
                <div className="flex items-center gap-2">
                  <DateInput value={start} onChange={setStart} className="w-36" />
                  <span className="text-muted-foreground">→</span>
                  <DateInput value={end} onChange={setEnd} className="w-36" />
                </div>
                {covered && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Current range {fmtDate(covered[0])} – {fmtDate(covered[1])}. Only the added part is downloaded.
                  </p>
                )}
                {rangeError && <p className="mt-1 text-destructive">{rangeError}</p>}
              </div>
            </>
          )}

          <div className="rounded-md border bg-muted/40 p-3">
            <div className="mb-1 font-medium">Will download</div>
            {planError ? (
              <p className="text-destructive">{planError}</p>
            ) : !plan ? (
              <p className="text-muted-foreground">Checking…</p>
            ) : nothingToDo ? (
              <p className="text-muted-foreground">Nothing new — this farm already has it all.</p>
            ) : (
              <ul className="space-y-0.5">
                {plan.groups.map((g) => (
                  <li key={`${g.start}|${g.end}`}>
                    {g.products.map((p) => SHORT[p] ?? p).join(", ")}
                    {g.products.some((p) => PRODUCT_OPTS.find((o) => o.code === p)?.timeVarying) && (
                      <span className="text-muted-foreground">
                        {" "}
                        · {fmtDate(g.start)} → {fmtDate(g.end)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {plan && plan.skipped.length > 0 && (
              <p className="mt-1.5 text-xs text-muted-foreground">
                Skipped: {plan.skipped.map((s) => `${SHORT[s.product] ?? s.product} (${s.reason})`).join(", ")}
              </p>
            )}
          </div>

          {error && <p className="text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting || !plan || nothingToDo || !!rangeError || !!planError}>
            {submitting ? "Starting…" : mode === "update" ? "Update" : "Expand"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function needsDatesFor(products: string[]): boolean {
  return PRODUCT_OPTS.some((p) => products.includes(p.code) && p.timeVarying);
}

function groupRasters<T extends { product: string }>(rasters: T[]): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const r of rasters) {
    const arr = map.get(r.product) ?? [];
    arr.push(r);
    map.set(r.product, arr);
  }
  return [...map.entries()];
}
