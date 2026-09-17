"use client";

import { useState } from "react";

interface EditModeToggleProps {
  initialEditMode: boolean;
}

export function EditModeToggle({ initialEditMode }: EditModeToggleProps) {
  const [editMode, setEditModeState] = useState(initialEditMode);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/edit-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !editMode }),
      });
      if (res.ok) {
        setEditModeState(!editMode);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div>
        <p className="text-sm font-medium text-stone-900">
          Status: {editMode ? (
            <span className="text-red-600 font-semibold">ON</span>
          ) : (
            <span className="text-stone-500">OFF</span>
          )}
        </p>
        <p className="text-xs text-stone-500 mt-0.5">
          {editMode
            ? "Members can currently delete records."
            : "Only admins can delete records."}
        </p>
      </div>
      <button
        onClick={toggle}
        disabled={loading}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 ${
          editMode ? "bg-red-500" : "bg-stone-200"
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
            editMode ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}
