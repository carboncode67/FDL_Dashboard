import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Link from "next/link";
import { format } from "date-fns";
import { RelationPicker } from "@/components/relation-picker";
import FieldMapWrapper from "@/components/field-map-wrapper";

export default async function FieldDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fieldId = parseInt(id);

  const [field, allTests, allCrops, allDrones] = await Promise.all([
    prisma.field.findUnique({
      where: { id: fieldId },
      include: {
        Farm: true,
        FieldTests: { include: { Test: true } },
        FieldCrops: { include: { Crop: true } },
        FieldDrones: { include: { Drone: true } },
      },
    }),
    prisma.test.findMany({ select: { id: true, Test_Name: true } }),
    prisma.crop.findMany({ select: { id: true, Crop_Name: true } }),
    prisma.drone.findMany({ select: { id: true, Name: true } }),
  ]);

  if (!field) notFound();

  const linkedTestIds = new Set(field.FieldTests.map((ft) => ft.Tests_id));
  const linkedCropIds = new Set(field.FieldCrops.map((fc) => fc.Crops_id));
  const linkedDroneIds = new Set(field.FieldDrones.map((fd) => fd.Drones_id));

  const availableTests = allTests
    .filter((t) => !linkedTestIds.has(t.id))
    .map((t) => ({ id: t.id, name: t.Test_Name ?? `Test #${t.id}` }));

  const availableCrops = allCrops
    .filter((c) => !linkedCropIds.has(c.id))
    .map((c) => ({ id: c.id, name: c.Crop_Name ?? `Crop #${c.id}` }));

  const availableDrones = allDrones
    .filter((d) => !linkedDroneIds.has(d.id))
    .map((d) => ({ id: d.id, name: d.Name ?? `Drone #${d.id}` }));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
            <Link href="/fields" className="hover:text-slate-900">Fields</Link>
            <span>/</span>
            <span>{field.Name ?? `Field #${field.id}`}</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900">
            {field.Name ?? `Field #${field.id}`}
          </h2>
          {field.Farm && (
            <p className="text-slate-500">
              Farm: <Link href={`/farms/${field.Farm.id}`} className="text-blue-600 hover:underline">{field.Farm.Farm_Name ?? `Farm #${field.Farm.id}`}</Link>
            </p>
          )}
        </div>
        <Link href={`/fields/${field.id}/edit`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>Edit</Link>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview & Map</TabsTrigger>
          <TabsTrigger value="tests">Tests ({field.FieldTests.length})</TabsTrigger>
          <TabsTrigger value="crops">Crops ({field.FieldCrops.length})</TabsTrigger>
          <TabsTrigger value="drones">Drone Flights ({field.FieldDrones.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Field Details</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-slate-500">Field Name</span><p className="font-medium mt-0.5">{field.Name ?? "—"}</p></div>
                <div><span className="text-slate-500">Boundary Source</span><p className="font-medium mt-0.5">{field.boundary_source ?? "—"}</p></div>
                <div><span className="text-slate-500">Geometry</span><p className="font-medium mt-0.5"><Badge variant={field.geometry ? "default" : "outline"}>{field.geometry ? "Present" : "Not set"}</Badge></p></div>
              </div>
            </CardContent>
          </Card>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-6">
            <h3 className="font-medium text-slate-700 mb-3">Map Visualization</h3>
            {field.geometry ? (
              <FieldMapWrapper
                fieldName={field.Name ?? `Field #${field.id}`}
                geometry={field.geometry}
              />
            ) : (
              <p className="text-sm text-slate-400 italic">No geometry data available for this field.</p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="tests" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Field Tests</CardTitle>
              <RelationPicker label="Test" options={availableTests} apiPath={`/api/fields/${field.id}/tests`} />
            </CardHeader>
            <CardContent>
              {field.FieldTests.length === 0 ? (
                <p className="text-sm text-slate-500">No tests assigned</p>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead>Test Name</TableHead><TableHead>Planned Date</TableHead><TableHead>Completed Date</TableHead><TableHead>Cost</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {field.FieldTests.map((ft) => (
                      <TableRow key={ft.Tests_id}>
                        <TableCell className="font-medium">{ft.Test.Test_Name ?? "—"}</TableCell>
                        <TableCell>{ft.Test.Planned_Date ? format(new Date(ft.Test.Planned_Date), "MMM d, yyyy") : "—"}</TableCell>
                        <TableCell>{ft.Test.Completed_Date ? format(new Date(ft.Test.Completed_Date), "MMM d, yyyy") : "—"}</TableCell>
                        <TableCell>{ft.Test.Cost ? `$${Number(ft.Test.Cost).toLocaleString()}` : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="crops" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Crops</CardTitle>
              <RelationPicker label="Crop" options={availableCrops} apiPath={`/api/fields/${field.id}/crops`} />
            </CardHeader>
            <CardContent>
              {field.FieldCrops.length === 0 ? (
                <p className="text-sm text-slate-500">No crops assigned</p>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead>Crop Name</TableHead><TableHead>Crop Type</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {field.FieldCrops.map((fc) => (
                      <TableRow key={fc.Crops_id}>
                        <TableCell className="font-medium">{fc.Crop.Crop_Name ?? "—"}</TableCell>
                        <TableCell>{fc.Crop.Crop_Type ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="drones" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Drone Flights</CardTitle>
              <RelationPicker label="Drone" options={availableDrones} apiPath={`/api/fields/${field.id}/drones`} />
            </CardHeader>
            <CardContent>
              {field.FieldDrones.length === 0 ? (
                <p className="text-sm text-slate-500">No drone flights recorded</p>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead>Drone Name</TableHead><TableHead>Cost/Acre</TableHead><TableHead>Mobilization Cost</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {field.FieldDrones.map((fd) => (
                      <TableRow key={fd.Drones_id}>
                        <TableCell className="font-medium">{fd.Drone.Name ?? "—"}</TableCell>
                        <TableCell>{fd.Drone.Cost_Per_Acre ? `$${Number(fd.Drone.Cost_Per_Acre).toLocaleString()}` : "—"}</TableCell>
                        <TableCell>{fd.Drone.Mobilization_Cost ? `$${Number(fd.Drone.Mobilization_Cost).toLocaleString()}` : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
