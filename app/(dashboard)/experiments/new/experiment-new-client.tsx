"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, X } from "lucide-react";
import { DateInput } from "@/components/ui/date-input";

type FarmOption      = { id: number; Farm_Name: string | null };
type TestOption      = { id: number; Test_Name: string | null };
type DroneOption     = { id: number; Name: string | null };
type TreatmentOption = { id: number; Treatment_Name: string | null };
type ProjectOption   = { id: number; Project_Name: string | null };

const ASSIGNMENT_STATUSES = ["Planned", "Collected", "Completed", "Cancelled"] as const;

type TestRow      = { test_id: number; n_samples: string; expected_date: string; status: string };
type DroneRow     = { drone_id: number; n_flights: string; expected_date: string; status: string };
type TreatmentRow = { treatment_id: number; is_continuous: boolean; rate: string; rate_unit: string };

interface Props {
  farms:         FarmOption[];
  allTests:      TestOption[];
  allDrones:     DroneOption[];
  allTreatments: TreatmentOption[];
  allProjects:   ProjectOption[];
}

const TEXTAREA = "flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
const SELECT   = "h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm";

export default function ExperimentNewClient({ farms, allTests, allDrones, allTreatments, allProjects }: Props) {
  const router  = useRouter();
  const [saving, setSaving] = useState(false);

  const [farmMode,     setFarmMode]     = useState<"existing" | "new">("existing");
  const [farmId,       setFarmId]       = useState(farms[0]?.id.toString() ?? "");
  const [newFarmName,  setNewFarmName]  = useState("");
  const [expName,      setExpName]      = useState("");
  const [startDate,    setStartDate]    = useState("");
  const [endDate,      setEndDate]      = useState("");
  const [projectId,    setProjectId]    = useState("");
  const [hypothesis,   setHypothesis]   = useState("");
  const [expDesc,      setExpDesc]      = useState("");
  const [measurements, setMeasurements] = useState("");
  const [criteria,     setCriteria]     = useState("");
  const [labDesc,      setLabDesc]      = useState("");

  const [testRows,      setTestRows]      = useState<TestRow[]>([]);
  const [droneRows,     setDroneRows]     = useState<DroneRow[]>([]);
  const [treatmentRows, setTreatmentRows] = useState<TreatmentRow[]>([]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      let resolvedFarmId = farmId;
      if (farmMode === "new") {
        if (!newFarmName.trim()) return;
        const res = await fetch("/api/farms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ Farm_Name: newFarmName.trim() }),
        });
        if (!res.ok) throw new Error("Failed to create farm");
        const created = await res.json();
        resolvedFarmId = String(created.id);
      }
      if (!resolvedFarmId) return;
      const res = await fetch(`/api/experiments/${resolvedFarmId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          experiment_name: expName || null,
          start_date:      startDate || null,
          end_date:        endDate || null,
          project_id:      projectId ? parseInt(projectId) : null,
          hypothesis:      hypothesis || null,
          experiment_desc: expDesc || null,
          measurements:    measurements || null,
          criteria:        criteria || null,
          lab_description: labDesc || null,
          tests: testRows
            .filter((r) => r.test_id)
            .map((r) => ({
              test_id:       r.test_id,
              n_samples:     r.n_samples ? parseInt(r.n_samples) : null,
              expected_date: r.expected_date || null,
              status:        r.status || null,
            })),
          drones: droneRows
            .filter((r) => r.drone_id)
            .map((r) => ({
              drone_id:      r.drone_id,
              n_flights:     r.n_flights ? parseInt(r.n_flights) : null,
              expected_date: r.expected_date || null,
              status:        r.status || null,
            })),
          treatments: treatmentRows
            .filter((r) => r.treatment_id)
            .map((r) => ({
              treatment_id:  r.treatment_id,
              is_continuous: r.is_continuous,
              rate:          r.rate ? parseFloat(r.rate) : null,
              rate_unit:     r.rate_unit || null,
            })),
          field_ids: [],
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      router.push("/experiments");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
          <Link href="/experiments" className="hover:text-slate-900">Experiments</Link>
          <span>/</span>
          <span>New</span>
        </div>
        <h2 className="text-2xl font-bold text-slate-900">New Experiment</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Farm */}
        <div className="bg-white border rounded-lg p-6 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900 pb-2 border-b">Farm</h3>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Farm <span className="text-red-500">*</span></Label>
              <button
                type="button"
                className="text-xs text-blue-600 hover:underline"
                onClick={() => {
                  setFarmMode(farmMode === "existing" ? "new" : "existing");
                  setNewFarmName("");
                }}
              >
                {farmMode === "existing" ? "or create new" : "or select existing"}
              </button>
            </div>
            {farmMode === "existing" ? (
              <select
                required
                className={`w-full ${SELECT}`}
                value={farmId}
                onChange={(e) => setFarmId(e.target.value)}
              >
                <option value="">— Select a farm —</option>
                {farms.map((f) => (
                  <option key={f.id} value={f.id}>{f.Farm_Name ?? `Farm #${f.id}`}</option>
                ))}
              </select>
            ) : (
              <Input
                required
                placeholder="New farm name"
                value={newFarmName}
                onChange={(e) => setNewFarmName(e.target.value)}
              />
            )}
          </div>
        </div>

        {/* Experiment Card */}
        <div className="bg-white border rounded-lg p-6 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900 pb-2 border-b">Experiment Card</h3>
          <div className="space-y-1.5">
            <Label>Experiment Name <span className="text-red-500">*</span></Label>
            <Input value={expName} onChange={(e) => setExpName(e.target.value)} required />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Start Date</Label>
              <DateInput value={startDate} onChange={setStartDate} />
            </div>
            <div className="space-y-1.5">
              <Label>End Date</Label>
              <DateInput value={endDate} onChange={setEndDate} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Project</Label>
            <select
              className={`w-full ${SELECT}`}
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">— No project —</option>
              {allProjects.map((p) => (
                <option key={p.id} value={p.id}>{p.Project_Name ?? `Project #${p.id}`}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Hypothesis</Label>
            <textarea rows={3} className={TEXTAREA} value={hypothesis} onChange={(e) => setHypothesis(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Experiment</Label>
            <textarea rows={3} className={TEXTAREA} value={expDesc} onChange={(e) => setExpDesc(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Measurements</Label>
            <textarea rows={2} className={TEXTAREA} value={measurements} onChange={(e) => setMeasurements(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Criteria</Label>
            <textarea rows={2} className={TEXTAREA} value={criteria} onChange={(e) => setCriteria(e.target.value)} />
          </div>
        </div>

        {/* Lab Design */}
        <div className="bg-white border rounded-lg p-6 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900 pb-2 border-b">Lab Design</h3>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <textarea rows={3} className={TEXTAREA} value={labDesc} onChange={(e) => setLabDesc(e.target.value)} />
          </div>

          {/* Tests */}
          <div className="space-y-2">
            <Label>Tests</Label>
            {testRows.map((row, i) => (
              <div key={i} className="flex gap-2 items-center flex-wrap">
                <select
                  className={`flex-1 min-w-32 ${SELECT}`}
                  value={row.test_id}
                  onChange={(e) => {
                    const u = [...testRows];
                    u[i] = { ...u[i], test_id: parseInt(e.target.value) };
                    setTestRows(u);
                  }}
                >
                  {allTests.map((t) => (
                    <option key={t.id} value={t.id}>{t.Test_Name ?? `Test #${t.id}`}</option>
                  ))}
                </select>
                <Input
                  type="number"
                  placeholder="# samples"
                  className="w-28"
                  value={row.n_samples}
                  onChange={(e) => {
                    const u = [...testRows];
                    u[i] = { ...u[i], n_samples: e.target.value };
                    setTestRows(u);
                  }}
                />
                <DateInput
                  value={row.expected_date}
                  onChange={(v) => {
                    const u = [...testRows];
                    u[i] = { ...u[i], expected_date: v };
                    setTestRows(u);
                  }}
                />
                <select
                  className={`w-36 ${SELECT}`}
                  value={row.status}
                  onChange={(e) => {
                    const u = [...testRows];
                    u[i] = { ...u[i], status: e.target.value };
                    setTestRows(u);
                  }}
                >
                  <option value="">— Status —</option>
                  {ASSIGNMENT_STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setTestRows(testRows.filter((_, idx) => idx !== i))}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {allTests.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setTestRows([...testRows, { test_id: allTests[0].id, n_samples: "", expected_date: "", status: "" }])}
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Test
              </Button>
            )}
          </div>

          {/* Drone Flights */}
          <div className="space-y-2">
            <Label>Drone Flights</Label>
            {droneRows.map((row, i) => (
              <div key={i} className="flex gap-2 items-center flex-wrap">
                <select
                  className={`flex-1 min-w-32 ${SELECT}`}
                  value={row.drone_id}
                  onChange={(e) => {
                    const u = [...droneRows];
                    u[i] = { ...u[i], drone_id: parseInt(e.target.value) };
                    setDroneRows(u);
                  }}
                >
                  {allDrones.map((d) => (
                    <option key={d.id} value={d.id}>{d.Name ?? `Drone #${d.id}`}</option>
                  ))}
                </select>
                <Input
                  type="number"
                  placeholder="# flights"
                  className="w-28"
                  value={row.n_flights}
                  onChange={(e) => {
                    const u = [...droneRows];
                    u[i] = { ...u[i], n_flights: e.target.value };
                    setDroneRows(u);
                  }}
                />
                <DateInput
                  value={row.expected_date}
                  onChange={(v) => {
                    const u = [...droneRows];
                    u[i] = { ...u[i], expected_date: v };
                    setDroneRows(u);
                  }}
                />
                <select
                  className={`w-36 ${SELECT}`}
                  value={row.status}
                  onChange={(e) => {
                    const u = [...droneRows];
                    u[i] = { ...u[i], status: e.target.value };
                    setDroneRows(u);
                  }}
                >
                  <option value="">— Status —</option>
                  {ASSIGNMENT_STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setDroneRows(droneRows.filter((_, idx) => idx !== i))}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {allDrones.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDroneRows([...droneRows, { drone_id: allDrones[0].id, n_flights: "", expected_date: "", status: "" }])}
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Flight
              </Button>
            )}
          </div>

          {/* Farm Level Treatments */}
          <div className="space-y-2">
            <Label>Farm Level Treatments</Label>
            {treatmentRows.map((row, i) => (
              <div key={i} className="flex gap-2 items-center flex-wrap border rounded-md p-2 bg-slate-50">
                <select
                  className={`flex-1 min-w-36 ${SELECT}`}
                  value={row.treatment_id}
                  onChange={(e) => {
                    const u = [...treatmentRows];
                    u[i] = { ...u[i], treatment_id: parseInt(e.target.value) };
                    setTreatmentRows(u);
                  }}
                >
                  {allTreatments.map((t) => (
                    <option key={t.id} value={t.id}>{t.Treatment_Name ?? `Treatment #${t.id}`}</option>
                  ))}
                </select>
                <select
                  className={`w-36 ${SELECT}`}
                  value={row.is_continuous ? "continuous" : "categorical"}
                  onChange={(e) => {
                    const u = [...treatmentRows];
                    u[i] = { ...u[i], is_continuous: e.target.value === "continuous" };
                    setTreatmentRows(u);
                  }}
                >
                  <option value="continuous">Continuous</option>
                  <option value="categorical">Categorical</option>
                </select>
                <Input
                  type="number"
                  step="any"
                  placeholder="Rate"
                  className="w-24"
                  value={row.rate}
                  onChange={(e) => {
                    const u = [...treatmentRows];
                    u[i] = { ...u[i], rate: e.target.value };
                    setTreatmentRows(u);
                  }}
                />
                <Input
                  placeholder="Unit"
                  className="w-24"
                  value={row.rate_unit}
                  onChange={(e) => {
                    const u = [...treatmentRows];
                    u[i] = { ...u[i], rate_unit: e.target.value };
                    setTreatmentRows(u);
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setTreatmentRows(treatmentRows.filter((_, idx) => idx !== i))}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {allTreatments.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setTreatmentRows([
                    ...treatmentRows,
                    { treatment_id: allTreatments[0].id, is_continuous: true, rate: "", rate_unit: "" },
                  ])
                }
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Treatment
              </Button>
            )}
          </div>
        </div>

        <div className="flex gap-3">
          <Button type="submit" disabled={saving || (farmMode === "existing" ? !farmId : !newFarmName.trim())}>
            {saving ? "Saving..." : "Create"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.push("/experiments")}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
