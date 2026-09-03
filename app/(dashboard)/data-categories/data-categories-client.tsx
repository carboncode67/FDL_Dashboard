"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ChevronDown,
  ChevronRight,
  Pencil,
  Plus,
  Tag,
  Trash2,
  X,
} from "lucide-react";

export interface MetricData {
  id: number;
  label: string;
  field_type: "text" | "number" | "select" | "boolean";
  unit: string | null;
  options: string[] | null;
  sort_order: number;
}

export interface CategoryData {
  id: number;
  name: string;
  media_types: string[];
  sort_order: number;
  Metrics: MetricData[];
}

const MEDIA_TYPE_OPTIONS = [
  { value: "photo", label: "Photo" },
  { value: "note", label: "Note" },
  { value: "recording", label: "Recording" },
  { value: "location", label: "GPS Track" },
  { value: "document", label: "Document" },
  { value: "video", label: "Video" },
];

const FIELD_TYPE_OPTIONS = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "select", label: "Select (dropdown)" },
  { value: "boolean", label: "Yes / No" },
];

function mediaTypeLabel(v: string) {
  return MEDIA_TYPE_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

function MetricEditor({
  initial,
  onCancel,
  onSubmit,
  saving,
}: {
  initial?: Partial<MetricData>;
  onCancel: () => void;
  onSubmit: (data: { label: string; field_type: string; unit: string; optionsText: string }) => void;
  saving: boolean;
}) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [fieldType, setFieldType] = useState<string>(initial?.field_type ?? "text");
  const [unit, setUnit] = useState(initial?.unit ?? "");
  const [optionsText, setOptionsText] = useState((initial?.options ?? []).join(", "));

  return (
    <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-3 space-y-2">
      <div className="flex gap-2">
        <Input
          placeholder="Metric label (e.g. Height)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="flex-1"
        />
        <select
          value={fieldType}
          onChange={(e) => setFieldType(e.target.value)}
          className="h-9 rounded-md border border-input bg-white px-2 text-sm text-slate-700"
        >
          {FIELD_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      {fieldType === "number" && (
        <Input
          placeholder="Unit (optional, e.g. in, cm, kg)"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
        />
      )}
      {fieldType === "select" && (
        <Input
          placeholder="Options, comma-separated (e.g. V1, V2, V3, VT)"
          value={optionsText}
          onChange={(e) => setOptionsText(e.target.value)}
        />
      )}
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={!label.trim() || saving}
          onClick={() => onSubmit({ label: label.trim(), field_type: fieldType, unit, optionsText })}
        >
          {saving ? "Saving…" : "Save Metric"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

function MetricRow({
  metric,
  canEdit,
  canDeleteMetric,
  onUpdated,
  onDeleted,
}: {
  metric: MetricData;
  canEdit: boolean;
  canDeleteMetric: boolean;
  onUpdated: (m: MetricData) => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleSubmit(data: { label: string; field_type: string; unit: string; optionsText: string }) {
    setSaving(true);
    try {
      const res = await fetch(`/api/category-metrics/${metric.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: data.label,
          field_type: data.field_type,
          unit: data.unit,
          options: data.field_type === "select"
            ? data.optionsText.split(",").map((s) => s.trim()).filter(Boolean)
            : [],
        }),
      });
      if (res.ok) {
        onUpdated(await res.json());
        setEditing(false);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete the "${metric.label}" metric? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/category-metrics/${metric.id}`, { method: "DELETE" });
      if (res.ok) onDeleted();
    } finally {
      setDeleting(false);
    }
  }

  if (editing) {
    return (
      <MetricEditor
        initial={metric}
        saving={saving}
        onCancel={() => setEditing(false)}
        onSubmit={handleSubmit}
      />
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm">
      <span className="font-medium text-slate-800">{metric.label}</span>
      <Badge variant="outline" className="text-xs">
        {FIELD_TYPE_OPTIONS.find((o) => o.value === metric.field_type)?.label ?? metric.field_type}
      </Badge>
      {metric.unit && <span className="text-xs text-slate-400">({metric.unit})</span>}
      {metric.field_type === "select" && metric.options && metric.options.length > 0 && (
        <span className="text-xs text-slate-400 truncate">{metric.options.join(", ")}</span>
      )}
      {canEdit && (
        <div className="ml-auto flex items-center gap-1">
          <Button size="icon-sm" variant="ghost" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          {canDeleteMetric && (
            <Button size="icon-sm" variant="ghost" disabled={deleting} onClick={handleDelete}>
              <Trash2 className="h-3.5 w-3.5 text-red-500" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function CategoryCard({
  category,
  canEdit,
  canDeleteCategory,
  onUpdated,
  onDeleted,
}: {
  category: CategoryData;
  canEdit: boolean;
  canDeleteCategory: boolean;
  onUpdated: (c: CategoryData) => void;
  onDeleted: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(category.name);
  const [mediaTypes, setMediaTypes] = useState<Set<string>>(new Set(category.media_types));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [addingMetric, setAddingMetric] = useState(false);
  const [addingMetricSaving, setAddingMetricSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleMediaType(v: string) {
    setMediaTypes((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v); else next.add(v);
      return next;
    });
  }

  async function handleSaveName() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/upload-categories/${category.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, media_types: Array.from(mediaTypes) }),
      });
      if (res.ok) {
        onUpdated(await res.json());
        setEditingName(false);
      } else {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Failed to save.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete the "${category.name}" category and all its metrics? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/upload-categories/${category.id}`, { method: "DELETE" });
      if (res.ok) onDeleted();
    } finally {
      setDeleting(false);
    }
  }

  async function handleAddMetric(data: { label: string; field_type: string; unit: string; optionsText: string }) {
    setAddingMetricSaving(true);
    try {
      const res = await fetch(`/api/upload-categories/${category.id}/metrics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: data.label,
          field_type: data.field_type,
          unit: data.unit,
          options: data.field_type === "select"
            ? data.optionsText.split(",").map((s) => s.trim()).filter(Boolean)
            : [],
        }),
      });
      if (res.ok) {
        const metric: MetricData = await res.json();
        onUpdated({ ...category, Metrics: [...category.Metrics, metric] });
        setAddingMetric(false);
      }
    } finally {
      setAddingMetricSaving(false);
    }
  }

  return (
    <div className="rounded-md border bg-white">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button className="text-slate-400 hover:text-slate-700" onClick={() => setExpanded((v) => !v)}>
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        {editingName ? (
          <div className="flex-1 space-y-2 py-1">
            <Input value={name} onChange={(e) => setName(e.target.value)} className="max-w-xs" />
            <div className="flex flex-wrap gap-3">
              {MEDIA_TYPE_OPTIONS.map((o) => (
                <label key={o.value} className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mediaTypes.has(o.value)}
                    onChange={() => toggleMediaType(o.value)}
                  />
                  {o.label}
                </label>
              ))}
            </div>
            <p className="text-xs text-slate-400">Leave all unchecked to apply to every upload type.</p>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex gap-2">
              <Button size="sm" disabled={!name.trim() || saving} onClick={handleSaveName}>
                {saving ? "Saving…" : "Save"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditingName(false);
                  setName(category.name);
                  setMediaTypes(new Set(category.media_types));
                  setError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            <Tag className="h-3.5 w-3.5 text-slate-400" />
            <span className="font-medium text-slate-800">{category.name}</span>
            <div className="flex flex-wrap gap-1">
              {category.media_types.length === 0 ? (
                <Badge variant="secondary" className="text-xs">All types</Badge>
              ) : (
                category.media_types.map((t) => (
                  <Badge key={t} variant="outline" className="text-xs">{mediaTypeLabel(t)}</Badge>
                ))
              )}
            </div>
            {category.Metrics.length > 0 && (
              <span className="text-xs text-slate-400">
                {category.Metrics.length} metric{category.Metrics.length !== 1 ? "s" : ""}
              </span>
            )}
            {canEdit && (
              <div className="ml-auto flex items-center gap-1">
                <Button size="icon-sm" variant="ghost" onClick={() => setEditingName(true)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                {canDeleteCategory && (
                  <Button size="icon-sm" variant="ghost" disabled={deleting} onClick={handleDelete}>
                    <Trash2 className="h-3.5 w-3.5 text-red-500" />
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {expanded && (
        <div className="border-t px-3 py-3 space-y-2">
          {category.Metrics.length === 0 && !addingMetric && (
            <p className="text-sm text-slate-400 italic">No metrics defined for this category.</p>
          )}
          {category.Metrics.map((metric) => (
            <MetricRow
              key={metric.id}
              metric={metric}
              canEdit={canEdit}
              canDeleteMetric={canDeleteCategory}
              onUpdated={(m) =>
                onUpdated({ ...category, Metrics: category.Metrics.map((x) => (x.id === m.id ? m : x)) })
              }
              onDeleted={() =>
                onUpdated({ ...category, Metrics: category.Metrics.filter((x) => x.id !== metric.id) })
              }
            />
          ))}

          {addingMetric ? (
            <MetricEditor
              saving={addingMetricSaving}
              onCancel={() => setAddingMetric(false)}
              onSubmit={handleAddMetric}
            />
          ) : (
            canEdit && (
              <Button size="sm" variant="outline" onClick={() => setAddingMetric(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Metric
              </Button>
            )
          )}
        </div>
      )}
    </div>
  );
}

export function DataCategoriesClient({
  categories: initialCategories,
  canEdit,
  canDeleteCategory,
}: {
  categories: CategoryData[];
  canEdit: boolean;
  canDeleteCategory: boolean;
}) {
  const router = useRouter();
  const [categories, setCategories] = useState(initialCategories);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newName, setNewName] = useState("");
  const [newMediaTypes, setNewMediaTypes] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleNewMediaType(v: string) {
    setNewMediaTypes((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v); else next.add(v);
      return next;
    });
  }

  async function handleAddCategory() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/upload-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), media_types: Array.from(newMediaTypes) }),
      });
      if (res.ok) {
        const category: CategoryData = await res.json();
        setCategories((prev) => [...prev, category]);
        setAddingCategory(false);
        setNewName("");
        setNewMediaTypes(new Set());
        router.refresh();
      } else {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Failed to create category.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Data Categories</h2>
          <p className="text-sm text-slate-500">
            Manage the categories used to sort uploads, and the metrics (e.g. Height, Growth Stage)
            collected when an upload is assigned to one.
          </p>
        </div>
        {canEdit && !addingCategory && (
          <Button onClick={() => setAddingCategory(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add Category
          </Button>
        )}
      </div>

      {addingCategory && (
        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">New Category</p>
            <Button size="icon-sm" variant="ghost" onClick={() => setAddingCategory(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <Input
            placeholder="Category name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="max-w-sm"
          />
          <div className="flex flex-wrap gap-3">
            {MEDIA_TYPE_OPTIONS.map((o) => (
              <label key={o.value} className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newMediaTypes.has(o.value)}
                  onChange={() => toggleNewMediaType(o.value)}
                />
                {o.label}
              </label>
            ))}
          </div>
          <p className="text-xs text-slate-400">Leave all unchecked to apply to every upload type.</p>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <Button size="sm" disabled={!newName.trim() || saving} onClick={handleAddCategory}>
            {saving ? "Saving…" : "Create Category"}
          </Button>
        </div>
      )}

      <div className="space-y-2">
        {categories.length === 0 && !addingCategory && (
          <p className="text-sm text-slate-400 italic">No categories defined yet.</p>
        )}
        {categories.map((category) => (
          <CategoryCard
            key={category.id}
            category={category}
            canEdit={canEdit}
            canDeleteCategory={canDeleteCategory}
            onUpdated={(c) => setCategories((prev) => prev.map((x) => (x.id === c.id ? c : x)))}
            onDeleted={() => setCategories((prev) => prev.filter((x) => x.id !== category.id))}
          />
        ))}
      </div>
    </div>
  );
}
