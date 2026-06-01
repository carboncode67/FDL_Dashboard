import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import EditCropClient from "./edit-client";

export default async function EditCropPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const crop = await prisma.crop.findUnique({ where: { id: parseInt(id) } });
  if (!crop) notFound();
  return <EditCropClient crop={{ id: crop.id, Crop_Name: crop.Crop_Name, Crop_Type: crop.Crop_Type }} />;
}
