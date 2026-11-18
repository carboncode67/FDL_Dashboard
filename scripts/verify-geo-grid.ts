/**
 * Checks lib/geo-grid.ts (random grid sampling). Run like verify-geo-tools.ts:
 *
 *   TS_NODE_BASEURL=. TS_NODE_TRANSPILE_ONLY=1 npx ts-node -r tsconfig-paths/register \
 *     -O '{"module":"commonjs","moduleResolution":"node"}' scripts/verify-geo-grid.ts
 */
import {
  cellOf, cellRing, cellSeed, convergence, fromCrs, pointInCell, randomGridSample, toCrs, utmEpsg, validateGridDef,
  SQ_M_PER_ACRE, type GridDef,
} from "@/lib/geo-grid";
import { area, inside, shapeAround, GeoToolError, type AreaGeometry } from "@/lib/geo-tools";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

// 1. CRS basics: Ithaca is UTM 18N; round trip is sub-mm; convergence is small and negative west of the CM (75°W).
const c = { lat: 42.4475, lng: -76.4806 };
check("utm zone for Ithaca = EPSG:32618", utmEpsg(c) === "EPSG:32618", utmEpsg(c));
check("southern hemisphere → 327xx", utmEpsg({ lat: -33.9, lng: 18.4 }) === "EPSG:32734");
const [e, n] = toCrs("EPSG:32618", c);
const back = fromCrs("EPSG:32618", e, n);
check("UTM round trip < 1e-9°", near(back.lat, c.lat, 1e-9) && near(back.lng, c.lng, 1e-9));
// Known: EPSG:32618 of (42.4475, -76.4806) ≈ E 378 300, N 4 700 300 (sanity, not exact)
check("UTM easting/northing plausible", e > 370_000 && e < 390_000 && n > 4_690_000 && n < 4_710_000, `${e.toFixed(1)}, ${n.toFixed(1)}`);
const conv = convergence("EPSG:32618", c);
// γ = (λ−λ0)·sinφ = −1.4806°·0.6749 ≈ −0.999° (true → grid north); west of the central
// meridian true north therefore lies at grid bearing +0.999°, which is what convergence() returns.
check("grid bearing of true north ≈ +1.0°", near(conv, 0.9993, 0.01), conv.toFixed(4));

// 2. A 400 m × 400 m square field (16 ha ≈ 39.5 ac), axis-aligned to true north.
const field = shapeAround(c, "square", 400) as AreaGeometry;
const A = area(field);
check("field area ≈ 160000 m²", near(A, 160000, 50), A.toFixed(1));

// cell size given: 50 m cells over a 400 m square ⇒ ~64 cells (lattice not aligned, rotation 0 in UTM vs field in true north)
const r1 = randomGridSample([{ label: "F1", ref: { field_id: 1 }, polygon: field }], { cellSizeM: 50 }, { seed: 42 });
check("one grid for one field", r1.grids.length === 1);
check("cell size 50 m", r1.cell_size_m === 50);
check("~64 points (60–72)", r1.points.length >= 60 && r1.points.length <= 72, String(r1.points.length));
check("all points inside the field", r1.points.every((p) => inside(p, field)));
const g1 = r1.grids[0];
check("grid record: integer origin for rotation 0", Number.isInteger(g1.origin_x) && Number.isInteger(g1.origin_y), `${g1.origin_x}, ${g1.origin_y}`);
check("grid record valid", validateGridDef(g1 as unknown as Record<string, unknown>) === null);
check("every point in its declared cell", r1.points.every((p) => pointInCell(g1, p, p.meta!.col as number, p.meta!.row as number)));
const cellsSeen = new Set(r1.points.map((p) => `${p.meta!.col},${p.meta!.row}`));
check("one point per cell", cellsSeen.size === r1.points.length);

// determinism + per-cell independence
const r1b = randomGridSample([{ label: "F1", ref: { field_id: 1 }, polygon: field }], { cellSizeM: 50 }, { seed: 42 });
check("same seed → identical points", JSON.stringify(r1.points) === JSON.stringify(r1b.points));
const r1c = randomGridSample([{ label: "F1", ref: { field_id: 1 }, polygon: field }], { cellSizeM: 50 }, { seed: 43 });
check("different seed → different points", JSON.stringify(r1.points) !== JSON.stringify(r1c.points));
check("cellSeed is stable + varies", cellSeed(1, 2, 3) === cellSeed(1, 2, 3) && cellSeed(1, 2, 3) !== cellSeed(1, 3, 2));

// Recreate the grid from the record alone (what an analyst would do): cell ring corners land on the lattice.
const ring = cellRing(g1, 3, 4);
const sw = cellOf(g1, { lng: ring[0][0], lat: ring[0][1] });
check("cell ring SW corner at (3·s, 4·s)", near(sw.u, 150, 1e-4) && near(sw.v, 200, 1e-4), `${sw.u.toFixed(5)}, ${sw.v.toFixed(5)}`);

// 3. Per-acre sizing: 1 point per acre ⇒ cell = √4046.86 = 63.61 m
const r2 = randomGridSample([{ label: "F1", ref: {}, polygon: field }], { perAcre: 1 }, { seed: 7 });
check("1/ac → 63.61 m cells", r2.cell_size_m === 63.61, String(r2.cell_size_m));
check("1/ac → ~40 points (34–46)", r2.points.length >= 34 && r2.points.length <= 46, `${r2.points.length} on ${(A / SQ_M_PER_ACRE).toFixed(1)} ac`);

// 4. Total: exactly 25 points
const r3 = randomGridSample([{ label: "F1", ref: {}, polygon: field }], { total: 25 }, { seed: 9 });
check("total 25 → 25 points", r3.points.length === 25, `${r3.points.length} @ ${r3.cell_size_m} m, dropped ${r3.summary.dropped_cells ?? 0}`);
check("total: cell size ≈ √(A/25) = 80 m (±20%)", r3.cell_size_m > 64 && r3.cell_size_m < 96, String(r3.cell_size_m));
const d3 = (r3.grids[0].params.dropped_cells as [number, number][] | undefined) ?? [];
check("dropped cells recorded and not sampled", d3.every(([cc, rr]) => !r3.points.some((p) => p.meta!.col === cc && p.meta!.row === rr)));

// 5. Two adjacent fields share one grid (auto); a rotated one gets its own.
const east = shapeAround({ lat: c.lat, lng: c.lng + 0.0060 }, "square", 300) as AreaGeometry;
const far = shapeAround({ lat: c.lat + 0.02, lng: c.lng }, "square", 300) as AreaGeometry;
const r4 = randomGridSample(
  [{ label: "A", ref: {}, polygon: field }, { label: "B", ref: {}, polygon: east }, { label: "C", ref: {}, polygon: far }],
  { total: 60 },
  { seed: 1 },
);
check("auto: three same-zone, same-rotation fields → 1 grid", r4.grids.length === 1);
check("auto: 60 points across 3 fields", r4.points.length === 60, String(r4.points.length));
check("points labelled with their field", new Set(r4.points.map((p) => p.meta!.polygon)).size === 3);
const r5 = randomGridSample(
  [{ label: "A", ref: {}, polygon: field }, { label: "B", ref: {}, polygon: east, rotationDeg: 30 }],
  { cellSizeM: 60 },
  { seed: 1 },
);
check("auto: different row direction → 2 grids", r5.grids.length === 2);
const gB = r5.grids[1];
check("rotated grid stores CRS rotation = 30 + convergence", near(gB.rotation_deg, 30 + conv, 0.01), String(gB.rotation_deg));
check("rotated grid: points in their cells", r5.points.filter((p) => p.meta!.grid === "G2").every((p) => pointInCell(gB, p, p.meta!.col as number, p.meta!.row as number)));
const r6 = randomGridSample(
  [{ label: "A", ref: {}, polygon: field }, { label: "B", ref: {}, polygon: east }],
  { cellSizeM: 60 },
  { seed: 1, grouping: "per_polygon" },
);
check("per_polygon → 2 grids", r6.grids.length === 2);

// 6. Edge buffer + min fraction
const r7 = randomGridSample([{ label: "F1", ref: {}, polygon: field }], { cellSizeM: 50 }, { seed: 3, edgeBufferM: 20 });
const inner = shapeAround(c, "square", 360) as AreaGeometry;
check("edge buffer: all points ≥ 20 m in", r7.points.every((p) => inside(p, inner)));
const rAll = randomGridSample([{ label: "F1", ref: {}, polygon: field }], { cellSizeM: 50 }, { seed: 3, minCellFraction: 0.01 });
check("min_cell_fraction 0.01 samples more edge cells", rAll.points.length > r1.points.length, `${rAll.points.length} > ${r1.points.length}`);

// 7. Errors
let threw = false;
try { randomGridSample([{ label: "F", ref: {}, polygon: field }], { cellSizeM: 1 }, {}); } catch (err) { threw = err instanceof GeoToolError; }
check("too many cells → GeoToolError", threw);
threw = false;
try { randomGridSample([{ label: "F", ref: {}, polygon: field }], { cellSizeM: 50 }, { edgeBufferM: 500 }); } catch (err) { threw = err instanceof GeoToolError; }
check("buffer erases everything → GeoToolError", threw);
check("validateGridDef rejects non-UTM", validateGridDef({ ...(g1 as GridDef), crs: "EPSG:4326" } as unknown as Record<string, unknown>) !== null);

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
