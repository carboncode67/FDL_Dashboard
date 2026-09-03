"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface GeofenceBasicsFormProps {
  geofenceId: number;
  onSuccess?: () => void;
  initialData: {
    title: string;
    description: string | null;
    action_message: string;
    is_active: boolean;
  };
}

export function GeofenceBasicsForm({ geofenceId, onSuccess, initialData }: GeofenceBasicsFormProps) {
  const [title, setTitle] = useState(initialData.title);
  const [description, setDescription] = useState(initialData.description ?? "");
  const [actionMessage, setActionMessage] = useState(initialData.action_message);
  const [isActive, setIsActive] = useState(initialData.is_active);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await fetch(`/api/geofences/${geofenceId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: description || null,
          action_message: actionMessage,
          is_active: isActive,
        }),
      });
      onSuccess?.();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label>Title</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
      </div>
      <div className="space-y-1.5">
        <Label>Description</Label>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>Notification message</Label>
        <Input value={actionMessage} onChange={(e) => setActionMessage(e.target.value)} required />
        <p className="text-xs text-slate-500">Shown as the notification body when the assignee enters this geofence.</p>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        Active
      </label>
      <Button type="submit" disabled={saving} className="w-full">
        {saving ? "Saving..." : "Update"}
      </Button>
    </form>
  );
}
