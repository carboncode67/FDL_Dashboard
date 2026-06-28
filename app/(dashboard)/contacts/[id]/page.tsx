import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEditMode } from "@/lib/edit-mode";
import { canEdit, canDelete, type Role } from "@/lib/roles";
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
import { QrDisplay } from "./qr-display";
import { DeleteContactButton } from "./delete-button";

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contactId = parseInt(id);

  const [session, editMode] = await Promise.all([auth(), getEditMode()]);
  const role = (session?.user?.role ?? "viewer") as Role;
  const showEdit = canEdit(role);
  const showDelete = canDelete(role, editMode);

  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    include: {
      Farm: { select: { id: true, Farm_Name: true } },
      Photos: { orderBy: { received_at: "desc" } },
      Recordings: { orderBy: { received_at: "desc" } },
      Notes: { orderBy: { received_at: "desc" } },
      Locations: { orderBy: { received_at: "desc" } },
    },
  });

  if (!contact) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
            <Link href="/contacts" className="hover:text-slate-900">Contacts</Link>
            <span>/</span>
            <span>{contact.name}</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900">{contact.name}</h2>
          {contact.Farm && (
            <p className="text-slate-500">
              Farm:{" "}
              <Link href={`/farms/${contact.Farm.id}`} className="text-blue-600 hover:underline">
                {contact.Farm.Farm_Name ?? `Farm #${contact.Farm.id}`}
              </Link>
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {showEdit && (
            <Link href={`/contacts/${contact.id}/edit`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>Edit</Link>
          )}
          {showDelete && (
            <DeleteContactButton contactId={contact.id} contactName={contact.name} />
          )}
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="photos">Photos ({contact.Photos.length})</TabsTrigger>
          <TabsTrigger value="recordings">Recordings ({contact.Recordings.length})</TabsTrigger>
          <TabsTrigger value="notes">Notes ({contact.Notes.length})</TabsTrigger>
          <TabsTrigger value="locations">Locations ({contact.Locations.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Contact Details</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-3 text-sm">
                  <div><span className="text-slate-500">Phone</span><p className="font-medium mt-0.5">{contact.phone ?? "—"}</p></div>
                  <div><span className="text-slate-500">Email</span><p className="font-medium mt-0.5">{contact.email ?? "—"}</p></div>
                  <div>
                    <span className="text-slate-500">WhatsApp</span>
                    <p className="font-medium mt-0.5">
                      <Badge variant={contact.whatsapp ? "default" : "outline"}>
                        {contact.whatsapp ? "Yes" : "No"}
                      </Badge>
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">Linked Farm</span>
                    <p className="font-medium mt-0.5">
                      {contact.Farm ? (
                        <Link href={`/farms/${contact.Farm.id}`} className="text-blue-600 hover:underline">
                          {contact.Farm.Farm_Name ?? `Farm #${contact.Farm.id}`}
                        </Link>
                      ) : "—"}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">Added</span>
                    <p className="font-medium mt-0.5">
                      {contact.created_at.toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Mobile App QR Code</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-slate-500 mb-3">
                  Scan this QR code with the FarmerDataLogger app to connect {contact.name}.
                </p>
                <QrDisplay contactId={contact.id} name={contact.name} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="photos" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Photos</CardTitle></CardHeader>
            <CardContent>
              {contact.Photos.length === 0 ? (
                <p className="text-sm text-slate-500">No photos uploaded</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Filename</TableHead>
                      <TableHead>Note</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Received</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contact.Photos.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono text-xs">{p.filename}</TableCell>
                        <TableCell>{p.note ?? "—"}</TableCell>
                        <TableCell className="text-xs text-slate-500">
                          {p.latitude != null && p.longitude != null
                            ? `${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}`
                            : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-slate-500">
                          {p.received_at.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recordings" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Recordings</CardTitle></CardHeader>
            <CardContent>
              {contact.Recordings.length === 0 ? (
                <p className="text-sm text-slate-500">No recordings uploaded</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Filename</TableHead>
                      <TableHead>Start</TableHead>
                      <TableHead>End</TableHead>
                      <TableHead>GPS Track</TableHead>
                      <TableHead>Received</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contact.Recordings.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-xs">{r.filename}</TableCell>
                        <TableCell className="text-xs">{r.start_time?.toLocaleString() ?? "—"}</TableCell>
                        <TableCell className="text-xs">{r.end_time?.toLocaleString() ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant={r.gps_filename ? "default" : "outline"}>
                            {r.gps_filename ? "Yes" : "No"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-slate-500">
                          {r.received_at.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notes" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Notes</CardTitle></CardHeader>
            <CardContent>
              {contact.Notes.length === 0 ? (
                <p className="text-sm text-slate-500">No notes uploaded</p>
              ) : (
                <div className="space-y-3">
                  {contact.Notes.map((n) => (
                    <div key={n.id} className="border rounded-md p-3">
                      <p className="text-sm">{n.content}</p>
                      <div className="flex gap-4 mt-2 text-xs text-slate-500">
                        {n.latitude != null && n.longitude != null && (
                          <span>{n.latitude.toFixed(5)}, {n.longitude.toFixed(5)}</span>
                        )}
                        <span>{n.received_at.toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="locations" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">GPS Tracks</CardTitle></CardHeader>
            <CardContent>
              {contact.Locations.length === 0 ? (
                <p className="text-sm text-slate-500">No location tracks uploaded</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Start</TableHead>
                      <TableHead>End</TableHead>
                      <TableHead>Track File</TableHead>
                      <TableHead>Received</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contact.Locations.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell>{l.name ?? "—"}</TableCell>
                        <TableCell className="text-xs">{l.start_time?.toLocaleString() ?? "—"}</TableCell>
                        <TableCell className="text-xs">{l.end_time?.toLocaleString() ?? "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{l.track_filename ?? "—"}</TableCell>
                        <TableCell className="text-xs text-slate-500">
                          {l.received_at.toLocaleString()}
                        </TableCell>
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
