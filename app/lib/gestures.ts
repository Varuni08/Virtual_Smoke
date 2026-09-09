export type MouthState = "CLOSED" | "OPEN";

export type MouthShape = "NEUTRAL" | "PURSED" | "O_SHAPE";

export type HandState = "NONE" | "PINCH" | "INDEX_MIDDLE_HOLD";

export type LighterState = "INACTIVE" | "ACTIVE";

export interface FaceGestureState {
  mouthState: MouthState;
  mouthPursed: boolean;
  mouthShape: MouthShape;
  oShapeScore: number;
}

export interface HandGestureState {
  state: HandState;
}

export interface PeaceGestureState {
  peaceSign: boolean;
  indexExtended: boolean;
  middleExtended: boolean;
  ringFolded: boolean;
  pinkyFolded: boolean;
  indexMiddleSeparation: number;
}

export interface GestureSnapshot {
  face: FaceGestureState;
  hand: HandGestureState;
}
