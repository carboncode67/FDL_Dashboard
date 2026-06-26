"use client"

import dynamic from "next/dynamic"
import type { FieldDrawMapProps } from "./field-draw-map"

const FieldDrawMap = dynamic(() => import("./field-draw-map"), {
  ssr: false,
  loading: () => (
    <div
      className="rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center"
      style={{ height: 480 }}
    >
      <p className="text-sm text-slate-500">Loading map…</p>
    </div>
  ),
})

export default function FieldDrawMapWrapper(props: FieldDrawMapProps) {
  return <FieldDrawMap {...props} />
}
