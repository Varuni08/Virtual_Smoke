import type { Point3 } from "./types";

export type EffectCategory = "SMOKE";

export type SmokeEmissionType = "MOUTH_BURST" | "NOSE_BURST" | "SMOKE_RING";

interface SmokeEmissionBase {
  category: "SMOKE";
  origin: Point3;
  direction: Point3;
  strength: number;
}

export type SmokeEmission =
  | SmokeEmissionBase & {
      type: "MOUTH_BURST";
    }
  | SmokeEmissionBase & {
      type: "NOSE_BURST";
      secondaryOrigin: Point3;
    }
  | SmokeEmissionBase & {
      type: "SMOKE_RING";
    };
