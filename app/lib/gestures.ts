export type MouthState = "CLOSED" | "OPEN";

export type MouthShape = "NEUTRAL" | "PURSED" | "O_SHAPE";

export type HandState = "NONE" | "PINCH" | "INDEX_MIDDLE_HOLD";

export interface FaceGestureState {
  mouthState: MouthState;
  mouthPursed: boolean;
  mouthShape: MouthShape;
  oShapeScore: number;
}

export interface HandGestureState {
  state: HandState;
}

export interface GestureSnapshot {
  face: FaceGestureState;
  hand: HandGestureState;
}
