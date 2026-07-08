"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, X, ChevronDown, ChevronRight } from "lucide-react";
import FieldSelectorMapWrapper from "@/components/field-selector-map-wrapper";
import { FieldBoundaryUpload } from "@/components/field-boundary-upload";
import { DroneFlightRecordForm, type DroneFlightRecordData } from "@/components/forms/drone-flight-record-form";
import { DateInput } from "@/components/ui/date-input";
import { ExperimentTasksSection, type ExperimentTaskRow } from "@/components/experiment-tasks-section";

type FieldDef      = { id: number; col_index: number; field_type: string; label: string };
type TestTemplate  = { id: number; description: string; classification: string | null; priority: string };
type TaskOverride  = { template_id: number; description: string; classification: string | null; due_date: string; user_ids: string[] };
type UserOption    = { id: string; name: string | null; email: string };
type TestOption    = { id: number; Test_Name: string | null; TaskTemplates: TestTemplate[] };
type DroneOption   = { id: number; Name: string | null; TaskTemplates: TestTemplate[] };
type TreatmentOption = {
  id:               number;
  Treatment_Name:   string | null;
  allow_extra_rows: boolean;
  TreatmentFieldDefinitions: FieldDef[];
};
type FarmField     = { id: number; Name: string | null; geometry: string | null };
type ProjectOption = { id: number; Project_Name: string | null };

const ASSIGNMENT_STATUSES = ["Planned", "Collected", "Completed", "Cancelled"] as const;

type TestRow      = { test_id: number; n_samples: string; expected_date: string; status: string; taskOverrides: TaskOverride[] };
type DroneRow     = { id?: number; drone_id: number; n_flights: string; expected_date: string; status: string; taskOverrides: TaskOverride[] };
type TreatmentRow = { treatment_id: number; is_continuous: boolean; has_control_treatment: boolean; control_treatment_type: "control" | "treatment" | ""; control_treatment_number: string };
type TreatmentValueRow = { treatment_id: number; field_def_id: number; row_index: number; value: string };

type FlightRecordData = {
  id: number;
  experiment_drone_flight_id: number;
  flight_date: string | null;
  pilot: string | null;
  flight_status: string | null;
  total_acres: number | null;
  total_images: number | null;
  needs_3d: boolean;
  needs_ortho: boolean;
  processed: boolean;
  data_storage_path: string | null;
  tile_coverage_pct: number | null;
  tile_size_m: number | null;
  notes: string | null;
};

interface Props {
  farmId:       number;
  farmName:     string | null;
  experimentId?: number;
  experiment: {
    experiment_name: string | null;
    start_date:      string | null;
    end_date:        string | null;
    project_id:      number | null;
    hypothesis:      string | null;
    experiment_desc: string | null;
    measurements:    string | null;
    criteria:        string | null;
    lab_description: string | null;
    tests:      { test_id: number; n_samples: number | null; expected_date: string | null; status: string | null }[];
    drones:     { id: number; drone_id: number; n_flights: number | null; expected_date: string | null; status: string | null }[];
    droneFlightRecordsMap: Record<number, FlightRecordData[]>;
    treatments: { treatment_id: number; is_continuous: boolean; has_control_treatment: boolean; control_treatment_type: string | null; control_treatment_number: number | null }[];
    field_ids:  number[];
    treatmentValues: TreatmentValueRow[];
  } | null;
  allTests:      TestOption[];
  allDrones:     DroneOption[];
  allTreatments: TreatmentOption[];
  allProjects:   ProjectOption[];
  farmFields:    FarmField[];
  farmUploadPins: { id: number; lat: number; lng: number; type: "photo" | "note" | "lab" }[];
  allUsers:      UserOption[];
  canDelete?:    boolean;
  initialTasks?:  ExperimentTaskRow[];
  taskTemplates?: { id: number; description: string; classification: string | null; priority: string }[];
}

const TEXTAREA = "flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
const SELECT   = "h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm";

function buildTaskOverrides(templates: TestTemplate[]): TaskOverride[] {
  return templates.map((t) => ({
    template_id:    t.id,
    description:    t.description,
    classification: t.classification,
    due_date:       "",
    user_ids:       [],
  }));
}

export default function ExperimentFormClient({
  farmId, farmName, experimentId, experiment, allTests, allDrones, allTreatments, allProjects, farmFields, farmUploadPins, allUsers,
  canDelete, initialTasks, taskTemplates,
}: Props) {
  const router   = useRouter();
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [flightFormAssignmentId, setFlightFormAssignmentId] = useState<number | null>(null);
  const [editingFlightRecord, setEditingFlightRecord]       = useState<FlightRecordData | null>(null);
  const [expandedDrones, setExpandedDrones]                 = useState<Set<number>>(new Set());
  const droneFlightRecordsMap = experiment?.droneFlightRecordsMap ?? {};

  const [expName,      setExpName]      = useState(experiment?.experiment_name ?? "");
  const [startDate,    setStartDate]    = useState(experiment?.start_date ?? "");
  const [endDate,      setEndDate]      = useState(experiment?.end_date ?? "");
  const [projectId,    setProjectId]    = useState<string>(experiment?.project_id?.toString() ?? "");
  const [hypothesis,   setHypothesis]   = useState(experiment?.hypothesis ?? "");
  const [expDesc,      setExpDesc]      = useState(experiment?.experiment_desc ?? "");
  const [measurements, setMeasurements] = useState(experiment?.measurements ?? "");
  const [criteria,     setCriteria]     = useState(experiment?.criteria ?? "");
  const [labDesc,      setLabDesc]      = useState(experiment?.lab_description ?? "");

  const [testRows, setTestRows] = useState<TestRow[]>(
    experiment?.tests.length
      ? experiment.tests.map((t) => ({
          test_id:       t.test_id,
          n_samples:     t.n_samples?.toString() ?? "",
          expected_date: t.expected_date ?? "",
          status:        t.status ?? "",
          taskOverrides: [],
        }))
      : []
  );

  const [droneRows, setDroneRows] = useState<DroneRow[]>(
    experiment?.drones.length
      ? experiment.drones.map((d) => ({
          id:            d.id,
          drone_id:      d.drone_id,
          n_flights:     d.n_flights?.toString() ?? "",
          expected_date: d.expected_date ?? "",
          status:        d.status ?? "",
          taskOverrides: [],
        }))
      : []
  );

  const [treatmentRows, setTreatmentRows] = useState<TreatmentRow[]>(
    experiment?.treatments.length
      ? experiment.treatments.map((t) => ({
          treatment_id:            t.treatment_id,
          is_continuous:           t.is_continuous,
          has_control_treatment:   t.has_control_treatment,
          control_treatment_type:  (t.control_treatment_type as "control" | "treatment" | "") || "",
          control_treatment_number: t.control_treatment_number?.toString() ?? "",
        }))
      : []
  );

  const [treatmentValues, setTreatmentValues] = useState<TreatmentValueRow[]>(
    experiment?.treatmentValues ?? []
  );

  const [selectedFieldIds, setSelectedFieldIds] = useState<Set<number>>(
    new Set(experiment?.field_ids ?? [])
  );

  function toggleField(id: number) {
    setSelectedFieldIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function getTreatmentOption(treatmentId: number): TreatmentOption | undefined {
    return allTreatments.find((t) => t.id === treatmentId);
  }

  function seedInitialValueRow(treatmentId: number, fieldDefs: FieldDef[]) {
    if (fieldDefs.length === 0) return;
    setTreatmentValues((prev) => {
      const hasRows = prev.some((v) => v.treatment_id === treatmentId);
      if (hasRows) return prev;
      return [
        ...prev,
        ...fieldDefs.map((def) => ({ treatment_id: treatmentId, field_def_id: def.id, row_index: 0, value: "" })),
      ];
    });
  }

  function addValueRow(treatmentId: number, fieldDefs: FieldDef[]) {
    const existingRows = treatmentValues.filter((v) => v.treatment_id === treatmentId);
    const maxRow = existingRows.length > 0 ? Math.max(...existingRows.map((v) => v.row_index)) : -1;
    const newRowIndex = maxRow + 1;
    const newRows: TreatmentValueRow[] = fieldDefs.map((def) => ({
      treatment_id: treatmentId,
      field_def_id: def.id,
      row_index:    newRowIndex,
      value:        "",
    }));
    setTreatmentValues((prev) => [...prev, ...newRows]);
  }

  function removeValueRow(treatmentId: number, rowIndex: number) {
    setTreatmentValues((prev) =>
      prev
        .filter((v) => !(v.treatment_id === treatmentId && v.row_index === rowIndex))
        .map((v) => {
          if (v.treatment_id === treatmentId && v.row_index > rowIndex) {
            return { ...v, row_index: v.row_index - 1 };
          }
          return v;
        })
    );
  }

  function updateValueCell(treatmentId: number, rowIndex: number, fieldDefId: number, value: string) {
    setTreatmentValues((prev) =>
      prev.map((v) =>
        v.treatment_id === treatmentId && v.row_index === rowIndex && v.field_def_id === fieldDefId
          ? { ...v, value }
          : v
      )
    );
  }

  const fieldsWithGeometry = farmFields.filter((f) => f.geometry);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const url    = experimentId
      ? `/api/experiments/${farmId}/${experimentId}`
      : `/api/experiments/${farmId}`;
    const method = experimentId ? "PUT" : "POST";
    try {
      const res = await fetch(url, {
        method,
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
              taskOverrides: r.taskOverrides.length > 0
                ? r.taskOverrides.map((o) => ({ template_id: o.template_id, due_date: o.due_date || null, user_ids: o.user_ids }))
                : undefined,
            })),
          drones: droneRows
            .filter((r) => r.drone_id)
            .map((r) => ({
              drone_id:      r.drone_id,
              n_flights:     r.n_flights ? parseInt(r.n_flights) : null,
              expected_date: r.expected_date || null,
              status:        r.status || null,
              taskOverrides: r.taskOverrides.length > 0
                ? r.taskOverrides.map((o) => ({ template_id: o.template_id, due_date: o.due_date || null, user_ids: o.user_ids }))
                : undefined,
            })),
          treatments: treatmentRows
            .filter((r) => r.treatment_id)
            .map((r) => ({
              treatment_id:             r.treatment_id,
              is_continuous:            r.is_continuous,
              has_control_treatment:    r.has_control_treatment,
              control_treatment_type:   r.has_control_treatment ? (r.control_treatment_type || null) : null,
              control_treatment_number: r.has_control_treatment && r.control_treatment_type === "treatment"
                ? (r.control_treatment_number ? parseInt(r.control_treatment_number) : null)
                : null,
            })),
          treatmentValues: treatmentValues.filter((v) =>
            treatmentRows.some((r) => r.treatment_id === v.treatment_id)
          ),
          field_ids: Array.from(selectedFieldIds),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      router.push(`/farms/${farmId}/experiments`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    await fetch(`/api/experiments/${farmId}/${experimentId}`, { method: "DELETE" });
    router.push(`/farms/${farmId}/experiments`);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
          <Link href="/farms" className="hover:text-slate-900">Farms</Link>
          <span>/</span>
          <Link href={`/farms/${farmId}`} className="hover:text-slate-900">
            {farmName ?? `Farm #${farmId}`}
          </Link>
          <span>/</span>
          <Link href={`/farms/${farmId}/experiments`} className="hover:text-slate-900">Experiments</Link>
          <span>/</span>
          <span>{experiment ? "Edit" : "New"}</span>
        </div>
        <h2 className="text-2xl font-bold text-slate-900">
          {experiment ? "Edit Experiment" : "Add Experiment"}
        </h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ── Experiment Card ── */}
        <div className="bg-white border rounded-lg p-6 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900 pb-2 border-b">Experiment Card</h3>

          <div className="space-y-1.5">
            <Label>Experiment Name</Label>
            <Input value={expName} onChange={(e) => setExpName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
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

        {/* ── Lab Design ── */}
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
              <div key={i} className={row.taskOverrides.length > 0 ? "border rounded-md p-2 space-y-2 bg-slate-50/50" : ""}>
                <div className="flex gap-2 items-center flex-wrap">
                  <select
                    className={`flex-1 min-w-32 ${SELECT}`}
                    value={row.test_id}
                    onChange={(e) => {
                      const newTestId = parseInt(e.target.value);
                      const tpl = allTests.find((t) => t.id === newTestId);
                      const updated = [...testRows];
                      updated[i] = {
                        ...updated[i],
                        test_id:       newTestId,
                        taskOverrides: tpl ? buildTaskOverrides(tpl.TaskTemplates) : [],
                      };
                      setTestRows(updated);
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
                      const updated = [...testRows];
                      updated[i] = { ...updated[i], n_samples: e.target.value };
                      setTestRows(updated);
                    }}
                  />
                  <DateInput
                    value={row.expected_date}
                    onChange={(v) => {
                      const updated = [...testRows];
                      updated[i] = { ...updated[i], expected_date: v };
                      setTestRows(updated);
                    }}
                  />
                  <select
                    className={`w-36 ${SELECT}`}
                    value={row.status}
                    onChange={(e) => {
                      const updated = [...testRows];
                      updated[i] = { ...updated[i], status: e.target.value };
                      setTestRows(updated);
                    }}
                  >
                    <option value="">— Status —</option>
                    {ASSIGNMENT_STATUSES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <Button type="button" variant="ghost" size="icon" onClick={() => setTestRows(testRows.filter((_, idx) => idx !== i))}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                {/* Task template overrides for this test */}
                {row.taskOverrides.length > 0 && (
                  <div className="rounded-md border border-blue-100 bg-blue-50/40 p-3 space-y-3">
                    <p className="text-xs font-semibold text-slate-600">Task Templates — set due dates &amp; assignees</p>
                    {row.taskOverrides.map((ovr, oi) => (
                      <div key={oi} className="space-y-2 pb-2 border-b border-blue-100 last:border-0 last:pb-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-slate-800">{ovr.description}</span>
                          {ovr.classification && (
                            <Badge variant="outline" className="text-xs">{ovr.classification}</Badge>
                          )}
                        </div>
                        <div className="flex gap-4 flex-wrap items-start">
                          <div className="space-y-1">
                            <p className="text-xs text-slate-500">Due Date</p>
                            <DateInput
                              value={ovr.due_date}
                              onChange={(v) => {
                                const updated = [...testRows];
                                const overrides = [...updated[i].taskOverrides];
                                overrides[oi] = { ...overrides[oi], due_date: v };
                                updated[i] = { ...updated[i], taskOverrides: overrides };
                                setTestRows(updated);
                              }}
                            />
                          </div>
                          {allUsers.length > 0 && (
                            <div className="space-y-1">
                              <p className="text-xs text-slate-500">Assignees</p>
                              <div className="space-y-1 max-h-28 overflow-y-auto">
                                {allUsers.map((u) => (
                                  <label key={u.id} className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                                    <input
                                      type="checkbox"
                                      className="h-3.5 w-3.5 rounded border-input"
                                      checked={ovr.user_ids.includes(u.id)}
                                      onChange={(e) => {
                                        const updated = [...testRows];
                                        const overrides = [...updated[i].taskOverrides];
                                        const newUserIds = e.target.checked
                                          ? [...overrides[oi].user_ids, u.id]
                                          : overrides[oi].user_ids.filter((uid) => uid !== u.id);
                                        overrides[oi] = { ...overrides[oi], user_ids: newUserIds };
                                        updated[i] = { ...updated[i], taskOverrides: overrides };
                                        setTestRows(updated);
                                      }}
                                    />
                                    {u.name ?? u.email}
                                  </label>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {allTests.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const first = allTests[0];
                  setTestRows([...testRows, {
                    test_id:       first.id,
                    n_samples:     "",
                    expected_date: "",
                    status:        "",
                    taskOverrides: buildTaskOverrides(first.TaskTemplates),
                  }]);
                }}
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Test
              </Button>
            )}
          </div>

          {/* Drone Flights */}
          <div className="space-y-2">
            <Label>Drone Flights</Label>
            {droneRows.map((row, i) => {
              const assignmentId  = row.id;
              const flightRecords = assignmentId != null ? (droneFlightRecordsMap[assignmentId] ?? []) : [];
              const isExpanded    = assignmentId != null && expandedDrones.has(assignmentId);

              return (
                <div key={i} className="border rounded-md p-2 space-y-2 bg-slate-50/50">
                  <div className="flex gap-2 items-center flex-wrap">
                    <select
                      className={`flex-1 min-w-32 ${SELECT}`}
                      value={row.drone_id}
                      onChange={(e) => {
                        const newDroneId = parseInt(e.target.value);
                        const drn = allDrones.find((d) => d.id === newDroneId);
                        const updated = [...droneRows];
                        updated[i] = {
                          ...updated[i],
                          drone_id:      newDroneId,
                          taskOverrides: drn ? buildTaskOverrides(drn.TaskTemplates) : [],
                        };
                        setDroneRows(updated);
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
                        const updated = [...droneRows];
                        updated[i] = { ...updated[i], n_flights: e.target.value };
                        setDroneRows(updated);
                      }}
                    />
                    <DateInput
                      value={row.expected_date}
                      onChange={(v) => {
                        const updated = [...droneRows];
                        updated[i] = { ...updated[i], expected_date: v };
                        setDroneRows(updated);
                      }}
                    />
                    <select
                      className={`w-36 ${SELECT}`}
                      value={row.status}
                      onChange={(e) => {
                        const updated = [...droneRows];
                        updated[i] = { ...updated[i], status: e.target.value };
                        setDroneRows(updated);
                      }}
                    >
                      <option value="">— Status —</option>
                      {ASSIGNMENT_STATUSES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    <Button type="button" variant="ghost" size="icon" onClick={() => setDroneRows(droneRows.filter((_, idx) => idx !== i))}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Task template overrides for this drone */}
                  {row.taskOverrides.length > 0 && (
                    <div className="rounded-md border border-blue-100 bg-blue-50/40 p-3 space-y-3">
                      <p className="text-xs font-semibold text-slate-600">Task Templates — set due dates &amp; assignees</p>
                      {row.taskOverrides.map((ovr, oi) => (
                        <div key={oi} className="space-y-2 pb-2 border-b border-blue-100 last:border-0 last:pb-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-slate-800">{ovr.description}</span>
                            {ovr.classification && (
                              <Badge variant="outline" className="text-xs">{ovr.classification}</Badge>
                            )}
                          </div>
                          <div className="flex gap-4 flex-wrap items-start">
                            <div className="space-y-1">
                              <p className="text-xs text-slate-500">Due Date</p>
                              <DateInput
                                value={ovr.due_date}
                                onChange={(v) => {
                                  const updated = [...droneRows];
                                  const overrides = [...updated[i].taskOverrides];
                                  overrides[oi] = { ...overrides[oi], due_date: v };
                                  updated[i] = { ...updated[i], taskOverrides: overrides };
                                  setDroneRows(updated);
                                }}
                              />
                            </div>
                            {allUsers.length > 0 && (
                              <div className="space-y-1">
                                <p className="text-xs text-slate-500">Assignees</p>
                                <div className="space-y-1 max-h-28 overflow-y-auto">
                                  {allUsers.map((u) => (
                                    <label key={u.id} className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                                      <input
                                        type="checkbox"
                                        className="h-3.5 w-3.5 rounded border-input"
                                        checked={ovr.user_ids.includes(u.id)}
                                        onChange={(e) => {
                                          const updated = [...droneRows];
                                          const overrides = [...updated[i].taskOverrides];
                                          const newUserIds = e.target.checked
                                            ? [...overrides[oi].user_ids, u.id]
                                            : overrides[oi].user_ids.filter((uid) => uid !== u.id);
                                          overrides[oi] = { ...overrides[oi], user_ids: newUserIds };
                                          updated[i] = { ...updated[i], taskOverrides: overrides };
                                          setDroneRows(updated);
                                        }}
                                      />
                                      {u.name ?? u.email}
                                    </label>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Individual flight records — only for saved assignments */}
                  {assignmentId != null && (
                    <div className="pl-1">
                      <button
                        type="button"
                        className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
                        onClick={() =>
                          setExpandedDrones((prev) => {
                            const next = new Set(prev);
                            next.has(assignmentId) ? next.delete(assignmentId) : next.add(assignmentId);
                            return next;
                          })
                        }
                      >
                        {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        Flight Records ({flightRecords.length})
                      </button>

                      {isExpanded && (
                        <div className="mt-2 space-y-1">
                          {flightRecords.length === 0 && (
                            <p className="text-xs text-slate-400 italic pl-1">No individual flight records yet.</p>
                          )}
                          {flightRecords.map((fr) => (
                            <button
                              key={fr.id}
                              type="button"
                              className="w-full flex items-center gap-3 text-xs text-left border rounded p-1.5 bg-white hover:bg-slate-50"
                              onClick={() => {
                                setEditingFlightRecord(fr);
                                setFlightFormAssignmentId(assignmentId);
                              }}
                            >
                              <span className="text-slate-500 w-24 shrink-0">
                                {fr.flight_date ? new Date(fr.flight_date + "T00:00:00").toLocaleDateString() : "No date"}
                              </span>
                              {fr.flight_status && (
                                <Badge variant="outline" className="text-xs shrink-0">{fr.flight_status}</Badge>
                              )}
                              {fr.total_acres != null && (
                                <span className="text-slate-500">{fr.total_acres} ac</span>
                              )}
                              {fr.needs_3d    && <Badge variant="outline" className="text-xs">3D</Badge>}
                              {fr.needs_ortho && <Badge variant="outline" className="text-xs">Ortho</Badge>}
                              {fr.processed   && <Badge variant="outline" className="text-xs bg-green-50 text-green-700">Done</Badge>}
                            </button>
                          ))}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="mt-1 text-xs h-7"
                            onClick={() => {
                              setEditingFlightRecord(null);
                              setFlightFormAssignmentId(assignmentId);
                            }}
                          >
                            <Plus className="h-3 w-3 mr-1" /> Add Flight Record
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {allDrones.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const first = allDrones[0];
                  setDroneRows([...droneRows, {
                    drone_id:      first.id,
                    n_flights:     "",
                    expected_date: "",
                    status:        "",
                    taskOverrides: buildTaskOverrides(first.TaskTemplates),
                  }]);
                }}
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Drone Assignment
              </Button>
            )}
          </div>

          {/* Flight record create/edit form */}
          {flightFormAssignmentId != null && (
            <DroneFlightRecordForm
              open
              onClose={() => { setFlightFormAssignmentId(null); setEditingFlightRecord(null); router.refresh(); }}
              experimentDroneFlightId={flightFormAssignmentId}
              record={editingFlightRecord as DroneFlightRecordData | null}
            />
          )}

          {/* Farm Level Treatments */}
          <div className="space-y-2">
            <Label>Farm Level Treatments</Label>
            {treatmentRows.map((row, i) => {
              const option         = getTreatmentOption(row.treatment_id);
              const fieldDefs      = option?.TreatmentFieldDefinitions ?? [];
              const allowExtraRows = option?.allow_extra_rows ?? false;
              const rowValues      = treatmentValues.filter((v) => v.treatment_id === row.treatment_id);
              const rowIndices     = [...new Set(rowValues.map((v) => v.row_index))].sort((a, b) => a - b);

              return (
                <div key={i} className="border rounded-md p-3 bg-slate-50 space-y-2">
                  <div className="flex gap-2 items-center flex-wrap">
                    <select
                      className={`flex-1 min-w-36 ${SELECT}`}
                      value={row.treatment_id}
                      onChange={(e) => {
                        const newId  = parseInt(e.target.value);
                        const newOpt = allTreatments.find((t) => t.id === newId);
                        const updated = [...treatmentRows];
                        updated[i] = { ...updated[i], treatment_id: newId };
                        setTreatmentRows(updated);
                        setTreatmentValues((prev) => prev.filter((v) => v.treatment_id !== row.treatment_id));
                        if (newOpt && newOpt.TreatmentFieldDefinitions.length > 0) {
                          seedInitialValueRow(newId, newOpt.TreatmentFieldDefinitions);
                        }
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
                        const updated = [...treatmentRows];
                        updated[i] = { ...updated[i], is_continuous: e.target.value === "continuous" };
                        setTreatmentRows(updated);
                      }}
                    >
                      <option value="continuous">Continuous</option>
                      <option value="categorical">Categorical</option>
                    </select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setTreatmentRows(treatmentRows.filter((_, idx) => idx !== i));
                        setTreatmentValues((prev) => prev.filter((v) => v.treatment_id !== row.treatment_id));
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Control/Treatment levels */}
                  <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={row.has_control_treatment}
                      onChange={(e) => {
                        const updated = [...treatmentRows];
                        updated[i] = { ...updated[i], has_control_treatment: e.target.checked, control_treatment_type: "", control_treatment_number: "" };
                        setTreatmentRows(updated);
                      }}
                      className="h-4 w-4 rounded border-input"
                    />
                    <span>Has Control/Treatment Levels</span>
                  </label>
                  {row.has_control_treatment && (
                    <div className="flex gap-2 items-center pl-6 flex-wrap">
                      <select
                        className={`w-36 ${SELECT}`}
                        value={row.control_treatment_type}
                        onChange={(e) => {
                          const updated = [...treatmentRows];
                          updated[i] = { ...updated[i], control_treatment_type: e.target.value as "control" | "treatment" | "", control_treatment_number: "" };
                          setTreatmentRows(updated);
                        }}
                      >
                        <option value="">— Type —</option>
                        <option value="control">Control</option>
                        <option value="treatment">Treatment</option>
                      </select>
                      {row.control_treatment_type === "treatment" && (
                        <Input
                          type="number"
                          min="1"
                          step="1"
                          placeholder="Number (e.g. 1)"
                          className="w-36"
                          value={row.control_treatment_number}
                          onChange={(e) => {
                            const updated = [...treatmentRows];
                            updated[i] = { ...updated[i], control_treatment_number: e.target.value };
                            setTreatmentRows(updated);
                          }}
                        />
                      )}
                    </div>
                  )}

                  {/* Template value rows */}
                  {fieldDefs.length > 0 && (
                    <div className="ml-2 space-y-1">
                      {/* Column headers */}
                      <div className="flex gap-2 text-xs font-medium text-slate-500 pb-0.5">
                        {fieldDefs.map((def) => (
                          <span key={def.id} className="flex-1 min-w-20">{def.label}</span>
                        ))}
                        <span className="w-7" />
                      </div>
                      {/* Value rows */}
                      {rowIndices.map((ri) => (
                        <div key={ri} className="flex gap-2 items-center">
                          {fieldDefs.map((def) => {
                            const cell = rowValues.find((v) => v.field_def_id === def.id && v.row_index === ri);
                            return (
                              <Input
                                key={def.id}
                                type={def.field_type === "number" ? "number" : "text"}
                                step="any"
                                className="flex-1 min-w-20 h-8 text-sm"
                                value={cell?.value ?? ""}
                                onChange={(e) => updateValueCell(row.treatment_id, ri, def.id, e.target.value)}
                              />
                            );
                          })}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => removeValueRow(row.treatment_id, ri)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                      {allowExtraRows && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => addValueRow(row.treatment_id, fieldDefs)}
                        >
                          <Plus className="h-3 w-3 mr-1" /> Add Row
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {allTreatments.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const first = allTreatments[0];
                  setTreatmentRows([
                    ...treatmentRows,
                    { treatment_id: first.id, is_continuous: true, has_control_treatment: false, control_treatment_type: "", control_treatment_number: "" },
                  ]);
                  seedInitialValueRow(first.id, first.TreatmentFieldDefinitions);
                }}
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Treatment
              </Button>
            )}
          </div>

          {/* Upload Field Boundaries */}
          <div className="space-y-1.5">
            <Label>Upload Field Boundaries</Label>
            <p className="text-xs text-slate-500">Upload a GeoJSON, shapefile, or GeoPackage to add new fields to this farm. After upload, select the new fields on the map below.</p>
            <FieldBoundaryUpload farmId={farmId} fieldCount={farmFields.length} />
          </div>

          {/* Linked Fields */}
          <div className="space-y-2">
            <Label>Linked Fields</Label>
            {farmFields.length === 0 ? (
              <p className="text-sm text-slate-400 italic">No fields have been added to this farm yet.</p>
            ) : fieldsWithGeometry.length > 0 ? (
              <>
                <p className="text-xs text-slate-500">Click a field polygon to select or deselect it.</p>
                <FieldSelectorMapWrapper
                  fields={fieldsWithGeometry.map((f) => ({ id: f.id, name: f.Name, geometry: f.geometry }))}
                  selectedIds={Array.from(selectedFieldIds)}
                  onToggle={toggleField}
                  uploadPins={farmUploadPins}
                />
                {selectedFieldIds.size > 0 && (
                  <p className="text-xs text-slate-500">
                    Selected:{" "}
                    {farmFields
                      .filter((f) => selectedFieldIds.has(f.id))
                      .map((f) => f.Name ?? `Field #${f.id}`)
                      .join(", ")}
                  </p>
                )}
              </>
            ) : (
              <div className="space-y-2 border rounded-md p-3">
                {farmFields.map((f) => (
                  <label key={f.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedFieldIds.has(f.id)}
                      onChange={() => toggleField(f.id)}
                    />
                    {f.Name ?? `Field #${f.id}`}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-3 items-center">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.push(`/farms/${farmId}/experiments`)}>
            Cancel
          </Button>
          {canDelete && experimentId && (
            <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
              <DialogTrigger render={<Button type="button" variant="destructive" className="ml-auto" />}>
                Delete Experiment
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete experiment?</DialogTitle>
                  <DialogDescription>
                    This will permanently delete{" "}
                    <strong>{experiment?.experiment_name ?? `Experiment #${experimentId}`}</strong>{" "}
                    and all its associated data. This cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
                    Cancel
                  </Button>
                  <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                    {deleting ? "Deleting…" : "Delete"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </form>

      {experimentId && (
        <ExperimentTasksSection
          experimentId={experimentId}
          users={allUsers}
          initialTasks={initialTasks ?? []}
          templates={taskTemplates ?? []}
        />
      )}
    </div>
  );
}
