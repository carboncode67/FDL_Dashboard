"use client"

import dynamic from "next/dynamic"

const UploadTrackMap = dynamic(() => import("./upload-track-map"), {
  ssr: false,
  loading: () => (
    <div
      className="rounded-md border bg-stone-50 flex items-center justify-center"
      style={{ height: 260 }}
    >
      <p className="text-sm text-stone-500">Loading map…</p>
    </div>
  ),
})

export default function UploadTrackMapWrapper(props: {
  coordinates: [number, number][]
  label?: string
}) {
  return <UploadTrackMap {...props} />
}
