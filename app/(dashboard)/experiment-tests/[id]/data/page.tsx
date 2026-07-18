import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export default async function ExperimentTestDataPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const experimentTestId = parseInt(id);
  if (isNaN(experimentTestId)) notFound();

  const et = await prisma.experimentTest.findUnique({
    where: { id: experimentTestId },
    include: {
      Test: {
        select: {
          id: true,
          Test_Name: true,
          TestFieldDefinitions: {
            orderBy: { col_index: "asc" },
            select: { col_index: true, field_type: true, label: true },
          },
        },
      },
      Experiment: {
        select: {
          id: true,
          experiment_name: true,
          farm_id: true,
          Farm: { select: { id: true, Farm_Name: true } },
        },
      },
      DataRows: { orderBy: { row_index: "asc" } },
    },
  });
  if (!et) notFound();

  const columns = et.Test.TestFieldDefinitions;
  const rows = et.DataRows;
  const testName = et.Test.Test_Name ?? `Test #${et.Test.id}`;
  const sourceFiles = [...new Set(rows.map((r) => r.source_file).filter(Boolean))] as string[];
  const lastIngested = rows.reduce<Date | null>(
    (max, r) => (r.ingested_at && (!max || r.ingested_at > max) ? r.ingested_at : max),
    null
  );

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
          <Link href={`/farms/${et.Experiment.farm_id}`} className="hover:text-slate-900">
            {et.Experiment.Farm?.Farm_Name ?? `Farm ${et.Experiment.farm_id}`}
          </Link>
          <span>/</span>
          <Link
            href={`/farms/${et.Experiment.farm_id}/experiments/${et.Experiment.id}`}
            className="hover:text-slate-900"
          >
            {et.Experiment.experiment_name ?? `Experiment ${et.Experiment.id}`}
          </Link>
          <span>/</span>
          <span>Data</span>
        </div>
        <h2 className="text-2xl font-bold text-slate-900">{testName} — Collected Data</h2>
        <p className="text-sm text-slate-500 mt-1">
          {rows.length} row{rows.length === 1 ? "" : "s"}
          {lastIngested ? ` · last ingested ${lastIngested.toLocaleDateString()}` : ""}
          {sourceFiles.length > 0 ? ` · from ${sourceFiles.join(", ")}` : ""}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Data Template</CardTitle>
        </CardHeader>
        <CardContent>
          {columns.length === 0 ? (
            <p className="text-sm text-slate-500">
              No template columns defined.{" "}
              <Link href={`/tests/${et.Test.id}/edit`} className="text-blue-600 hover:underline">
                Define them on the test
              </Link>
              .
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {columns.map((c) => (
                <Badge key={c.col_index} variant="secondary">
                  {c.label}
                  <span className="ml-1 text-slate-400">({c.field_type})</span>
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {rows.length > 0 && columns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ingested Rows</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    {columns.map((c) => (
                      <TableHead key={c.col_index}>{c.label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const data = r.data as Record<string, string | number | null>;
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="text-slate-400">{r.row_index + 1}</TableCell>
                        {columns.map((c) => (
                          <TableCell key={c.col_index}>
                            {data[String(c.col_index)] ?? "—"}
                          </TableCell>
                        ))}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {rows.length === 0 && (
        <p className="text-sm text-slate-500">
          No data ingested yet. Data tables placed in this test&apos;s{" "}
          <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">Tests/{testName}/db/</code>{" "}
          folder are ingested when the client sync runs.
        </p>
      )}
    </div>
  );
}
