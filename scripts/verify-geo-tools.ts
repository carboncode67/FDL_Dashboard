/**
 * Checks lib/geo-tools.ts against published values and geometric invariants.
 * No test suite exists in this repo, so this is a script:
 *
 *   TS_NODE_BASEURL=. TS_NODE_TRANSPILE_ONLY=1 npx ts-node -r tsconfig-paths/register \
 *     -O '{"module":"commonjs","moduleResolution":"node"}' scripts/verify-geo-tools.ts
 *
 * Exits non-zero on any failure.
 */
import {
  area, destination, gridInPolygon, inside, measure, pointsAround, randomInPolygon, shapeAround,
  stratifiedRandom, transect, GeoToolError, type AreaGeometry,
} from "@/lib/geo-tools";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
const dms = (d: number, m: number, s: number) => Math.sign(d || 1) * (Math.abs(d) + m / 60 + s / 3600);

// 1. Vincenty (1975) / Geoscience Australia test: Flinders Peak → Buninyong.
const flinders = { lat: -dms(37, 57, 3.7203), lng: dms(144, 25, 29.5244) };
const buninyong = { lat: -dms(37, 39, 10.1561), lng: dms(143, 55, 35.3839) };
const inv = measure(flinders, buninyong);
check("inverse distance = 54972.271 m", near(inv.distanceM, 54972.271, 0.001), inv.distanceM.toFixed(4));
check("inverse azimuth = 306°52'05.37\"", near(inv.bearingDeg, dms(306, 52, 5.37), 0.5 / 3600), inv.bearingDeg.toFixed(7));
const fwd = destination(flinders, dms(306, 52, 5.37), 54972.271);
check("direct lands on Buninyong (< 1 mm)", measure(fwd, buninyong).distanceM < 0.001, `${(measure(fwd, buninyong).distanceM * 1000).toFixed(3)} mm`);

// 2. Round trips at field scale (Ithaca-ish).
const c = { lat: 42.4475, lng: -76.4806 };
for (const [b, d] of [[0, 10], [45, 7.0710678], [137.5, 333], [270, 1500]] as const) {
  const p = destination(c, b, d);
  const m = measure(c, p);
  check(`round trip ${b}° ${d} m`, near(m.distanceM, d, 1e-6) && near(((m.bearingDeg - b + 540) % 360) - 180, 0, 1e-6));
}

// 3. The worked example: 10 m square, corner points NE NW SW SE.
const corners = pointsAround(c, "square_corners", 10, { labelPrefix: "881" });
check("square: 4 labelled corners", corners.map((p) => p.label).join() === "881-NE,881-SE,881-SW,881-NW", corners.map((p) => p.label).join());
const side = [0, 1, 2, 3].map((i) => measure(corners[i], corners[(i + 1) % 4]).distanceM);
check("square: sides 10 m (± 1 mm)", side.every((s) => near(s, 10, 0.001)), side.map((s) => s.toFixed(4)).join(", "));
const diag = measure(corners[0], corners[2]).distanceM;
check("square: diagonal 14.142 m", near(diag, 10 * Math.SQRT2, 0.001), diag.toFixed(4));
const ne = measure(c, corners[0]);
check("square: NE corner at 45°, 7.071 m", near(ne.bearingDeg, 45, 1e-6) && near(ne.distanceM, 7.0710678, 1e-6));
const cross = pointsAround(c, "cross", 5, { rotationDeg: 30, includeCenter: true });
check("cross rotated 30°: C + 4 arms at 5 m", cross.length === 5 && cross.slice(1).every((p) => near(measure(c, p).distanceM, 5, 1e-4)), cross.map((p) => p.label).join());
const ring = pointsAround(c, "ring", 20, { count: 6 });
check("ring: 6 points, 60° apart", ring.length === 6 && near(measure(ring[0], ring[1]).distanceM, 20, 0.01));

// 4. Shapes.
const sq = shapeAround(c, "square", 10);
const sqArea = area(sq);
check("square polygon area 100 m²", near(sqArea, 100, 0.05), sqArea.toFixed(3));
const rect = shapeAround(c, "rectangle", 30, { heightM: 10, rotationDeg: 15 });
check("rotated 30×10 rectangle area 300 m²", near(area(rect), 300, 0.2), area(rect).toFixed(3));
const circ = shapeAround(c, "circle", 50, { segments: 256 });
check("circle r=50 area ≈ π·50² (256-gon)", near(area(circ), Math.PI * 2500, 2), area(circ).toFixed(1));

// 5. Area filling in a 200 m × 100 m field with a 40 m × 40 m hole.
const field = shapeAround(c, "rectangle", 200, { heightM: 100 });
const hole = shapeAround(c, "square", 40);
const withHole: AreaGeometry = { type: "Polygon", coordinates: [field.coordinates[0], hole.coordinates[0].slice().reverse()] };
check("inside respects holes", inside(destination(c, 90, 60), withHole) && !inside(c, withHole));
const grid = gridInPolygon(withHole, 20);
check("grid 20 m: no point in the hole", grid.every((p) => inside(p, withHole)), `${grid.length} points`);
const nn = Math.min(...grid.slice(1).map((p) => measure(grid[0], p).distanceM));
check("grid 20 m: nearest neighbour 20 m", near(nn, 20, 0.01), nn.toFixed(4));
const gridBuf = gridInPolygon(field, 20, { edgeBufferM: 15 });
check("grid with 15 m edge buffer stays ≥ ~15 m from edge", gridBuf.every((p) => inside(p, shapeAround(c, "rectangle", 170, { heightM: 70 }))), `${gridBuf.length} points`);
const gridRot = gridInPolygon(field, 20, { rotationDeg: 30 });
check("rotated grid keeps 20 m spacing", near(Math.min(...gridRot.slice(1).map((p) => measure(gridRot[0], p).distanceM)), 20, 0.01));

const r1 = randomInPolygon(withHole, 25, { minSpacingM: 10, seed: 42 });
const r2 = randomInPolygon(withHole, 25, { minSpacingM: 10, seed: 42 });
check("random: same seed → same points", JSON.stringify(r1.points) === JSON.stringify(r2.points));
check("random: 25 placed, none in hole", r1.points.length === 25 && r1.shortfall === 0 && r1.points.every((p) => inside(p, withHole)));
const minD = Math.min(...r1.points.flatMap((p, i) => r1.points.slice(i + 1).map((q) => measure(p, q).distanceM)));
check("random: min spacing ≥ 10 m", minD >= 10 - 1e-6, minD.toFixed(2));
const r3 = randomInPolygon(withHole, 25, { minSpacingM: 10, seed: 43 });
check("random: different seed → different points", JSON.stringify(r3.points) !== JSON.stringify(r1.points));

// 6. Stratified: two strata, 3:1 area, proportional total 8 → 6 + 2.
const west = shapeAround(destination(c, 270, 50), "rectangle", 150, { heightM: 100 });
const east = shapeAround(destination(c, 90, 75), "rectangle", 50, { heightM: 100 });
const strat = stratifiedRandom(
  [{ id: 1, label: "Z1", polygon: west }, { id: 2, label: "Z2", polygon: east }],
  { total: 8, mode: "proportional", minPerStratum: 1 },
  { minSpacingM: 8, seed: 7 },
);
check("stratified proportional 8 → 6/2 by area", strat.allocation.map((a) => a.requested).join("/") === "6/2", strat.allocation.map((a) => `${a.label}:${a.requested}`).join(" "));
check("stratified: each point in its stratum", strat.points.every((p) => inside(p, p.meta?.stratum === "1" ? west : east)));
const per = stratifiedRandom([{ id: "a", label: "A", polygon: west }, { id: "b", label: "B", polygon: east }], { perStratum: 3 }, { seed: 1 });
check("stratified per-stratum 3 → 6 points", per.points.length === 6, per.points.map((p) => p.label).join());

// 7. Transect and errors.
let threw = false;
const tr = transect(c, 90, 100, 25);
check("transect 100 m every 25 m → 5 points", tr.length === 5 && near(measure(tr[0], tr[4]).distanceM, 100, 1e-6));
// "3 points, 10 m apart, first point 10 m east of X" → 10/20/30 m, none on X.
const off = transect(c, 90, undefined, 10, { count: 3, startOffsetM: 10, labelPrefix: "E" });
check("transect count 3 + offset 10 → 10/20/30 m", off.length === 3 && off.every((p, i) => near(measure(c, p).distanceM, 10 * (i + 1), 1e-4)),
  off.map((p) => `${p.label}@${measure(c, p).distanceM.toFixed(3)}`).join(" "));
check("transect labels E-1..E-3", off.map((p) => p.label).join() === "E-1,E-2,E-3");
threw = false;
try { transect(c, 90, undefined, 10); } catch (e) { threw = e instanceof GeoToolError; }
check("transect with neither count nor length → GeoToolError", threw);
threw = false;
try { gridInPolygon(sq, 20, { edgeBufferM: 10 }); } catch (e) { threw = e instanceof GeoToolError; }
check("edge buffer wider than polygon → GeoToolError", threw);
threw = false;
try { gridInPolygon(field, 1); } catch (e) { threw = e instanceof GeoToolError; }
check("grid over the point cap → GeoToolError", threw);

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
