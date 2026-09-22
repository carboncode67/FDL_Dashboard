"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { GeofenceLinkPicker } from "@/components/geofence-link-picker";

const TYPE_LABEL: Record<string, string> = { duration: "Track Duration", notification: "Notification" };

interface GeofenceBasicsFormProps {
  geofenceId: number;
  onSuccess?: () => void;
  initialData: {
    title: string;
    description: string | null;
    action_message: string | null;
    is_active: boolean;
    geofence_type: string;
    notify_on_circle_entry: boolean;
    notify_on_field_entry: boolean;
    circle_repeat_interval_days: number;
    field_repeat_interval_days: number;
    linked_form_id: number | null;
    linked_sampling_map_id: number | null;
  };
  forms: { id: number; title: string }[];
  samplingMaps: { id: number; name: string }[];
}

export function GeofenceBasicsForm({ geofenceId, onSuccess, initialData, forms, samplingMaps }: GeofenceBasicsFormProps) {
  const [title, setTitle] = useState(initialData.title);
  const [description, setDescription] = useState(initialData.description ?? "");
  const [actionMessage, setActionMessage] = useState(initialData.action_message ?? "");
  const [isActive, setIsActive] = useState(initialData.is_active);
  const [notifyCircle, setNotifyCircle] = useState(initialData.notify_on_circle_entry);
  const [notifyField, setNotifyField] = useState(initialData.notify_on_field_entry);
  const [circleIntervalDays, setCircleIntervalDays] = useState(initialData.circle_repeat_interval_days);
  const [fieldIntervalDays, setFieldIntervalDays] = useState(initialData.field_repeat_interval_days);
  const [linkedFormId, setLinkedFormId] = useState(initialData.linked_form_id);
  const [linkedSamplingMapId, setLinkedSamplingMapId] = useState(initialData.linked_sampling_map_id);
  const [saving, setSaving] = useState(false);

  const isDuration = initialData.geofence_type === "duration";

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
          ...(isDuration ? {} : { notify_on_circle_entry: notifyCircle, notify_on_field_entry: notifyField }),
          circle_repeat_interval_days: circleIntervalDays,
          field_repeat_interval_days: fieldIntervalDays,
          ...(isDuration ? {} : { linked_form_id: linkedFormId, linked_sampling_map_id: linkedSamplingMapId }),
        }),
      });
      onSuccess?.();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-stone-500">Type</Label>
        <Badge variant="outline">{TYPE_LABEL[initialData.geofence_type] ?? initialData.geofence_type}</Badge>
      </div>
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
        <p className="text-xs text-stone-500">
          Shown as the notification body when the assignee enters this geofence. Left blank, the app
          generates a message per event (&quot;You&apos;re near {"{Farm}"}&quot; / &quot;You&apos;ve entered {"{Field}"}&quot;).
        </p>
      </div>

      {isDuration ? (
        <div className="space-y-1.5 max-w-xs">
          <Label>Minimum days between repeat reminders</Label>
          <Input
            type="number"
            min={1}
            step={1}
            value={circleIntervalDays}
            onChange={(e) => setCircleIntervalDays(Math.max(1, parseInt(e.target.value, 10) || 1))}
          />
          <p className="text-xs text-stone-500">
            Re-entering within this window is still logged — only the repeat reminder is suppressed.
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Checkbox id="edit-notify-circle" checked={notifyCircle} onCheckedChange={(v) => setNotifyCircle(v === true)} />
              <Label htmlFor="edit-notify-circle" className="cursor-pointer font-normal">
                Notify when near fields (entering a zone)
              </Label>
            </div>
            {notifyCircle && (
              <div className="space-y-1.5 max-w-xs ml-7">
                <Label className="text-xs">Minimum days between repeat zone notifications</Label>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={circleIntervalDays}
                  onChange={(e) => setCircleIntervalDays(Math.max(1, parseInt(e.target.value, 10) || 1))}
                />
              </div>
            )}
            <div className="flex items-center gap-3">
              <Checkbox id="edit-notify-field" checked={notifyField} onCheckedChange={(v) => setNotifyField(v === true)} />
              <Label htmlFor="edit-notify-field" className="cursor-pointer font-normal">
                Notify when a specific field is entered
              </Label>
            </div>
            {notifyField && (
              <div className="space-y-1.5 max-w-xs ml-7">
                <Label className="text-xs">Minimum days between repeat field notifications</Label>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={fieldIntervalDays}
                  onChange={(e) => setFieldIntervalDays(Math.max(1, parseInt(e.target.value, 10) || 1))}
                />
              </div>
            )}
          </div>

          <GeofenceLinkPicker
            forms={forms}
            samplingMaps={samplingMaps}
            linkedFormId={linkedFormId}
            linkedSamplingMapId={linkedSamplingMapId}
            onChange={(formId, mapId) => { setLinkedFormId(formId); setLinkedSamplingMapId(mapId) }}
          />
        </>
      )}

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
