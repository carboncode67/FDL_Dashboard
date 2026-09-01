"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
import type { ContextJobDTO } from "@/lib/context-types";

interface ProductOpt {
  code: string;
  label: string;
  needsKey: boolean;
  timeVarying: boolean;
}

// Display list — the server (lib/geodart.ts) is the source of truth for what is
// actually submitted; this only drives the picker.
const PRODUCT_OPTS: ProductOpt[] = [
  { code: "POLARIS", label: "POLARIS soil (30 m)", needsKey: false, timeVarying: false },
  { code: "USGS3DEP_10m", label: "USGS 3DEP terrain (10 m)", needsKey: false, timeVarying: false },
  { code: "USDroughtMonitor", label: "US Drought Monitor (weekly)", needsKey: false, timeVarying: true },
  { code: "SOLUS", label: "SOLUS soil (100 m)", needsKey: true, timeVarying: false },
  { code: "Sentinel2", label: "Sentinel-2 imagery", needsKey: true, timeVarying: true },
];

const TERMINAL = new Set(["success", "partial", "failed"]);

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

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  pending: "outline",
  submitted: "secondary",
  running: "secondary",
  success: "default",
  partial: "secondary",
  failed: "destructive",
};

interface Props {
  farmId: number;
  hasGeometry: boolean;
  canPull: boolean;
  hasKey: boolean;
  initialJobs: ContextJobDTO[];
}

export function SpatialContextCard({ farmId, hasGeometry, canPull, hasKey, initialJobs }: Props) {
  const router = useRouter();
  const [jobs, setJobs] = useState<ContextJobDTO[]>(initialJobs);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const win = prevYear();
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(PRODUCT_OPTS.filter((p) => !p.needsKey).map((p) => p.code)),
  );
  const [start, setStart] = useState(win.start);
  const [end, setEnd] = useState(win.end);
  const [bufferM, setBufferM] = useState("150");

  const needsDates = useMemo(
    () => PRODUCT_OPTS.some((p) => selected.has(p.code) && p.timeVarying),
    [selected],
  );

  const inFlight = jobs.some((j) => !TERMINAL.has(j.status));
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    const active = jobs.filter((j) => !TERMINAL.has(j.status));
    if (!active.length) return;
    const updates = await Promise.all(
      active.map((j) =>
        fetch(`/api/context/jobs/${j.id}`, { cache: "no-store" })
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
    if (anyTerminal) router.refresh();
  }, [jobs, router]);

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

  function toggle(code: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/farms/${farmId}/context`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          products: [...selected],
          start_date: start,
          end_date: end,
          buffer_m: Number(bufferM) || 150,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to start");
        return;
      }
      setJobs((prev) => [json as ContextJobDTO, ...prev]);
      setOpen(false);
    } catch {
      setError("Network error — try again");
    } finally {
      setSubmitting(false);
    }
  }

  const pullDisabled = !canPull || !hasGeometry;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Spatial Context</CardTitle>
        <Button
          size="sm"
          variant="outline"
          disabled={pullDisabled}
          title={
            !canPull
              ? "You don't have permission to pull data"
              : !hasGeometry
                ? "Draw a field boundary first"
                : undefined
          }
          onClick={() => setOpen(true)}
        >
          Pull spatial context
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {!hasGeometry && (
          <p className="text-sm text-muted-foreground">
            This farm has no field or zone geometry yet — add a boundary to enable spatial-context pulls.
          </p>
        )}

        {jobs.length === 0 && hasGeometry && (
          <p className="text-sm text-muted-foreground">No spatial context has been pulled for this farm.</p>
        )}

        {jobs.map((job) => (
          <div key={job.id} className="rounded-md border p-3 text-sm">
            <div className="flex items-center gap-2">
              <Badge variant={STATUS_VARIANT[job.status] ?? "outline"}>
                {job.status}
                {!TERMINAL.has(job.status) && job.progress ? ` ${job.progress}%` : ""}
              </Badge>
              <span className="text-muted-foreground">{job.products.join(", ")}</span>
              {needsDatesFor(job.products) && (
                <span className="text-muted-foreground">
                  · {job.start_date} → {job.end_date}
                </span>
              )}
              <span className="ml-auto text-xs text-muted-foreground">
                {new Date(job.created_at).toLocaleString()}
              </span>
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
                      ({list.length} file{list.length === 1 ? "" : "s"},{" "}
                      {fmtBytes(list.reduce((s, r) => s + r.bytes, 0))})
                    </span>
                    {list.length <= 6 && (
                      <ul className="ml-3 list-disc">
                        {list.map((r) => (
                          <li key={r.id}>
                            <a
                              className="underline underline-offset-2"
                              href={`/api/files/context/${r.filename}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {r.filename}
                            </a>{" "}
                            <span className="text-muted-foreground">
                              {fmtBytes(r.bytes)}
                              {r.capture_date ? ` · ${r.capture_date}` : ""}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </CardContent>

      <Dialog open={open} onOpenChange={(o) => !submitting && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pull spatial context</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 text-sm">
            <div>
              <div className="mb-1.5 font-medium">Products</div>
              <div className="space-y-1.5">
                {PRODUCT_OPTS.map((p) => {
                  const disabled = p.needsKey && !hasKey;
                  return (
                    <label
                      key={p.code}
                      className={`flex items-center gap-2 ${disabled ? "opacity-50" : "cursor-pointer"}`}
                    >
                      <Checkbox
                        checked={selected.has(p.code)}
                        disabled={disabled}
                        onCheckedChange={() => toggle(p.code)}
                      />
                      <span>{p.label}</span>
                      {disabled && <span className="text-xs text-muted-foreground">(needs GeoDaRT key)</span>}
                    </label>
                  );
                })}
              </div>
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
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={submitting || selected.size === 0}>
              {submitting ? "Starting…" : "Pull"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
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
