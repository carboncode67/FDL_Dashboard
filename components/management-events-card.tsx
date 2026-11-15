import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// Farmer management events (planting, tillage, spraying, harvest…) synced from
// the OFE Dashboard (migration 096, lib/ofe-management-sync.ts). Read-only here:
// OFE owns them, so there are no edit controls.

export interface ManagementEventRow {
  id: number;
  event_date: string; // YYYY-MM-DD
  category: string;
  operation: string;
  fields: string[];
  experiment: string | null;
  implement: string | null;
  product: string | null;
  crop_variety: string | null;
  notes: string | null;
  attachments: number;
  entered_by: string | null;
  fromOfe: boolean;
}

const fmt = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export function ManagementEventsCard({ events, title = "Management" }: { events: ManagementEventRow[]; title?: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">{title}</CardTitle>
        {events.some((e) => e.fromOfe) && (
          <span className="text-xs text-muted-foreground">Entered in the OFE Dashboard · read-only</span>
        )}
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No management events recorded.</p>
        ) : (
          <ol className="divide-y text-sm">
            {events.map((e) => {
              const details = [e.product, e.crop_variety, e.implement].filter(Boolean).join(" · ");
              return (
                <li key={e.id} className="flex gap-4 py-2.5">
                  <span className="w-24 shrink-0 text-muted-foreground">{fmt(e.event_date)}</span>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium">{e.operation}</span>
                      <span className="text-xs text-muted-foreground">{e.category}</span>
                      {e.fields.map((f) => (
                        <Badge key={f} variant="outline">{f}</Badge>
                      ))}
                      {e.experiment && <Badge variant="secondary">{e.experiment}</Badge>}
                    </div>
                    {details && <p className="text-muted-foreground">{details}</p>}
                    {e.notes && <p className="whitespace-pre-line">{e.notes}</p>}
                    <p className="text-xs text-muted-foreground">
                      {[
                        e.entered_by && `by ${e.entered_by}`,
                        e.attachments > 0 && `${e.attachments} attachment${e.attachments === 1 ? "" : "s"}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
