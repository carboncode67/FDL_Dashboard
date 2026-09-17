"use client"

import Link from "next/link"

interface EditBoundaryButtonProps {
  fieldId: number
  initialGeometry?: string | null
}

export function EditBoundaryButton({ fieldId, initialGeometry }: EditBoundaryButtonProps) {
  return (
    <Link
      href={`/fields/${fieldId}/draw`}
      className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50 transition-colors"
    >
      {initialGeometry ? "Edit Boundary" : "Draw Boundary"}
    </Link>
  )
}
