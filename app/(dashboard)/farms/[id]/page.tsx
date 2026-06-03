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
import ReactMarkdown from "react-markdown";

const STATUS_LABELS: Record<number, { label: string; variant: "default" | "secondary" | "outline" }> = {
  1: { label: "Unassigned", variant: "outline" },
  2: { label: "Farm Matched", variant: "secondary" },
  3: { label: "Sorted", variant: "default" },
  4: { label: "Completed", variant: "default" },
};

export default async function FarmDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const farmId = parseInt(id);

  const [farm, allProjects] = await Promise.all([
    prisma.farm.findUnique({
      where: { id: farmId },
      include: {
        Fields: true,
        ProjectFarms: { include: { Project: true } },
        ExperimentZones: true,
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
        Photos: {
          orderBy: { received_at: "desc" },
          include: { Contact: { select: { name: true } } },
        },
        Notes: {
          orderBy: { received_at: "desc" },
          include: { Contact: { select: { name: true } } },
        },
        Recordings: {
          orderBy: { received_at: "desc" },
          include: { Contact: { select: { name: true } } },
        },
        Locations: {
          orderBy: { received_at: "desc" },
        },
        LabMemberUploads: {
          orderBy: { received_at: "desc" },
          include: { LabMember: { select: { Name: true } } },
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

  // Build merged upload list for the Data Uploads tab table
  type UploadRow = {
    key: string;
    type: string;
    uploaderName: string;
    date: Date | null;
    status: number;
    category: string | null;
  };

  const uploadRows: UploadRow[] = [
    ...farm.Photos.map((p) => ({
      key: `photo-${p.id}`,
      type: "Photo",
      uploaderName: p.Contact?.name ?? "—",
      date: p.received_at,
      status: p.status,
      category: p.category ?? null,
    })),
    ...farm.Notes.map((n) => ({
      key: `note-${n.id}`,
      type: "Note",
      uploaderName: n.Contact?.name ?? "—",
      date: n.received_at,
      status: n.status,
      category: n.category ?? null,
    })),
    ...farm.Recordings.map((r) => ({
      key: `recording-${r.id}`,
      type: "Recording",
      uploaderName: r.Contact?.name ?? "—",
      date: r.received_at,
      status: r.status,
      category: r.category ?? null,
    })),
    ...farm.Locations.map((l) => ({
      key: `location-${l.id}`,
      type: "GPS Track",
      uploaderName: "—",
      date: l.received_at,
      status: l.status,
      category: l.category ?? null,
    })),
    ...farm.LabMemberUploads.map((u) => ({
      key: `lab-${u.id}`,
      type: `${u.media_type.charAt(0).toUpperCase() + u.media_type.slice(1)} (Lab)`,
      uploaderName: u.LabMember?.Name ?? "Lab Member",
      date: u.received_at,
      status: u.status,
      category: u.category ?? null,
    })),
  ].sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));

  // Lab upload map pins (GPS-tagged only)
  const labUploadPins = farm.LabMemberUploads.filter(
    (u) => u.latitude != null && u.longitude != null
  ).map((u) => ({
    id: u.id,
    latitude: u.latitude!,
    longitude: u.longitude!,
    uploaderName: u.LabMember?.Name ?? "Lab Member",
    filename: u.filename ?? null,
    content: u.content ?? null,
    media_type: u.media_type,
    timestamp: u.date_collected?.toISOString() ?? u.received_at.toISOString(),
  }));

  // Contact photo/note pins for Data Uploads map
  const contactPhotosPins = farm.Contacts.flatMap((c) =>
    c.Photos.map((p) => ({
      id: p.id,
      filename: p.filename,
      latitude: p.latitude!,
      longitude: p.longitude!,
      note: p.note ?? null,
      contactName: c.name,
      timestamp: p.timestamp?.toISOString() ?? null,
    }))
  );

  const contactNotesPins = farm.Contacts.flatMap((c) =>
    c.Notes.map((n) => ({
      id: n.id,
      latitude: n.latitude!,
      longitude: n.longitude!,
      content: n.content,
      contactName: c.name,
      timestamp: n.timestamp?.toISOString() ?? null,
    }))
  );

  const totalUploads = uploadRows.length;

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
          <TabsTrigger value="contacts">Contacts ({farm.Contacts.length})</TabsTrigger>
          <TabsTrigger value="summary">Farmer Summary</TabsTrigger>
          <TabsTrigger value="uploads">Data Uploads ({totalUploads})</TabsTrigger>
        </TabsList>

        {/* ── Overview ── */}
        <TabsContent value="overview" className="mt-4 space-y-4">
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

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Linked Experiments ({farm.ProjectFarms.length})</CardTitle>
              <RelationPicker label="Project" options={availableProjects} apiPath={`/api/farms/${farm.id}/projects`} />
            </CardHeader>
            <CardContent>
              {farm.ProjectFarms.length === 0 ? (
                <p className="text-sm text-slate-500">No experiments linked</p>
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
            photos={[]}
            notes={[]}
            farmId={farm.id}
          />
        </TabsContent>

        {/* ── Contacts ── */}
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

        {/* ── Farmer Summary ── */}
        <TabsContent value="summary" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Farmer Summary</CardTitle></CardHeader>
            <CardContent>
              {farm.farm_summary ? (
                <div className="prose prose-sm max-w-none prose-headings:text-slate-900 prose-p:text-slate-700">
                  <ReactMarkdown>{farm.farm_summary}</ReactMarkdown>
                </div>
              ) : (
                <p className="text-sm text-slate-500 italic">
                  No farmer summary uploaded yet. Push markdown content to{" "}
                  <code className="text-xs bg-slate-100 px-1 rounded">POST /api/farms/{farm.id}/summary</code>{" "}
                  with a Bearer token.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Data Uploads ── */}
        <TabsContent value="uploads" className="mt-4 space-y-4">
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
            photos={contactPhotosPins}
            notes={contactNotesPins}
            labUploads={labUploadPins}
            farmId={farm.id}
          />

          <Card>
            <CardHeader><CardTitle className="text-base">All Uploads</CardTitle></CardHeader>
            <CardContent>
              {uploadRows.length === 0 ? (
                <p className="text-sm text-slate-500">No uploads for this farm yet</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Uploaded By</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Category</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {uploadRows.map((row) => {
                      const s = STATUS_LABELS[row.status] ?? { label: String(row.status), variant: "outline" as const };
                      return (
                        <TableRow key={row.key}>
                          <TableCell><Badge variant="secondary">{row.type}</Badge></TableCell>
                          <TableCell>{row.uploaderName}</TableCell>
                          <TableCell className="text-slate-500 text-sm">
                            {row.date ? new Date(row.date).toLocaleDateString() : "—"}
                          </TableCell>
                          <TableCell><Badge variant={s.variant}>{s.label}</Badge></TableCell>
                          <TableCell className="text-slate-500">{row.category ?? "—"}</TableCell>
                        </TableRow>
                      );
                    })}
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
