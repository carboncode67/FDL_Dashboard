import { prisma } from "@/lib/prisma";
import { CropsClient } from "./crops-client";

export default async function CropsPage() {
  const crops = await prisma.crop.findMany({ orderBy: { id: "asc" } });
  const data = crops.map((c) => ({ id: c.id, Crop_Name: c.Crop_Name, Crop_Type: c.Crop_Type }));
  return <CropsClient data={data} />;
}
