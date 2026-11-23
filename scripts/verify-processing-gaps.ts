/**
 * Checks lib/processing-gaps.ts ("Unprocessable data" flags, migration 102)
 * against a LOCAL / DEV database. Creates its own rows (tagged
 * PGAP-FIXTURE) and removes them at the end.
 *
 *   set -a; source .env.local; set +a
 *   TS_NODE_BASEURL=. TS_NODE_TRANSPILE_ONLY=1 npx ts-node -r tsconfig-paths/register \
 *     -O '{"module":"commonjs","moduleResolution":"node"}' scripts/verify-processing-gaps.ts
 */
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { evaluateGap, reevaluateGaps } from "@/lib/processing-gaps";

const TAG = "PGAP-FIXTURE";
const LAB = 1;
let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function gapOf(id: number) {
  return prisma.processingGap.findFirst({ where: { source_table: "documents", source_id: id } });
}

async function main() {
  const farm = await prisma.farm.findFirst({ where: { lab_id: LAB }, select: { id: true } });
  if (!farm) throw new Error("no farm in lab 1");

  const token = await prisma.agentToken.create({
    data: {
      lab_id: LAB, name: TAG, token_hash: crypto.randomBytes(32).toString("hex"), token_prefix: "pgap",
      agent_kind: "sleuth",
    },
  });
  const run = await prisma.agentRun.create({ data: { lab_id: LAB, token_id: token.id, task: TAG } });
  const docIds: number[] = [];
  const triggerIds: number[] = [];
  const doc = async (extra: Record<string, unknown> = {}) => {
    const d = await prisma.document.create({
      data: { filename: `${TAG}.pdf`, description: TAG, farm_id: farm.id, lab_id: LAB, status: 2, ...extra },
    });
    docIds.push(d.id);
    return d.id;
  };
  const observe = (id: number, data_product: string) =>
    prisma.$transaction(async (tx) => {
      await tx.agentObservation.updateMany({
        where: { source_table: "documents", source_id: id, status: "current" }, data: { status: "superseded" },
      });
      return tx.agentObservation.create({
        data: {
          lab_id: LAB, run_id: run.id, source_table: "documents", source_id: id, farm_id: farm.id,
          location_source: "farm", time_source: "upload", description: `${TAG} obs`, data_product,
        },
      });
    });

  try {
    // 1. Observed as a soil report while unsorted → no flag yet.
    const a = await doc();
    await observe(a, "soil_lab_report");
    check("unsorted upload isn't flagged", (await evaluateGap("documents", a)) === "unchanged" && !(await gapOf(a)));

    // 2. Sorted (category set) → flag opens.
    await prisma.document.update({ where: { id: a }, data: { category: `${TAG} Soil`, status: 3 } });
    check("sorted soil report → opened", (await evaluateGap("documents", a)) === "opened");
    check("gap row is open with the product", (await gapOf(a))?.status === "open" && (await gapOf(a))?.data_product === "soil_lab_report");
    check("re-evaluating is idempotent", (await evaluateGap("documents", a)) === "unchanged");

    // 3. An enabled pipeline trigger rule matching documents + this category → resolved.
    const p = await prisma.pipelineTrigger.create({
      data: { lab_id: LAB, pipeline_key: TAG.toLowerCase(), trigger_input: "card", match_table: "documents", match_category: `${TAG} Soil` },
    });
    triggerIds.push(p.id);
    const changed = await reevaluateGaps(LAB);
    const g3 = await gapOf(a);
    check("matching pipeline trigger resolves it", g3?.status === "resolved", `changed=${changed}`);

    // 4. Trigger switched off → re-opened.
    await prisma.pipelineTrigger.update({ where: { id: p.id }, data: { enabled: false } });
    await reevaluateGaps(LAB);
    check("switching the trigger off re-opens it", (await gapOf(a))?.status === "open");

    // 5. Dismissed → stays dismissed through re-observation and re-evaluation.
    await prisma.processingGap.update({ where: { id: (await gapOf(a))!.id }, data: { status: "dismissed", decided_at: new Date() } });
    await observe(a, "other_report");
    check("dismissal survives re-observation", (await evaluateGap("documents", a)) === "unchanged" && (await gapOf(a))?.status === "dismissed");

    // 6. "none" → never flagged.
    const b = await doc({ category: `${TAG} Misc`, status: 3 });
    await observe(b, "none");
    check('data_product "none" isn\'t flagged', (await evaluateGap("documents", b)) === "unchanged" && !(await gapOf(b)));

    // 7. Template-matched document (data_table_id) counts as covered.
    const dt = await prisma.dataTable.findFirst({ select: { id: true } });
    if (dt) {
      const c = await doc({ category: `${TAG} Misc`, status: 3, data_table_id: dt.id });
      await observe(c, "field_measurements");
      check("template-matched document isn't flagged", (await evaluateGap("documents", c)) === "unchanged" && !(await gapOf(c)));
    } else {
      console.log("SKIP template-matched document (no Data Table in this DB)");
    }

    // 8. Classification change on an open flag → updated; ignore type → removed.
    const d = await doc({ category: `${TAG} Misc`, status: 3 });
    await observe(d, "scale_tickets");
    check("scale tickets → opened", (await evaluateGap("documents", d)) === "opened");
    await observe(d, "yield_data");
    check("re-classified → updated", (await evaluateGap("documents", d)) === "updated" && (await gapOf(d))?.data_product === "yield_data");
    await prisma.processingGapIgnore.create({ data: { lab_id: LAB, data_product: "yield_data", note: TAG } });
    check("ignored type → flag removed", (await evaluateGap("documents", d)) === "removed" && !(await gapOf(d)));

    // 9. Un-sorting a flagged upload removes the open flag.
    await prisma.processingGapIgnore.deleteMany({ where: { lab_id: LAB, note: TAG } });
    await evaluateGap("documents", d);
    await prisma.document.update({ where: { id: d }, data: { category: null, status: 2 } });
    check("un-sorted → open flag removed", (await evaluateGap("documents", d)) === "removed");
  } finally {
    await prisma.processingGap.deleteMany({ where: { source_table: "documents", source_id: { in: docIds } } });
    await prisma.processingGapIgnore.deleteMany({ where: { lab_id: LAB, note: TAG } });
    await prisma.agentRun.deleteMany({ where: { id: run.id } }); // cascades observations
    await prisma.agentToken.deleteMany({ where: { id: token.id } });
    await prisma.document.deleteMany({ where: { id: { in: docIds } } });
    await prisma.pipelineTrigger.deleteMany({ where: { id: { in: triggerIds } } });
    await prisma.$disconnect();
  }
  console.log(failures ? `\n${failures} FAILED` : "\nall passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
