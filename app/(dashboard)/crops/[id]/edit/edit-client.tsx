"use client";

import { useRouter } from "next/navigation";
import { CropForm } from "@/components/forms/crop-form";
import Link from "next/link";

interface Props {
  crop: { id: number; Crop_Name: string | null; Crop_Type: string | null };
}

export default function EditCropClient({ crop }: Props) {
  const router = useRouter();
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
          <Link href="/crops" className="hover:text-slate-900">Crops</Link>
          <span>/</span>
          <span>Edit</span>
        </div>
        <h2 className="text-2xl font-bold text-slate-900">Edit {crop.Crop_Name ?? `Crop #${crop.id}`}</h2>
      </div>
      <div className="bg-white border rounded-lg p-6">
        <CropForm cropId={crop.id} initialData={crop} onSuccess={() => router.push("/crops")} />
      </div>
    </div>
  );
}
