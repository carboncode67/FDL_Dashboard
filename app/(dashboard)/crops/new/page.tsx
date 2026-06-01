"use client";

import { useRouter } from "next/navigation";
import { CropForm } from "@/components/forms/crop-form";
import Link from "next/link";

export default function NewCropPage() {
  const router = useRouter();
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
          <Link href="/crops" className="hover:text-slate-900">Crops</Link>
          <span>/</span>
          <span>New Crop</span>
        </div>
        <h2 className="text-2xl font-bold text-slate-900">New Crop</h2>
      </div>
      <div className="bg-white border rounded-lg p-6">
        <CropForm onSuccess={() => router.push("/crops")} />
      </div>
    </div>
  );
}
