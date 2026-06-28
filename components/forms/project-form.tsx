"use client";

import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DuplicateWarningDialog, checkDuplicates, type DuplicateMatch } from "@/components/duplicate-warning-dialog";

interface ProjectFormProps {
  onSuccess?: () => void;
  initialData?: {
    Project_Name?: string | null;
    Status?: string | null;
    Year_Started?: number | null;
    Total_Budget?: number | null;
    Project_Sponsors?: string | null;
  };
  projectId?: number;
}

export function ProjectForm({ onSuccess, initialData, projectId }: ProjectFormProps) {
  const [name, setName] = useState(initialData?.Project_Name ?? "");
  const [status, setStatus] = useState(initialData?.Status ?? "");
  const [year, setYear] = useState(initialData?.Year_Started?.toString() ?? "");
  const [budget, setBudget] = useState(initialData?.Total_Budget?.toString() ?? "");
  const [sponsors, setSponsors] = useState(initialData?.Project_Sponsors ?? "");
  const [saving, setSaving] = useState(false);
  const [dupCandidates, setDupCandidates] = useState<DuplicateMatch[]>([]);
  const confirmedRef = useRef(false);

  async function doSave() {
    setSaving(true);
    try {
      const url = projectId ? `/api/projects/${projectId}` : "/api/projects";
      const method = projectId ? "PUT" : "POST";
      await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          Project_Name: name,
          Status: status,
          Year_Started: year ? parseInt(year) : null,
          Total_Budget: budget ? parseFloat(budget) : null,
          Project_Sponsors: sponsors,
        }),
      });
      onSuccess?.();
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId && !confirmedRef.current) {
      const dupes = await checkDuplicates("projects", name);
      if (dupes.length > 0) {
        setDupCandidates(dupes);
        return;
      }
    }
    await doSave();
  }

  return (
    <>
    <DuplicateWarningDialog
      open={dupCandidates.length > 0}
      entityLabel="Project"
      duplicates={dupCandidates}
      onConfirm={() => { confirmedRef.current = true; setDupCandidates([]); doSave(); }}
      onCancel={() => setDupCandidates([])}
    />
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label>Project Name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="space-y-1.5">
        <Label>Status</Label>
        <Select value={status} onValueChange={(v) => setStatus(v ?? "")}>
          <SelectTrigger>
            <SelectValue placeholder="Select status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="Completed">Completed</SelectItem>
            <SelectItem value="Pending">Pending</SelectItem>
            <SelectItem value="Inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Year Started</Label>
        <Input type="number" value={year} onChange={(e) => setYear(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>Total Budget ($)</Label>
        <Input type="number" step="0.01" value={budget} onChange={(e) => setBudget(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>Sponsors</Label>
        <Input value={sponsors} onChange={(e) => setSponsors(e.target.value)} />
      </div>
      <Button type="submit" disabled={saving} className="w-full">
        {saving ? "Saving..." : projectId ? "Update" : "Create"}
      </Button>
    </form>
    </>
  );
}
