// Red → yellow → green NDVI ramp for the farm map's Sentinel-2 imagery layer.
// Shared by the server-side renderer (lib/imagery-render.ts) and the map
// legend (components/farm-map.tsx) so the legend gradient always matches the
// image. Fixed scale (not per-frame), so colours mean the same thing on every
// date while scrubbing the timeline.
export const NDVI_MIN = 0;
export const NDVI_MAX = 1;

// Positions are 0..1 across [NDVI_MIN, NDVI_MAX]; yellow sits at NDVI 0.5.
// Anything below NDVI_MIN (water, wet bare soil) clamps to red.
export const NDVI_RAMP: { at: number; rgb: [number, number, number] }[] = [
  { at: 0.0, rgb: [165, 0, 38] },
  { at: 0.25, rgb: [244, 109, 67] },
  { at: 0.5, rgb: [255, 230, 120] },
  { at: 0.75, rgb: [120, 198, 99] },
  { at: 1.0, rgb: [0, 104, 55] },
];

export function ndviRampColor(ndvi: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, (ndvi - NDVI_MIN) / (NDVI_MAX - NDVI_MIN)));
  for (let i = 1; i < NDVI_RAMP.length; i++) {
    const hi = NDVI_RAMP[i];
    if (x <= hi.at) {
      const lo = NDVI_RAMP[i - 1];
      const f = (x - lo.at) / (hi.at - lo.at);
      return [
        lo.rgb[0] + (hi.rgb[0] - lo.rgb[0]) * f,
        lo.rgb[1] + (hi.rgb[1] - lo.rgb[1]) * f,
        lo.rgb[2] + (hi.rgb[2] - lo.rgb[2]) * f,
      ];
    }
  }
  return NDVI_RAMP[NDVI_RAMP.length - 1].rgb;
}

export const NDVI_RAMP_CSS = `linear-gradient(to right, ${NDVI_RAMP.map(
  (s) => `rgb(${s.rgb.join(",")}) ${s.at * 100}%`
).join(", ")})`;
