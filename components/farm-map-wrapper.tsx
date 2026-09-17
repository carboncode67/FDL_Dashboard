"use client"

import dynamic from "next/dynamic"
import type { FarmMapProps } from "./farm-map"

const FarmMap = dynamic(() => import("./farm-map"), {
  ssr: false,
  loading: () => (
    <div
      className="rounded-lg border border-stone-200 bg-stone-50 flex items-center justify-center"
      style={{ height: 520 }}
    >
      <p className="text-sm text-stone-500">Loading map…</p>
    </div>
  ),
})

export default function FarmMapWrapper(props: FarmMapProps) {
  return <FarmMap {...props} />
}
