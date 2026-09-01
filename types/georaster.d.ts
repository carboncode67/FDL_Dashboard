// Neither package ships TypeScript types (or a usable @types/ package) — used only
// dynamically imported client-side in components/farm-map.tsx, so `any` is fine here.
declare module "georaster" {
  const parseGeoraster: (input: ArrayBuffer | string) => Promise<unknown>;
  export default parseGeoraster;
}

declare module "georaster-layer-for-leaflet" {
  import type { Layer, LayerOptions } from "leaflet";
  export default class GeoRasterLayer extends Layer {
    constructor(options: LayerOptions & { georaster: unknown; opacity?: number; resolution?: number });
  }
}
