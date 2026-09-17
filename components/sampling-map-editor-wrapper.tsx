"use client"

import dynamic from "next/dynamic"
import type { SamplingMapEditorProps } from "./sampling-map-editor"

const SamplingMapEditor = dynamic(() => import("./sampling-map-editor"), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 z-50 bg-white flex items-center justify-center">
      <p className="text-sm text-stone-500">Loading map…</p>
    </div>
  ),
})

export default function SamplingMapEditorWrapper(props: SamplingMapEditorProps) {
  return <SamplingMapEditor {...props} />
}
