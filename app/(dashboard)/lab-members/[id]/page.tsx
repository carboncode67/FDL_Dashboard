import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
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
import { LabMemberQrDisplay } from "./qr-display";
import { GrantAccessButton } from "./grant-access-button";

const STATUS_LABEL: Record<number, string> = { 1: "Unassigned", 2: "Farm Matched", 3: "Sorted" };
const STATUS_VARIANT: Record<number, "outline" | "secondary" | "default"> = {
  1: "outline",
  2: "secondary",
  3: "default",
};

const MEDIA_ICON: Record<string, string> = {
  photo: "Photo",
  recording: "Recording",
  note: "Note",
  location: "GPS Track",
};

export default async function LabMemberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const memberId = parseInt(id);

  const member = await prisma.labMember.findUnique({
    where: { id: memberId },
    include: {
      LabMemberUploads: {
        include: { Farm: { select: { id: true, Farm_Name: true } } },
        orderBy: { received_at: "desc" },
      },
    },
  });

  if (!member) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
            <Link href="/lab-members" className="hover:text-slate-900">Lab Members</Link>
            <span>/</span>
            <span>{member.Name ?? `Member #${member.id}`}</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900">{member.Name ?? `Member #${member.id}`}</h2>
          {member.Position && <p className="text-slate-500">{member.Position}</p>}
        </div>
        <Link
          href={`/lab-members/${member.id}/edit`}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          Edit
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 text-sm">
              <div>
                <span className="text-slate-500">Status</span>
                <p className="font-medium mt-0.5">
                  {member.Status ? (
                    <Badge variant={member.Status === "Active" ? "default" : "secondary"}>
                      {member.Status}
                    </Badge>
                  ) : "—"}
                </p>
              </div>
              <div>
                <span className="text-slate-500">Phone</span>
                <p className="font-medium mt-0.5">{member.Contact_Phone ?? "—"}</p>
              </div>
              <div>
                <span className="text-slate-500">Email</span>
                <p className="font-medium mt-0.5">{member.Contact_Email ?? "—"}</p>
              </div>
              <div>
                <span className="text-slate-500">FAA Part 107</span>
                <p className="font-medium mt-0.5">
                  <Badge variant={member.FAA_Part_107 ? "default" : "outline"}>
                    {member.FAA_Part_107 ? "Certified" : "No"}
                  </Badge>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Mobile App Access</CardTitle></CardHeader>
          <CardContent>
            {member.token ? (
              <>
                <p className="text-sm text-slate-500 mb-3">
                  Scan this QR code with the FarmerDataLogger app to connect this lab member.
                </p>
                <LabMemberQrDisplay memberId={member.id} />
                <div className="mt-3">
                  <GrantAccessButton memberId={member.id} />
                  <p className="text-xs text-slate-400 mt-1">Regenerates and invalidates the old code.</p>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-slate-500 mb-4">
                  No app access yet. Generate a QR code to allow this lab member to upload data.
                </p>
                <GrantAccessButton memberId={member.id} />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Uploads ({member.LabMemberUploads.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {member.LabMemberUploads.length === 0 ? (
            <p className="text-sm text-slate-500">No data uploaded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Farm</TableHead>
                  <TableHead>Date Collected</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Received</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {member.LabMemberUploads.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <Badge variant="outline">{MEDIA_ICON[u.media_type] ?? u.media_type}</Badge>
                    </TableCell>
                    <TableCell>
                      {u.Farm ? (
                        <Link href={`/farms/${u.Farm.id}`} className="text-blue-600 hover:underline text-sm">
                          {u.Farm.Farm_Name ?? `Farm #${u.Farm.id}`}
                        </Link>
                      ) : <span className="text-slate-400">—</span>}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {u.date_collected?.toLocaleDateString() ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[u.status] ?? "outline"}>
                        {STATUS_LABEL[u.status] ?? u.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {u.received_at.toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
