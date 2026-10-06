"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

interface Props {
  entityLabel: string          // "form" / "geofence" / "sampling map"
  entityName: string
  deleteUrl: string            // DELETE endpoint
  redirectTo: string           // where to go after a successful delete
  description: string
  // Deletion is limited to roles that may delete at all, and additionally needs Edit Mode on.
  // The section stays visible when Edit Mode is off (just disabled, with a hint) so it's findable.
  allowedByRole: boolean
  editMode: boolean
  // When set, the user must click the export link before Delete enables; the DELETE request then
  // carries ?confirm_exported=true (the API refuses without it).
  requireExport?: { href: string; label: string; warning: string }
}

export function DeleteEntitySection({
  entityLabel, entityName, deleteUrl, redirectTo, description, allowedByRole, editMode, requireExport,
}: Props) {
  const router = useRouter()
  const [exported, setExported] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!allowedByRole) return null
  const blockedByExport = !!requireExport && !exported

  async function handleDelete() {
    if (!confirm(`Permanently delete the ${entityLabel} "${entityName}"? This cannot be undone.`)) return
    setDeleting(true)
    setError(null)
    const res = await fetch(`${deleteUrl}${requireExport ? "?confirm_exported=true" : ""}`, { method: "DELETE" })
    if (res.ok) {
      router.push(redirectTo)
      router.refresh()
      return
    }
    const body = await res.json().catch(() => null)
    setError(body?.error ?? `Could not delete the ${entityLabel}.`)
    setDeleting(false)
  }

  return (
    <div className="bg-white border border-red-200 rounded-lg p-4 space-y-3">
      <h3 className="text-sm font-semibold text-red-700 pb-2 border-b border-red-100">Delete {entityLabel}</h3>
      <p className="text-sm text-stone-600">{description}</p>
      {!editMode && (
        <p className="text-sm text-amber-700">Turn on Edit Mode to enable deleting.</p>
      )}
      {requireExport && (
        <p className="text-sm text-amber-700">{requireExport.warning}</p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        {requireExport && (
          <a
            href={requireExport.href}
            download
            onClick={() => setExported(true)}
            className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium text-stone-800 hover:bg-stone-50"
          >
            {requireExport.label}
          </a>
        )}
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting || !editMode || blockedByExport}
          className="inline-flex items-center rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {deleting ? "Deleting…" : `Delete ${entityLabel}`}
        </button>
      </div>
    </div>
  )
}
