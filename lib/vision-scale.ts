// Object scale → ortho embedding (machine vision, issue #4). Pure, so the
// label checker in the browser shows exactly what a run will use.
//
// DINOv3 patches are 16 px. An object about OBJECT_PATCHES patches across is
// well described (smaller blurs into its surroundings, much larger wastes
// patches on its interior), so the ortho is embedded at size / (4 × 16) m/px.
// The processor never upsamples: on a coarse ortho a small object stays at
// native resolution. A point label covers the object's core, every patch
// within POINT_CORE × size of the point.
export const PATCH_PX = 16;
export const OBJECT_PATCHES = 4;
export const POINT_CORE = 0.3;

export function scaleParams(objectSizeM: number | null): { gsd_m: number | null; point_radius_m: number } {
  if (!objectSizeM) return { gsd_m: null, point_radius_m: 0 };
  return { gsd_m: objectSizeM / (OBJECT_PATCHES * PATCH_PX), point_radius_m: objectSizeM * POINT_CORE };
}
