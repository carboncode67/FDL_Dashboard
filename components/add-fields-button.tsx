"use client"

import Link from "next/link"

interface AddFieldsButtonProps {
  farmId: number
}

export function AddFieldsButton({ farmId }: AddFieldsButtonProps) {
  return (
    <Link
      href={`/fields/new?farmId=${farmId}`}
      className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50 transition-colors"
    >
      Add Fields
    </Link>
  )
}
