import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAgent } from "@/lib/agent/auth";

const DEFAULT_WRITE_BUDGET = 200;
const MAX_WRITE_BUDGET = 500;
// Caps how far one token can stretch its budget by opening many runs.
const MAX_OPEN_RUNS = 3;
// Batch kinds run a few times a day; interactive kinds open one run per request.
const MAX_RUNS_PER_DAY: Record<string, number> = { sleuth: 50, cartographer: 500 };
const DAY_MS = 24 * 60 * 60 * 1000;

function optionalString(v: unknown, max: number): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
}

// POST /api/agent/runs {task?, model?, vision_model?, prompt_sha256?, write_budget?}
// Opens a run. Every agent write must carry an open run_id of this token.
export async function POST(req: Request) {
  return withAgent(req, "runs", async (agent) => {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const since = new Date(Date.now() - DAY_MS);
    const [open, today] = await Promise.all([
      prisma.agentRun.count({ where: { token_id: agent.token.id, status: "open", started_at: { gte: since } } }),
      prisma.agentRun.count({ where: { token_id: agent.token.id, started_at: { gte: since } } }),
    ]);
    if (open >= MAX_OPEN_RUNS) {
      return NextResponse.json({ error: `This token already has ${open} open runs — close one first` }, { status: 429 });
    }
    if (today >= (MAX_RUNS_PER_DAY[agent.kind] ?? 50)) {
      return NextResponse.json({ error: "Daily run limit reached for this token" }, { status: 429 });
    }

    const requested = typeof body.write_budget === "number" ? Math.floor(body.write_budget) : DEFAULT_WRITE_BUDGET;
    const sha = optionalString(body.prompt_sha256, 64);
    const run = await prisma.agentRun.create({
      data: {
        lab_id: agent.labId,
        token_id: agent.token.id,
        agent_kind: agent.kind,
        task: optionalString(body.task, 500),
        model: optionalString(body.model, 100),
        vision_model: optionalString(body.vision_model, 100),
        prompt_sha256: sha && /^[0-9a-f]{64}$/i.test(sha) ? sha.toLowerCase() : null,
        write_budget: Math.min(Math.max(requested, 1), MAX_WRITE_BUDGET),
      },
      select: { id: true, write_budget: true, started_at: true },
    });
    // agent_kind lets the broker enforce this kind's tool set (it comes from the token).
    return NextResponse.json(
      { run_id: run.id, agent_kind: agent.kind, write_budget: run.write_budget, started_at: run.started_at },
      { status: 201 },
    );
  });
}
