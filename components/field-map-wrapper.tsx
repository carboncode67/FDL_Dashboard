"use client"

import dynamic from "next/dynamic"

const FieldMap = dynamic(() => import("./field-map"), {
  ssr: false,
  loading: () => (
    <div
      className="rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center"
      style={{ height: 420 }}
    >
      <p className="text-sm text-slate-500">Loading map…</p>
    </div>
  ),
})

export default function FieldMapWrapper(props: { fieldName: string; geometry: string }) {
  return <FieldMap {...props} />
}
