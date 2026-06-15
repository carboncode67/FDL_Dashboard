import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEditMode } from "@/lib/edit-mode";
import { canCreate, canEdit, canDelete, type Role } from "@/lib/roles";
import { DeleteFarmButton } from "./delete-button";
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
import { FarmExperimentsTab } from "@/components/farm-experiments-tab";
import { FieldBoundaryUpload } from "@/components/field-boundary-upload";
import { DocumentUpload } from "@/components/document-upload";
import { AddContactButton } from "@/components/add-contact-button";

const STATUS_LABELS: Record<number, { label: string; variant: "default" | "secondary" | "outline" }> = {
  1: { label: "Unassigned", variant: "outline" },
  2: { label: "Farm Matched", variant: "secondary" },
  3: { label: "Sorted", variant: "default" },
  4: { label: "Completed", variant: "default" },
};

export default async function FarmDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const farmId = parseInt(id);

  const [session, editMode] = await Promise.all([auth(), getEditMode()]);
  const role = (session?.user?.role ?? "viewer") as Role;
  const showCreate = canCreate(role);
  const showEdit = canEdit(role);
  const showDelete = canDelete(role, editMode);

  const [farm, allProjects, farmExperiments] = await Promise.all([
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
          include: { User: { select: { name: true } } },
        },
        Documents: {
          orderBy: { uploaded_at: "desc" },
        },
      },
    }),
    prisma.project.findMany({ select: { id: true, Project_Name: true } }),
    prisma.farmExperiment.findMany({
      where: { farm_id: farmId },
      orderBy: { id: "asc" },
      include: {
        Project:               { select: { id: true, Project_Name: true, Status: true, Year_Started: true } },
        ExperimentTests:        { include: { Test:      { select: { id: true, Test_Name: true } } } },
        ExperimentDroneFlights: { include: { Drone:     { select: { id: true, Name: true } } } },
        ExperimentTreatments:   { include: { Treatment: { select: { id: true, Treatment_Name: true } } } },
        ExperimentFields:       { select: { field_id: true } },
      },
    }),
  ]);

  if (!farm) notFound();

  const primaryContact = farm.Contacts.find((c) => !c.is_lab_member);

  const linkedProjectIds = new Set(farm.ProjectFarms.map((pf) => pf.Projects_id));
  const availableProjects = allProjects
    .filter((p) => !linkedProjectIds.has(p.id))
    .map((p) => ({ id: p.id, name: p.Project_Name ?? `Project #${p.id}` }));

  const linkedProjects = [
    ...new Map(
      farmExperiments
        .filter((e) => e.project_id && e.Project)
        .map((e) => [e.project_id, e.Project!])
    ).values(),
  ];

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
      uploaderName: u.User?.name ?? "Lab Member",
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
    uploaderName: u.User?.name ?? "Lab Member",
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

  const mappedExperiments = farmExperiments.map((fe) => ({
    id: fe.id,
    experiment_name: fe.experiment_name,
    start_date: fe.start_date?.toISOString() ?? null,
    end_date: fe.end_date?.toISOString() ?? null,
    hypothesis: fe.hypothesis,
    experiment_desc: fe.experiment_desc,
    measurements: fe.measurements,
    criteria: fe.criteria,
    lab_description: fe.lab_description,
    tests: fe.ExperimentTests.map((et) => ({
      id: et.id,
      test_id: et.test_id,
      test_name: et.Test.Test_Name,
      n_samples: et.n_samples,
      expected_date: et.expected_date?.toISOString() ?? null,
      status: et.status ?? null,
    })),
    drones: fe.ExperimentDroneFlights.map((ed) => ({
      id: ed.id,
      drone_id: ed.drone_id,
      drone_name: ed.Drone.Name,
      n_flights: ed.n_flights,
      expected_date: ed.expected_date?.toISOString() ?? null,
      status: ed.status ?? null,
    })),
    treatments: fe.ExperimentTreatments.map((et) => ({
      treatment_id:   et.treatment_id,
      treatment_name: et.Treatment.Treatment_Name,
      is_continuous:  et.is_continuous,
      rate:           et.rate !== null ? Number(et.rate) : null,
      rate_unit:      et.rate_unit ?? null,
    })),
    field_ids: fe.ExperimentFields.map((ef) => ef.field_id),
  }));

  const farmFieldNames = farm.Fields.map((f) => ({ id: f.id, name: f.Name }));
  const fieldGeometries = farm.Fields.map((f) => ({ id: f.id, geometry: f.geometry ?? null }));

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
          <p className="text-slate-500">{primaryContact?.name ? `Farmer: ${primaryContact.name}` : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          {showEdit && (
            <Link href={`/farms/${farm.id}/edit`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>Edit</Link>
          )}
          {showDelete && (
            <DeleteFarmButton farmId={farm.id} farmName={farm.Farm_Name} />
          )}
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="contacts">Contacts ({farm.Contacts.length})</TabsTrigger>
          <TabsTrigger value="summary">Farmer Summary</TabsTrigger>
          <TabsTrigger value="experiments">Experiments</TabsTrigger>
          <TabsTrigger value="documents">Documents ({farm.Documents.length})</TabsTrigger>
          <TabsTrigger value="uploads">Data Uploads ({totalUploads})</TabsTrigger>
        </TabsList>

        {/* ── Overview ── */}
        <TabsContent value="overview" className="mt-4 space-y-4">
          {/* Farm details + linked projects side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Farm Details</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="text-slate-500">Farm Name</span><p className="font-medium mt-0.5">{farm.Farm_Name ?? "—"}</p></div>
                  <div><span className="text-slate-500">Farmer Name</span><p className="font-medium mt-0.5">{primaryContact?.name ?? "—"}</p></div>
                  <div><span className="text-slate-500">Phone</span><p className="font-medium mt-0.5">{primaryContact?.phone ?? "—"}</p></div>
                  <div><span className="text-slate-500">Email</span><p className="font-medium mt-0.5">{primaryContact?.email ?? "—"}</p></div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Linked Projects ({linkedProjects.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {linkedProjects.length === 0 ? (
                  <p className="text-sm text-slate-500">No projects linked — assign an experiment to a project to link it here.</p>
                ) : (
                  <Table>
                    <TableHeader><TableRow><TableHead>Project Name</TableHead><TableHead>Status</TableHead><TableHead>Year Started</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {linkedProjects.map((proj) => (
                        <TableRow key={proj.id}>
                          <TableCell><Link href={`/projects/${proj.id}`} className="text-blue-600 hover:underline">{proj.Project_Name ?? `Project #${proj.id}`}</Link></TableCell>
                          <TableCell><Badge variant={proj.Status === "Active" ? "default" : "secondary"}>{proj.Status ?? "—"}</Badge></TableCell>
                          <TableCell>{proj.Year_Started ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Planned Activities — all upcoming tests/drones across all experiments */}
          {(() => {
            const allActivities = mappedExperiments.flatMap((exp) => [
              ...exp.tests
                .filter((t) => t.expected_date)
                .map((t) => ({
                  type: "Test",
                  name: t.test_name ?? `Test #${t.test_id}`,
                  experiment: exp.experiment_name ?? `Experiment #${exp.id}`,
                  experiment_id: exp.id,
                  expected_date: t.expected_date!,
                  status: t.status,
                })),
              ...exp.drones
                .filter((d) => d.expected_date)
                .map((d) => ({
                  type: "Drone Flight",
                  name: d.drone_name ?? `Drone #${d.drone_id}`,
                  experiment: exp.experiment_name ?? `Experiment #${exp.id}`,
                  experiment_id: exp.id,
                  expected_date: d.expected_date!,
                  status: d.status,
                })),
            ]).sort((a, b) => a.expected_date.localeCompare(b.expected_date));

            if (allActivities.length === 0) return null;
            return (
              <Card>
                <CardHeader><CardTitle className="text-base">Planned Activities</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Activity</TableHead>
                        <TableHead>Experiment</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allActivities.map((a, i) => (
                        <TableRow key={i}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">{a.type}</Badge>
                              <span className="font-medium text-sm">{a.name}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Link href={`/farms/${farm.id}/experiments/${a.experiment_id}`} className="text-blue-600 hover:underline text-sm">
                              {a.experiment}
                            </Link>
                          </TableCell>
                          <TableCell className="text-sm">{new Date(a.expected_date).toLocaleDateString()}</TableCell>
                          <TableCell>{a.status ? <Badge variant="secondary" className="text-xs">{a.status}</Badge> : <span className="text-slate-400 text-xs">—</span>}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            );
          })()}

          {/* Experiment summary cards (compact) */}
          {farmExperiments.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-700">Experiments</h3>
                <Link href={`/farms/${farm.id}/experiments/new`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                  + Add Experiment
                </Link>
              </div>
              <FarmExperimentsTab
                farmId={farm.id}
                experiments={mappedExperiments}
                farmFieldNames={farmFieldNames}
                farmName={farm.Farm_Name}
                farmerName={primaryContact?.name ?? null}
                fieldGeometries={fieldGeometries}
                compact
              />
            </div>
          )}

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

          <FieldBoundaryUpload farmId={farm.id} fieldCount={farm.Fields.length} />
        </TabsContent>

        {/* ── Contacts ── */}
        <TabsContent value="contacts" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Contacts</CardTitle>
              {showCreate && (
                <AddContactButton farmId={farm.id} farmName={farm.Farm_Name} />
              )}
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

        {/* ── Experiments ── */}
        <TabsContent value="experiments" className="mt-4">
          <FarmExperimentsTab
            farmId={farm.id}
            experiments={mappedExperiments}
            farmFieldNames={farmFieldNames}
            farmName={farm.Farm_Name}
            farmerName={primaryContact?.name ?? null}
            fieldGeometries={fieldGeometries}
          />
        </TabsContent>

        {/* ── Documents ── */}
        <TabsContent value="documents" className="mt-4 space-y-4">
          <DocumentUpload farmId={farm.id} />
          {farm.Documents.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Uploaded Documents</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Uploaded</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {farm.Documents.map((doc) => (
                      <TableRow key={doc.id}>
                        <TableCell className="font-medium">{doc.original_name ?? doc.filename}</TableCell>
                        <TableCell><Badge variant="secondary">{doc.file_type?.toUpperCase() ?? "—"}</Badge></TableCell>
                        <TableCell className="text-slate-500 text-sm">
                          {doc.file_size ? `${Math.round(doc.file_size / 1024)} KB` : "—"}
                        </TableCell>
                        <TableCell className="text-slate-500 text-sm">
                          {new Date(doc.uploaded_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-slate-500">{doc.description ?? "—"}</TableCell>
                        <TableCell>
                          <a
                            href={`/api/files/documents/${doc.filename}`}
                            className="text-blue-600 hover:underline text-sm"
                            download={doc.original_name ?? doc.filename}
                          >
                            Download
                          </a>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
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
