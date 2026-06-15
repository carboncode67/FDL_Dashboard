"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";
import { ExperimentFieldsMapWrapper } from "@/components/experiment-fields-map-wrapper";

export type ExperimentTestItem = {
  id: number;
  test_id: number;
  test_name: string | null;
  n_samples: number | null;
  expected_date: string | null;
  status: string | null;
};

export type ExperimentDroneItem = {
  id: number;
  drone_id: number;
  drone_name: string | null;
  n_flights: number | null;
  expected_date: string | null;
  status: string | null;
};

export type ExperimentTreatmentItem = {
  treatment_id:   number;
  treatment_name: string | null;
  is_continuous:  boolean | null;
  rate:           number | null;
  rate_unit:      string | null;
};

export type ExperimentData = {
  id: number;
  experiment_name: string | null;
  start_date:      string | null;
  end_date:        string | null;
  hypothesis:      string | null;
  experiment_desc: string | null;
  measurements:    string | null;
  criteria:        string | null;
  lab_description: string | null;
  tests:      ExperimentTestItem[];
  drones:     ExperimentDroneItem[];
  treatments: ExperimentTreatmentItem[];
  field_ids:  number[];
};

type FieldName = { id: number; name: string | null };
type FieldGeometry = { id: number; geometry: string | null };

interface Props {
  farmId:          number;
  experiments:     ExperimentData[];
  farmFieldNames:  FieldName[];
  farmName?:       string | null;
  farmerName?:     string | null;
  fieldGeometries?: FieldGeometry[];
  compact?:        boolean;
}

function ExperimentCard({
  farmId,
  experiment,
  farmFieldNames,
  farmName,
  farmerName,
  fieldGeometries = [],
  compact = false,
}: {
  farmId:          number;
  experiment:      ExperimentData;
  farmFieldNames:  FieldName[];
  farmName?:       string | null;
  farmerName?:     string | null;
  fieldGeometries?: FieldGeometry[];
  compact?:        boolean;
}) {
  const hasData = !!(
    experiment.experiment_name ||
    experiment.hypothesis ||
    experiment.experiment_desc ||
    experiment.lab_description ||
    experiment.tests.length ||
    experiment.drones.length ||
    experiment.treatments.length ||
    experiment.field_ids.length
  );

  const linkedFieldNames = farmFieldNames
    .filter((f) => experiment.field_ids.includes(f.id))
    .map((f) => f.name ?? `Field #${f.id}`);

  return (
    <div className="space-y-3">
      {/* Experiment Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            {experiment.experiment_name ?? `Experiment #${experiment.id}`}
          </CardTitle>
          <Link
            href={`/farms/${farmId}/experiments/${experiment.id}`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Edit
          </Link>
        </CardHeader>
        <CardContent>
          {!hasData ? (
            <p className="text-sm text-slate-500 italic">No experiment info yet.</p>
          ) : (
            <div className="grid grid-cols-2 gap-4 text-sm">
              {farmName && (
                <div>
                  <span className="text-slate-500">Farm</span>
                  <p className="font-medium mt-0.5">{farmName}</p>
                </div>
              )}
              {farmerName && (
                <div>
                  <span className="text-slate-500">Farmer</span>
                  <p className="font-medium mt-0.5">{farmerName}</p>
                </div>
              )}
              <div>
                <span className="text-slate-500">Start Date</span>
                <p className="font-medium mt-0.5">
                  {experiment.start_date
                    ? new Date(experiment.start_date).toLocaleDateString()
                    : "—"}
                </p>
              </div>
              {experiment.end_date && (
                <div>
                  <span className="text-slate-500">End Date</span>
                  <p className="font-medium mt-0.5">{new Date(experiment.end_date).toLocaleDateString()}</p>
                </div>
              )}
              {experiment.hypothesis && (
                <div className="col-span-2">
                  <span className="text-slate-500">Hypothesis</span>
                  <p className="mt-0.5 whitespace-pre-wrap">{experiment.hypothesis}</p>
                </div>
              )}
              {experiment.experiment_desc && (
                <div className="col-span-2">
                  <span className="text-slate-500">Experiment</span>
                  <p className="mt-0.5 whitespace-pre-wrap">{experiment.experiment_desc}</p>
                </div>
              )}
              {experiment.measurements && (
                <div className="col-span-2">
                  <span className="text-slate-500">Measurements</span>
                  <p className="mt-0.5 whitespace-pre-wrap">{experiment.measurements}</p>
                </div>
              )}
              {experiment.criteria && (
                <div className="col-span-2">
                  <span className="text-slate-500">Criteria</span>
                  <p className="mt-0.5 whitespace-pre-wrap">{experiment.criteria}</p>
                </div>
              )}
              {linkedFieldNames.length > 0 && (
                <div className="col-span-2">
                  <span className="text-slate-500">Linked Fields</span>
                  <p className="mt-0.5 font-medium">{linkedFieldNames.join(", ")}</p>
                </div>
              )}
            </div>
          )}
          {(() => {
            const linkedGeometries = fieldGeometries.filter(
              (fg) => experiment.field_ids.includes(fg.id) && fg.geometry
            );
            if (linkedGeometries.length === 0) return null;
            return (
              <div className="mt-4">
                <ExperimentFieldsMapWrapper fields={linkedGeometries} />
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* Lab Design — hidden in compact/overview mode */}
      {!compact && (experiment.lab_description || experiment.tests.length > 0 || experiment.drones.length > 0 || experiment.treatments.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lab Design</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {experiment.lab_description && (
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Description</p>
                <p className="text-sm whitespace-pre-wrap">{experiment.lab_description}</p>
              </div>
            )}

            {experiment.tests.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Tests</p>
                <div className="space-y-1">
                  {experiment.tests.map((t, i) => (
                    <div key={i} className="flex items-center gap-3 text-sm py-1 border-b last:border-0">
                      <span className="flex-1 font-medium">{t.test_name ?? `Test #${t.test_id}`}</span>
                      <span className="text-slate-500">{t.n_samples != null ? `${t.n_samples} samples` : ""}</span>
                      <span className="text-slate-500">
                        {t.expected_date ? new Date(t.expected_date).toLocaleDateString() : ""}
                      </span>
                      {t.status && <Badge variant="outline" className="text-xs">{t.status}</Badge>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {experiment.drones.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Drone Flights</p>
                <div className="space-y-1">
                  {experiment.drones.map((d, i) => (
                    <div key={i} className="flex items-center gap-3 text-sm py-1 border-b last:border-0">
                      <span className="flex-1 font-medium">{d.drone_name ?? `Drone #${d.drone_id}`}</span>
                      <span className="text-slate-500">{d.n_flights != null ? `${d.n_flights} flights` : ""}</span>
                      <span className="text-slate-500">
                        {d.expected_date ? new Date(d.expected_date).toLocaleDateString() : ""}
                      </span>
                      {d.status && <Badge variant="outline" className="text-xs">{d.status}</Badge>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {experiment.treatments.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Farm Level Treatments</p>
                <div className="space-y-2">
                  {experiment.treatments.map((t, i) => (
                    <div key={i} className="flex items-center gap-3 text-sm py-1 border-b last:border-0">
                      <span className="flex-1 font-medium">{t.treatment_name ?? `Treatment #${t.treatment_id}`}</span>
                      <Badge variant="secondary" className="text-xs">
                        {t.is_continuous === false ? "Categorical" : "Continuous"}
                      </Badge>
                      {(t.rate != null || t.rate_unit) && (
                        <span className="text-slate-500">
                          {t.rate != null ? t.rate : ""}
                          {t.rate_unit ? ` ${t.rate_unit}` : ""}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export function FarmExperimentsTab({ farmId, experiments, farmFieldNames, farmName, farmerName, fieldGeometries, compact }: Props) {
  return (
    <div className="space-y-4">
      {!compact && (
        <div className="flex justify-end">
          <Link
            href={`/farms/${farmId}/experiments/new`}
            className={cn(buttonVariants({ size: "sm" }))}
          >
            <Plus className="h-4 w-4 mr-1" /> Add Experiment
          </Link>
        </div>
      )}

      {experiments.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-slate-500 text-sm italic">
            No experiments yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {experiments.map((exp) => (
            <ExperimentCard
              key={exp.id}
              farmId={farmId}
              experiment={exp}
              farmFieldNames={farmFieldNames}
              farmName={farmName}
              farmerName={farmerName}
              fieldGeometries={fieldGeometries}
              compact={compact}
            />
          ))}
        </div>
      )}
    </div>
  );
}
