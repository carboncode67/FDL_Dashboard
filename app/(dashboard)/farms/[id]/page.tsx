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
import { RelationPicker } from "@/components/relation-picker";
import FarmMap from "@/components/farm-map-wrapper";

export default async function FarmDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const farmId = parseInt(id);

  const [farm, allProjects] = await Promise.all([
    prisma.farm.findUnique({
      where: { id: farmId },
      include: {
        Fields: true,
        ProjectFarms: { include: { Project: true } },
        ExperimentZones: {
          include: {
            Protocol: { include: { Treatment: true } },
          },
        },
        Contacts: {
          orderBy: { name: "asc" },
          include: {
            Photos: {
              where: { latitude: { not: null }, longitude: { not: null } },
              select: { id: true, filename: true, latitude: true, longitude: true, note: true, timestamp: true },
            },
            Notes: {
              where: { latitude: { not: null }, longitude: { not: null } },
              select: { id: true, latitude: true, longitude: true, content: true, timestamp: true },
            },
          },
        },
      },
    }),
    prisma.project.findMany({ select: { id: true, Project_Name: true } }),
  ]);

  if (!farm) notFound();

  const linkedProjectIds = new Set(farm.ProjectFarms.map((pf) => pf.Projects_id));
  const availableProjects = allProjects
    .filter((p) => !linkedProjectIds.has(p.id))
    .map((p) => ({ id: p.id, name: p.Project_Name ?? `Project #${p.id}` }));

  // Collect unique treatments from experiment zones
  const treatmentMap = new Map<number, { id: number; name: string; zoneName: string }>();
  for (const ez of farm.ExperimentZones) {
    if (ez.Protocol?.Treatment) {
      const t = ez.Protocol.Treatment;
      if (!treatmentMap.has(t.id)) {
        treatmentMap.set(t.id, {
          id: t.id,
          name: t.Treatment_Name ?? `Treatment #${t.id}`,
          zoneName: ez.Zone_Label ?? `Zone #${ez.id}`,
        });
      }
    }
  }
  const treatments = Array.from(treatmentMap.values());

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
            <Link href="/farms" className="hover:text-slate-900">Farms</Link>
            <span>/</span>
            <span>{farm.Farm_Name ?? `Farm #${farm.id}`}</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900">
            {farm.Farm_Name ?? `Farm #${farm.id}`}
          </h2>
          <p className="text-slate-500">{farm.Farmer_Name ? `Farmer: ${farm.Farmer_Name}` : ""}</p>
        </div>
        <Link href={`/farms/${farm.id}/edit`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>Edit</Link>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="fields">Fields ({farm.Fields.length})</TabsTrigger>
          <TabsTrigger value="projects">Projects ({farm.ProjectFarms.length})</TabsTrigger>
          <TabsTrigger value="treatments">Treatments ({treatments.length})</TabsTrigger>
          <TabsTrigger value="zones">Experiment Zones ({farm.ExperimentZones.length})</TabsTrigger>
          <TabsTrigger value="contacts">Contacts ({farm.Contacts.length})</TabsTrigger>
          <TabsTrigger value="map">Map</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Farm Details</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-slate-500">Farm Name</span><p className="font-medium mt-0.5">{farm.Farm_Name ?? "—"}</p></div>
                <div><span className="text-slate-500">Farmer Name</span><p className="font-medium mt-0.5">{farm.Farmer_Name ?? "—"}</p></div>
                <div><span className="text-slate-500">County</span><p className="font-medium mt-0.5">{farm.County ?? "—"}</p></div>
                <div><span className="text-slate-500">State</span><p className="font-medium mt-0.5">{farm.State ?? "—"}</p></div>
                <div><span className="text-slate-500">Phone</span><p className="font-medium mt-0.5">{farm.Contact_Phone ?? "—"}</p></div>
                <div><span className="text-slate-500">Email</span><p className="font-medium mt-0.5">{farm.Contact_Email ?? "—"}</p></div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fields" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Fields</CardTitle></CardHeader>
            <CardContent>
              {farm.Fields.length === 0 ? (
                <p className="text-sm text-slate-500">No fields registered</p>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead>Field Name</TableHead><TableHead>Boundary Source</TableHead><TableHead>Geometry</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {farm.Fields.map((f) => (
                      <TableRow key={f.id}>
                        <TableCell><Link href={`/fields/${f.id}`} className="text-blue-600 hover:underline">{f.Name ?? `Field #${f.id}`}</Link></TableCell>
                        <TableCell>{f.boundary_source ?? "—"}</TableCell>
                        <TableCell><Badge variant={f.geometry ? "default" : "outline"}>{f.geometry ? "Yes" : "No"}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="projects" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Associated Projects</CardTitle>
              <RelationPicker label="Project" options={availableProjects} apiPath={`/api/farms/${farm.id}/projects`} />
            </CardHeader>
            <CardContent>
              {farm.ProjectFarms.length === 0 ? (
                <p className="text-sm text-slate-500">No projects associated</p>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead>Project Name</TableHead><TableHead>Status</TableHead><TableHead>Year Started</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {farm.ProjectFarms.map((pf) => (
                      <TableRow key={pf.Projects_id}>
                        <TableCell><Link href={`/projects/${pf.Project.id}`} className="text-blue-600 hover:underline">{pf.Project.Project_Name ?? `Project #${pf.Project.id}`}</Link></TableCell>
                        <TableCell><Badge variant={pf.Project.Status === "Active" ? "default" : "secondary"}>{pf.Project.Status ?? "—"}</Badge></TableCell>
                        <TableCell>{pf.Project.Year_Started ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="treatments" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Treatments (via Experiment Zones)</CardTitle></CardHeader>
            <CardContent>
              {treatments.length === 0 ? (
                <p className="text-sm text-slate-500">No treatments linked via experiment zones</p>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead>Treatment Name</TableHead><TableHead>Zone</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {treatments.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-medium">{t.name}</TableCell>
                        <TableCell className="text-slate-500">{t.zoneName}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="zones" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Experiment Zones</CardTitle></CardHeader>
            <CardContent>
              {farm.ExperimentZones.length === 0 ? (
                <p className="text-sm text-slate-500">No experiment zones</p>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead>Zone Label</TableHead><TableHead>Rep #</TableHead><TableHead>Geometry</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {farm.ExperimentZones.map((ez) => (
                      <TableRow key={ez.id}>
                        <TableCell className="font-medium">{ez.Zone_Label ?? "—"}</TableCell>
                        <TableCell>{ez.Rep_Number ?? "—"}</TableCell>
                        <TableCell><Badge variant={ez.geometry ? "default" : "outline"}>{ez.geometry ? "Yes" : "No"}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="contacts" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Contacts</CardTitle>
              <Link href={`/contacts/new`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                + New Contact
              </Link>
            </CardHeader>
            <CardContent>
              {farm.Contacts.length === 0 ? (
                <p className="text-sm text-slate-500">No contacts linked to this farm</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>WhatsApp</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {farm.Contacts.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>
                          <Link href={`/contacts/${c.id}`} className="text-blue-600 hover:underline">
                            {c.name}
                          </Link>
                        </TableCell>
                        <TableCell>{c.phone ?? "—"}</TableCell>
                        <TableCell>{c.email ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant={c.whatsapp ? "default" : "outline"}>
                            {c.whatsapp ? "Yes" : "No"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="map" className="mt-4">
          <FarmMap
            fields={farm.Fields.map((f) => ({
              id: f.id,
              name: f.Name ?? `Field #${f.id}`,
              geometry: f.geometry ?? null,
            }))}
            zones={farm.ExperimentZones.map((ez) => ({
              id: ez.id,
              label: ez.Zone_Label ?? `Zone #${ez.id}`,
              repNumber: ez.Rep_Number ?? null,
              geometry: ez.geometry ?? null,
            }))}
            photos={farm.Contacts.flatMap((c) =>
              c.Photos.map((p) => ({
                id: p.id,
                filename: p.filename,
                latitude: p.latitude!,
                longitude: p.longitude!,
                note: p.note ?? null,
                contactName: c.name,
                timestamp: p.timestamp?.toISOString() ?? null,
              }))
            )}
            notes={farm.Contacts.flatMap((c) =>
              c.Notes.map((n) => ({
                id: n.id,
                latitude: n.latitude!,
                longitude: n.longitude!,
                content: n.content,
                contactName: c.name,
                timestamp: n.timestamp?.toISOString() ?? null,
              }))
            )}
            farmId={farm.id}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
