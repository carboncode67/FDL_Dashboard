"use client";

import { useState } from "react";

interface OnboardingMessageEditorProps {
  initialMessage: string;
}

export function OnboardingMessageEditor({ initialMessage }: OnboardingMessageEditorProps) {
  const [message, setMessage] = useState(initialMessage);
  const [saved, setSaved] = useState(initialMessage);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  const dirty = message !== saved;

  async function handleSave() {
    if (!message.trim()) return;
    setSaving(true);
    setNotice("");
    try {
      const res = await fetch("/api/admin/onboarding-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (res.ok) {
        setSaved(message);
        setNotice("Saved. This will be used the next time anyone is onboarded.");
      } else {
        const err = await res.json();
        setNotice(err.error ?? "Failed to save.");
      }
    } catch {
      setNotice("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <textarea
        className="w-full border border-slate-200 rounded-lg p-3 text-sm text-slate-800 resize-y focus:outline-none focus:ring-2 focus:ring-emerald-500"
        rows={10}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
      <p className="text-xs text-slate-500">
        This is the exact text sent the first time a farmer is onboarded over WhatsApp or SMS.
        Review against current IRB protocol language before saving, since this change applies
        to every future onboarding immediately and is not versioned.
      </p>
      {notice && <p className="text-xs text-emerald-700">{notice}</p>}
      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={saving || !dirty || !message.trim()}
          className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
        {dirty && (
          <button
            onClick={() => setMessage(saved)}
            className="text-sm text-slate-500 hover:text-slate-800"
          >
            Discard changes
          </button>
        )}
      </div>
    </div>
  );
}
