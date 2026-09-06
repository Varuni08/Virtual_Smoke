export type MouthState = "CLOSED" | "OPEN";

export type HandState = "NONE" | "PINCH" | "INDEX_MIDDLE_HOLD";

export interface FaceGestureState {
  mouthState: MouthState;
  mouthPursed: boolean;
}

export interface HandGestureState {
  state: HandState;
}

export interface GestureSnapshot {
  face: FaceGestureState;
  hand: HandGestureState;
}
