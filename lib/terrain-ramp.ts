// Hypsometric elevation ramp for the farm map's Terrain layer. Shared by the
// server-side renderer (lib/terrain-render.ts) and the map legend
// (components/farm-map.tsx) so the legend gradient always matches the image.
// Positions are 0..1 across the render's [low, high] elevation range.
export const TERRAIN_RAMP: { at: number; rgb: [number, number, number] }[] = [
  { at: 0.0, rgb: [38, 115, 77] },
  { at: 0.25, rgb: [125, 176, 92] },
  { at: 0.5, rgb: [232, 214, 140] },
  { at: 0.75, rgb: [186, 133, 84] },
  { at: 1.0, rgb: [240, 232, 222] },
];

export function terrainRampColor(t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t));
  for (let i = 1; i < TERRAIN_RAMP.length; i++) {
    const hi = TERRAIN_RAMP[i];
    if (x <= hi.at) {
      const lo = TERRAIN_RAMP[i - 1];
      const f = (x - lo.at) / (hi.at - lo.at);
      return [
        lo.rgb[0] + (hi.rgb[0] - lo.rgb[0]) * f,
        lo.rgb[1] + (hi.rgb[1] - lo.rgb[1]) * f,
        lo.rgb[2] + (hi.rgb[2] - lo.rgb[2]) * f,
      ];
    }
  }
  return TERRAIN_RAMP[TERRAIN_RAMP.length - 1].rgb;
}

export const TERRAIN_RAMP_CSS = `linear-gradient(to right, ${TERRAIN_RAMP.map(
  (s) => `rgb(${s.rgb.join(",")}) ${s.at * 100}%`
).join(", ")})`;
