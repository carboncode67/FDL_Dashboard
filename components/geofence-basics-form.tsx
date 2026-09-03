"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

interface GeofenceBasicsFormProps {
  geofenceId: number;
  onSuccess?: () => void;
  initialData: {
    title: string;
    description: string | null;
    action_message: string | null;
    is_active: boolean;
    notify_on_circle_entry: boolean;
    notify_on_field_entry: boolean;
  };
}

export function GeofenceBasicsForm({ geofenceId, onSuccess, initialData }: GeofenceBasicsFormProps) {
  const [title, setTitle] = useState(initialData.title);
  const [description, setDescription] = useState(initialData.description ?? "");
  const [actionMessage, setActionMessage] = useState(initialData.action_message ?? "");
  const [isActive, setIsActive] = useState(initialData.is_active);
  const [notifyCircle, setNotifyCircle] = useState(initialData.notify_on_circle_entry);
  const [notifyField, setNotifyField] = useState(initialData.notify_on_field_entry);
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
          action_message: actionMessage || null,
          is_active: isActive,
          notify_on_circle_entry: notifyCircle,
          notify_on_field_entry: notifyField,
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
        <Label>Notification message (optional override)</Label>
        <Input
          value={actionMessage}
          onChange={(e) => setActionMessage(e.target.value)}
          placeholder="Leave blank to auto-generate per event"
        />
        <p className="text-xs text-slate-500">
          Shown as the notification body when the assignee enters this geofence. Left blank, the app
          generates a message per event (&quot;You&apos;re near {"{Farm}"}&quot; / &quot;You&apos;ve entered {"{Field}"}&quot;).
        </p>
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <Checkbox id="edit-notify-circle" checked={notifyCircle} onCheckedChange={(v) => setNotifyCircle(v === true)} />
          <Label htmlFor="edit-notify-circle" className="cursor-pointer font-normal">
            Notify when near fields (entering a zone)
          </Label>
        </div>
        <div className="flex items-center gap-3">
          <Checkbox id="edit-notify-field" checked={notifyField} onCheckedChange={(v) => setNotifyField(v === true)} />
          <Label htmlFor="edit-notify-field" className="cursor-pointer font-normal">
            Notify when a specific field is entered
          </Label>
        </div>
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
