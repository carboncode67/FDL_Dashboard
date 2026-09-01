"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PipelinesClient, type PipelineRow } from "./pipelines-client";
import { PipelineRunsClient, type PipelineRunRow } from "./pipeline-runs-client";

interface ProjectOption { id: number; name: string; }
interface DataTableOption {
  id: number; name: string; description: string | null; columnCount: number; hasSample: boolean;
}

export function PipelinesTabs({
  initialPipelines, projects, dataTables, runs, isAdmin,
}: {
  initialPipelines: PipelineRow[];
  projects: ProjectOption[];
  dataTables: DataTableOption[];
  runs: PipelineRunRow[];
  isAdmin: boolean;
}) {
  return (
    <Tabs defaultValue="pipelines" className="space-y-4">
      <TabsList>
        <TabsTrigger value="pipelines">Pipelines ({initialPipelines.length})</TabsTrigger>
        <TabsTrigger value="runs">Runs ({runs.length})</TabsTrigger>
      </TabsList>
      <TabsContent value="pipelines">
        <PipelinesClient
          initialPipelines={initialPipelines}
          projects={projects}
          dataTables={dataTables}
          isAdmin={isAdmin}
        />
      </TabsContent>
      <TabsContent value="runs">
        <PipelineRunsClient runs={runs} isAdmin={isAdmin} />
      </TabsContent>
    </Tabs>
  );
}
