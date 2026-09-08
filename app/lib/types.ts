import type { FaceGestureState, HandGestureState, HandState, MouthState } from "./gestures";

export type { HandState, MouthShape, MouthState } from "./gestures";

export type Point3 = { x: number; y: number; z: number };

export type CigaretteState =
  | "IDLE"
  | "HAND_HELD"
  | "FINGER_HELD"
  | "MOUTH_LEFT"
  | "MOUTH_CENTER"
  | "MOUTH_RIGHT"
  | "FALLING";

export type SmokingState =
  | "IDLE"
  | "HOLDING_CIGARETTE"
  | "CIGARETTE_IN_MOUTH"
  | "INHALING"
  | "SMOKE_READY"
  | "MOUTH_BURST"
  | "NOSE_BURST"
  | "CIGARETTE_FALLING";

export interface FaceAnalysis extends FaceGestureState {
  visible: boolean;
  inGracePeriod: boolean;
  landmarks: Point3[];
  center: Point3;
  forehead: Point3;
  chin: Point3;
  mouthCenter: Point3;
  mouthLeft: Point3;
  mouthRight: Point3;
  noseLeft: Point3;
  noseRight: Point3;
  faceWidth: number;
  faceHeight: number;
  mouthWidth: number;
  mouthWidthRatio: number;
  mouthOpenRatio: number;
  mouthPursed: boolean;
  mouthState: MouthState;
  yaw: number;
  roll: number;
}

export interface HandAnalysis extends HandGestureState {
  id: string;
  visible: boolean;
  landmarks: Point3[];
  palmCenter: Point3;
  previousPalmCenter: Point3;
  velocity: Point3;
  speed: number;
  state: HandState;
  pinchDistance: number;
  palmSize: number;
  gripPoint: Point3;
  indexTip: Point3;
  middleTip: Point3;
}

export interface TrackingFrame {
  faceLandmarks: Point3[][];
  handLandmarks: Point3[][];
  handedness: string[];
  delegate: "GPU" | "CPU";
  sourceTimestamp: number;
  completedAt: number;
  handInferenceMs: number;
  faceInferenceMs: number;
  handRevision: number;
  faceRevision: number;
  updatedTask: "HAND" | "FACE";
}

export interface InteractionSnapshot {
  cigaretteState: CigaretteState;
  mouthState: MouthState;
  smokingState: SmokingState;
  handState: HandState;
  cigarettePosition: Point3;
  cigaretteRotation: number;
  cigaretteBaseLength: number;
  cigaretteLength: number;
  cigaretteBurn: number;
  cigaretteMouthSide: "LEFT" | "CENTER" | "RIGHT" | null;
  inhaleSeconds: number;
  smokeReady: boolean;
  pinchDistance: number;
  faceVisible: boolean;
  handVisible: boolean;
  delegate: "GPU" | "CPU";
}
