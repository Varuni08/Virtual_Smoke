import { create } from "zustand";
import type { SmokeEmissionType } from "./effects";
import type { CigaretteState, HandState, MouthShape, MouthState, SmokingState } from "./types";

export interface RuntimeDebugState {
  debugMode: boolean;
  fps: number;
  faceVisible: boolean;
  handVisible: boolean;
  handState: HandState;
  handSpeed: number;
  handVelocityX: number;
  handVelocityY: number;
  handForceActive: boolean;
  pinchActive: boolean;
  pinchX: number;
  pinchY: number;
  grabStrength: number;
  grabRadius: number;
  mouthState: MouthState;
  mouthShape: MouthShape;
  oShapeScore: number;
  cigaretteState: CigaretteState;
  smokingState: SmokingState;
  mouthOpenRatio: number;
  mouthWidthRatio: number;
  mouthPursed: boolean;
  cigaretteBurn: number;
  inhaleSeconds: number;
  smokeReady: boolean;
  smokeReadySeconds: number;
  mouthBurstCount: number;
  noseBurstCount: number;
  smokeRingCount: number;
  lastEffect: SmokeEmissionType | "NONE";
  baseSmokeParticles: number;
  particleDrawCount: number;
  pinchDistance: number;
  worstFrameMs: number;
  p95FrameMs: number;
  inputLatencyMs: number;
  handInferenceMs: number;
  faceInferenceMs: number;
  delegate: "GPU" | "CPU";
  trackingStatus: "INITIALIZING" | "READY" | "ERROR";
  faceGpuContext: string;
  handGpuContext: string;
  webglVersion: "WEBGL2" | "WEBGL1" | "UNAVAILABLE";
  gpuRenderer: string;
  gpuVendor: string;
  gpuAccelerated: boolean;
  particleQuality: "HIGH" | "MEDIUM" | "LOW";
  toggleDebug: () => void;
  updateRuntime: (patch: Partial<Omit<RuntimeDebugState, "toggleDebug" | "updateRuntime">>) => void;
}

export const useInteractionStore = create<RuntimeDebugState>((set) => ({
  debugMode: false,
  fps: 0,
  faceVisible: false,
  handVisible: false,
  handState: "NONE",
  handSpeed: 0,
  handVelocityX: 0,
  handVelocityY: 0,
  handForceActive: false,
  pinchActive: false,
  pinchX: 0,
  pinchY: 0,
  grabStrength: 0,
  grabRadius: 0,
  mouthState: "CLOSED",
  mouthShape: "NEUTRAL",
  oShapeScore: 0,
  cigaretteState: "IDLE",
  smokingState: "IDLE",
  mouthOpenRatio: 0,
  mouthWidthRatio: 0,
  mouthPursed: false,
  cigaretteBurn: 0,
  inhaleSeconds: 0,
  smokeReady: false,
  smokeReadySeconds: 0,
  mouthBurstCount: 0,
  noseBurstCount: 0,
  smokeRingCount: 0,
  lastEffect: "NONE",
  baseSmokeParticles: 0,
  particleDrawCount: 0,
  pinchDistance: 0,
  worstFrameMs: 0,
  p95FrameMs: 0,
  inputLatencyMs: 0,
  handInferenceMs: 0,
  faceInferenceMs: 0,
  delegate: "GPU",
  trackingStatus: "INITIALIZING",
  faceGpuContext: "PENDING",
  handGpuContext: "PENDING",
  webglVersion: "UNAVAILABLE",
  gpuRenderer: "INITIALIZING",
  gpuVendor: "UNKNOWN",
  gpuAccelerated: false,
  particleQuality: "HIGH",
  toggleDebug: () => set((state) => ({ debugMode: !state.debugMode })),
  updateRuntime: (patch) => set(patch),
}));
