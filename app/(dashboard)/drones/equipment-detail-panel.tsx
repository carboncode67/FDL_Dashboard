"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SlideOverForm } from "@/components/slide-over-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { EquipmentSignoutForm, type SignoutContact } from "@/components/forms/equipment-signout-form";

interface ActiveLoan {
  id: number;
  contactName: string;
  signedOutAt: string;
  dueAt: string;
}

interface EquipmentDetailPanelProps {
  open: boolean;
  onClose: () => void;
  droneId: number;
  droneName: string | null;
  quantity: number;
  activeLoans: ActiveLoan[];
  requiredByTests: string[];
  methodology: { id: number; title: string } | null;
  contacts: SignoutContact[];
}

function formatDate(iso: string) {
  return new Date(iso.slice(0, 10) + "T00:00:00").toLocaleDateString();
}

export function EquipmentDetailPanel({
  open, onClose, droneId, droneName, quantity, activeLoans, requiredByTests, methodology, contacts,
}: EquipmentDetailPanelProps) {
  const router = useRouter();
  const [returningId, setReturningId] = useState<number | null>(null);
  const [signoutOpen, setSignoutOpen] = useState(false);

  const available = quantity - activeLoans.length;

  async function handleReturn(loanId: number) {
    setReturningId(loanId);
    try {
      const res = await fetch(`/api/equipment-loans/${loanId}`, { method: "PATCH" });
      if (res.ok) router.refresh();
    } finally {
      setReturningId(null);
    }
  }

  return (
    <>
      <SlideOverForm
        open={open}
        onClose={onClose}
        title={droneName ?? `Equipment #${droneId}`}
        description="Loan status for this equipment item."
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <span className="text-sm font-medium">
              {available} of {quantity} available
            </span>
            <Button size="sm" disabled={available <= 0} onClick={() => setSignoutOpen(true)}>
              Sign Out a Unit
            </Button>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Currently Signed Out</p>
            {activeLoans.length === 0 ? (
              <p className="text-sm text-slate-400 italic">All units are available.</p>
            ) : (
              <ul className="divide-y rounded-md border">
                {activeLoans.map((loan) => {
                  const overdue = new Date(loan.dueAt) < new Date();
                  return (
                    <li key={loan.id} className="flex items-center justify-between gap-2 px-3 py-2">
                      <div className="text-sm">
                        <div className="font-medium">{loan.contactName}</div>
                        <div className="text-xs text-slate-500">
                          Out {formatDate(loan.signedOutAt)} ·{" "}
                          <Badge variant="outline" className={`text-xs ${overdue ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                            due {formatDate(loan.dueAt)}
                          </Badge>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={returningId === loan.id}
                        onClick={() => handleReturn(loan.id)}
                      >
                        {returningId === loan.id ? "Returning..." : "Return"}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {methodology && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Methodology</p>
              <Link href={`/methodologies/${methodology.id}/edit`} className="text-sm text-blue-600 hover:underline">
                {methodology.title}
              </Link>
            </div>
          )}

          {requiredByTests.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Used by Tests</p>
              <ul className="text-sm list-disc list-inside space-y-0.5">
                {requiredByTests.map((name, i) => <li key={i}>{name}</li>)}
              </ul>
            </div>
          )}
        </div>
      </SlideOverForm>

      <EquipmentSignoutForm
        open={signoutOpen}
        onClose={() => setSignoutOpen(false)}
        droneId={droneId}
        droneName={droneName}
        contacts={contacts}
      />
    </>
  );
}
