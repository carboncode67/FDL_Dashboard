"use client"

import Link from "next/link"

interface DrawFieldButtonProps {
  farmId: number
}

export function DrawFieldButton({ farmId }: DrawFieldButtonProps) {
  return (
    <Link
      href={`/farms/${farmId}/draw-field`}
      className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
    >
      Draw New Field
    </Link>
  )
}
