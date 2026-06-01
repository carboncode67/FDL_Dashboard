"use client"

import dynamic from "next/dynamic"
import type { FarmMapProps } from "./farm-map"

const FarmMap = dynamic(() => import("./farm-map"), {
  ssr: false,
  loading: () => (
    <div
      className="rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center"
      style={{ height: 520 }}
    >
      <p className="text-sm text-slate-500">Loading map…</p>
    </div>
  ),
})

export default function FarmMapWrapper(props: FarmMapProps) {
  return <FarmMap {...props} />
}
