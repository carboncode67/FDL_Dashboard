"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface CvatTask {
  id: number;
  name: string;
  status: string;
  image_count: number;
  cvat_task_id: number | null;
  created_at: string;
}

const STATUS_VARIANT: Record<string, "outline" | "secondary" | "default" | "destructive"> = {
  pending: "outline",
  in_progress: "secondary",
  completed: "default",
};

export function AnnotationTab({
  projectId,
  projectName,
  initialTasks,
  photoCount,
  canCreate,
}: {
  projectId: number;
  projectName: string;
  initialTasks: CvatTask[];
  photoCount: number;
  canCreate: boolean;
}) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initialTasks);
  const [showForm, setShowForm] = useState(false);
  const [taskName, setTaskName] = useState(`${projectName} – ${new Date().toLocaleDateString()}`);
  const [labels, setLabels] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ warning?: string; cvat_url?: string; cvat_configured?: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setResult(null);

    const labelSet = labels
      .split(",")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((name) => ({ name, type: "polygon" as const }));

    try {
      const res = await fetch("/api/annotations/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, name: taskName, label_set: labelSet }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create task");
        return;
      }
      setTasks((prev) => [data, ...prev]);
      setResult(data);
      setShowForm(false);
      router.refresh();
    } catch {
      setError("Network error — please try again");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(taskId: number) {
    if (!confirm("Delete this annotation task and all its annotations?")) return;
    const res = await fetch(`/api/annotations/tasks/${taskId}`, { method: "DELETE" });
    if (res.ok) {
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      router.refresh();
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Annotation Tasks</CardTitle>
        {canCreate && !showForm && (
          <Button size="sm" onClick={() => setShowForm(true)} disabled={photoCount === 0}>
            {photoCount === 0 ? "No photos in project" : "New Annotation Task"}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {result && (
          <div className="rounded-md border bg-slate-50 px-4 py-3 text-sm space-y-1">
            <p className="font-medium text-slate-800">Task created</p>
            {!result.cvat_configured && (
              <p className="text-slate-500">
                CVAT is not configured — task saved locally. Set <code>CVAT_URL</code>,{" "}
                <code>CVAT_USERNAME</code>, and <code>CVAT_PASSWORD</code> in your environment to
                enable CVAT sync.
              </p>
            )}
            {result.warning && <p className="text-amber-700">{result.warning}</p>}
            {result.cvat_url && (
              <a
                href={result.cvat_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                Open in CVAT →
              </a>
            )}
          </div>
        )}

        {showForm && (
          <form onSubmit={handleCreate} className="space-y-3 rounded-md border p-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Task name</label>
              <Input
                value={taskName}
                onChange={(e) => setTaskName(e.target.value)}
                required
                className="h-8"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">
                Labels <span className="text-slate-400 font-normal">(comma-separated)</span>
              </label>
              <Input
                value={labels}
                onChange={(e) => setLabels(e.target.value)}
                placeholder="corn blight, pest, healthy plant"
                className="h-8"
              />
            </div>
            <p className="text-xs text-slate-500">
              {photoCount} photo{photoCount !== 1 ? "s" : ""} in this project will be added to the task.
            </p>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={submitting}>
                {submitting ? "Creating…" : "Create Task"}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </form>
        )}

        {tasks.length === 0 ? (
          <p className="text-sm text-slate-500">No annotation tasks yet</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Images</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>CVAT</TableHead>
                {canCreate && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((task) => (
                <TableRow key={task.id}>
                  <TableCell className="font-medium">{task.name}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[task.status] ?? "outline"}>
                      {task.status.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell>{task.image_count}</TableCell>
                  <TableCell className="text-sm text-slate-500">
                    {new Date(task.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    {task.cvat_task_id ? (
                      <a
                        href={`${process.env.NEXT_PUBLIC_CVAT_URL ?? ""}/tasks/${task.cvat_task_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline text-sm"
                      >
                        Open
                      </a>
                    ) : (
                      <span className="text-slate-400 text-sm">—</span>
                    )}
                  </TableCell>
                  {canCreate && (
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-700 h-7 px-2"
                        onClick={() => handleDelete(task.id)}
                      >
                        Delete
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
