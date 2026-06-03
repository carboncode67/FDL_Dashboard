"use client";

import { useEffect, useState } from "react";

export function LabMemberQrDisplay({ memberId }: { memberId: number }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`/api/lab-members/${memberId}/qr`)
      .then((r) => r.json())
      .then((data) => setDataUrl(data.dataUrl ?? null))
      .catch(() => setError(true));
  }, [memberId]);

  if (error) return <p className="text-sm text-red-500">Failed to generate QR code.</p>;
  if (!dataUrl) return <div className="h-32 w-32 bg-slate-100 animate-pulse rounded" />;

  return (
    <img
      src={dataUrl}
      alt="Mobile app QR code"
      className="h-40 w-40 rounded border"
    />
  );
}
