import * as THREE from "three";
import type { SmokeEmission } from "./effects";
import { clamp, expSmoothing, lerp } from "./math";
import { useInteractionStore } from "./store";
import type { FaceAnalysis, HandAnalysis, InteractionSnapshot, Point3 } from "./types";

const MAX_PARTICLES = 8000;
const SMOKE_VOLUME_MULTIPLIER = 5;

const vertexShader = `
  uniform float uTime;
  uniform float uPixelRatio;
  uniform vec2 uHandPosition;
  uniform vec2 uHandVelocity;
  uniform float uHandSpeed;
  uniform float uHandInfluenceRadius;
  uniform float uHandActive;
  uniform vec2 uPinchPosition;
  uniform float uPinchActive;
  uniform float uPinchStrength;
  uniform float uPinchRadius;
  attribute vec3 aStart;
  attribute vec3 aVelocity;
  attribute float aSpawnTime;
  attribute float aLifetime;
  attribute float aSize;
  attribute float aSeed;
  attribute float aKind;
  varying float vAlpha;
  varying float vKind;
  varying float vSeed;
  varying float vLifeT;

  void main() {
    float age = uTime - aSpawnTime;
    float lifeT = clamp(age / max(aLifetime, 0.01), 0.0, 1.0);
    float alive = step(0.0, age) * (1.0 - step(aLifetime, age));
    float curl = sin(age * (1.5 + aSeed * 1.8) + aSeed * 12.0);
    float crossCurl = cos(age * (1.1 + aSeed) + aSeed * 7.0);
    float ringSmoke = step(2.5, aKind);
    float ringCore = ringSmoke * (1.0 - step(3.5, aKind));
    float ringHaze = step(3.5, aKind) * (1.0 - step(4.5, aKind));
    float ringWake = step(4.5, aKind);
    float mouthSmoke = step(0.5, aKind) * (1.0 - ringSmoke);
    float exhaleSmoke = step(1.5, aKind) * (1.0 - ringSmoke);
    vec3 position = aStart + aVelocity * age;
    position.x += curl * age * age * (mix(0.004, 0.011, mouthSmoke) + exhaleSmoke * 0.004) * (1.0 - ringSmoke);
    position.y += crossCurl * age * mix(0.003, 0.007, mouthSmoke) * (1.0 - ringSmoke);
    position.y -= age * age * (mix(0.005, 0.011, mouthSmoke) + exhaleSmoke * 0.003) * (1.0 - ringSmoke);
    float ringTurbulence = smoothstep(0.46, 0.94, lifeT);
    float ringPeel = smoothstep(0.56, 1.0, lifeT);
    position.x += ringSmoke * sin(age * (2.1 + aSeed * 2.4) + aSeed * 9.0) * age * age
      * (0.0002 + ringTurbulence * (0.0055 + ringWake * ringPeel * 0.002));
    position.y += ringSmoke * cos(age * (1.7 + aSeed * 1.6) + aSeed * 5.0) * age * age
      * (0.00015 + ringTurbulence * (0.0035 + ringWake * ringPeel * 0.0015));
    position.y -= ringSmoke * age * age * (0.0012 + ringWake * ringPeel * 0.0008);

    vec2 handOffset = position.xy - uHandPosition;
    float handDistance = length(handOffset);
    float handFalloff = 1.0 - smoothstep(uHandInfluenceRadius * 0.16, uHandInfluenceRadius, handDistance);
    float handAge = min(max(age, 0.0), 0.32);
    float handSpeed = clamp(uHandSpeed, 0.0, 1.2);
    float normalizedSpeed = clamp(handSpeed / 1.2, 0.0, 1.0);
    float fastSwipe = smoothstep(0.55, 1.0, normalizedSpeed);
    float fastBoost = 1.0 + fastSwipe * 0.8;
    vec2 handDirection = normalize(uHandVelocity + vec2(0.00001));
    vec2 handTangent = vec2(-handOffset.y, handOffset.x) / max(handDistance, 0.001);
    vec2 handDisplacement = (handDirection * handSpeed * handAge * 0.22
      + handTangent * handSpeed * handAge * 0.045) * fastBoost;
    vec2 pinchOffset = position.xy - uPinchPosition;
    float pinchDistance = length(pinchOffset);
    float pinchFalloff = 1.0 - smoothstep(uPinchRadius * 0.16, uPinchRadius, pinchDistance);
    float pinchGather = uPinchActive * uPinchStrength * pinchFalloff;
    position.xy += uHandActive * handFalloff * mix(1.0, 0.72, ringSmoke)
      * mix(1.0, 0.32, pinchGather) * handDisplacement;

    vec2 attractionOffset = position.xy - uPinchPosition;
    float attractionDistance = length(attractionOffset);
    float attractionFalloff = 1.0 - smoothstep(uPinchRadius * 0.16, uPinchRadius, attractionDistance);
    float pinchAge = min(max(age, 0.0), 0.34);
    float attraction = uPinchActive * uPinchStrength * attractionFalloff * pinchAge * 0.9;
    vec2 attractionDirection = attractionOffset / max(attractionDistance, 0.001);
    vec2 attractionTangent = vec2(-attractionDirection.y, attractionDirection.x);
    float ringProtection = mix(1.0, 0.76, ringSmoke);
    position.xy -= attractionDirection * attractionDistance * attraction * ringProtection;
    position.xy += attractionTangent * attraction * 0.018 * ringProtection;

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = aSize * uPixelRatio * mix(0.72, 3.45, smoothstep(0.0, 0.78, lifeT));
    gl_PointSize *= alive;
    gl_PointSize *= mix(1.0, 1.16, ringSmoke * smoothstep(0.18, 0.82, lifeT));
    gl_PointSize *= mix(1.0, 0.84, ringCore);
    gl_PointSize *= mix(1.0, 1.08, ringHaze);
    gl_PointSize *= mix(1.0, 0.92, ringWake);
    vAlpha = alive * smoothstep(0.0, 0.05, lifeT) * (1.0 - smoothstep(0.48, 1.0, lifeT));
    vKind = aKind;
    vSeed = aSeed;
    vLifeT = lifeT;
  }
`;

const fragmentShader = `
  precision highp float;
  varying float vAlpha;
  varying float vKind;
  varying float vSeed;
  varying float vLifeT;

  float hash(vec2 point) {
    return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 point) {
    vec2 cell = floor(point);
    vec2 local = fract(point);
    local = local * local * (3.0 - 2.0 * local);
    return mix(
      mix(hash(cell), hash(cell + vec2(1.0, 0.0)), local.x),
      mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0, 1.0)), local.x),
      local.y
    );
  }

  float fbm(vec2 point) {
    float value = 0.0;
    float amplitude = 0.5;
    mat2 rotation = mat2(0.82, 0.57, -0.57, 0.82);
    for (int octave = 0; octave < 3; octave++) {
      value += amplitude * noise(point);
      point = rotation * point * 2.03 + 7.17;
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    vec2 point = gl_PointCoord * 2.0 - 1.0;
    float angle = vSeed * 6.2831853;
    mat2 rotation = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
    point = rotation * point;
    point.x *= mix(0.72, 1.34, hash(vec2(vSeed, 3.7)));
    float radius = length(point);
    float broadNoise = fbm(point * 2.4 + vec2(vSeed * 13.7, vSeed * -9.3));
    float fineNoise = fbm(point * 5.8 + vec2(vSeed * -17.1, vSeed * 8.9));
    float brokenEdge = radius + (broadNoise - 0.5) * 0.48 + (fineNoise - 0.5) * 0.14;
    float envelope = 1.0 - smoothstep(0.32, 1.03, brokenEdge);
    float wisps = mix(0.48, 1.0, smoothstep(0.25, 0.88, broadNoise * 0.72 + fineNoise * 0.28));
    float ringSmoke = step(2.5, vKind);
    float ringHaze = step(3.5, vKind) * (1.0 - step(4.5, vKind));
    float ringWake = step(4.5, vKind);
    float mouthSmoke = step(0.5, vKind) * (1.0 - ringSmoke);
    float exhaleSmoke = step(1.5, vKind) * (1.0 - ringSmoke);
    float opacity = mix(0.068, 0.055, mouthSmoke) + exhaleSmoke * 0.007;
    float ringEarly = 1.0 - smoothstep(0.0, 0.5, vLifeT);
    float ringOpacity = mix(0.052, 0.074, ringEarly);
    ringOpacity *= mix(1.0, 0.62, ringHaze);
    ringOpacity *= mix(1.0, 0.46, ringWake);
    float ringSpawnBoost = 1.0 + 0.1 * (1.0 - smoothstep(0.0, 0.045, vLifeT));
    opacity = mix(opacity, ringOpacity * ringSpawnBoost, ringSmoke);
    float ringGaps = smoothstep(0.26, 0.74, broadNoise * 0.7 + fineNoise * 0.3);
    float ringBreakup = mix(1.0, ringGaps, ringSmoke * smoothstep(0.5, 0.96, vLifeT));
    float ringFade = 1.0 - ringSmoke * smoothstep(0.72, 1.0, vLifeT);
    float alpha = vAlpha * envelope * wisps * opacity * ringBreakup * ringFade;
    vec3 color = vec3(0.4117647);
    if (alpha < 0.0015) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

type Quality = "HIGH" | "MEDIUM" | "LOW";

export interface RendererDiagnostics {
  webglVersion: "WEBGL2" | "WEBGL1";
  renderer: string;
  vendor: string;
  hardwareAccelerated: boolean;
  maxTextureSize: number;
}

export class SmokeRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(0, 1, 0, 1, 0.1, 10);
  private cigarette = new THREE.Group();
  private ember = new THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>();
  private glow = new THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>();
  private lipMask: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  private particleGeometry = new THREE.BufferGeometry();
  private particleMaterial: THREE.ShaderMaterial;
  private points: THREE.Points;
  private starts = new Float32Array(MAX_PARTICLES * 3);
  private velocities = new Float32Array(MAX_PARTICLES * 3);
  private spawnTimes = new Float32Array(MAX_PARTICLES);
  private lifetimes = new Float32Array(MAX_PARTICLES);
  private sizes = new Float32Array(MAX_PARTICLES);
  private seeds = new Float32Array(MAX_PARTICLES);
  private kinds = new Float32Array(MAX_PARTICLES);
  private cursor = 0;
  private width = 1;
  private height = 1;
  private videoWidth = 1920;
  private videoHeight = 1080;
  private displayedWidth = 1;
  private displayedHeight = 1;
  private cropX = 0;
  private cropY = 0;
  private baseSmokeAccumulator = 0;
  private quality: Quality = "HIGH";
  private lowFpsDuration = 0;
  private recoveryDuration = 0;
  private mouthParticleCount = 0;
  private baseSmokeParticleCount = 0;
  private lastParticleDebugUpdate = 0;
  private handPosition = new THREE.Vector2();
  private handVelocity = new THREE.Vector2();
  private handTargetPosition = new THREE.Vector2();
  private handTargetVelocity = new THREE.Vector2();
  private handSpeed = 0;
  private handInfluenceRadius = 0.18;
  private handActive = 0;
  private handMissingSeconds = 0;
  private pinchPosition = new THREE.Vector2();
  private pinchTargetPosition = new THREE.Vector2();
  private pinchStrength = 0;
  private pinchRadius = 0.13;
  private pinchActive = 0;
  private pinchMissingSeconds = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: false,
      powerPreference: "high-performance",
      precision: "highp",
      premultipliedAlpha: false,
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.camera.position.set(0, 0, 2);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();

    this.createCigarette();
    // The screen-space camera intentionally uses Y-down coordinates to match
    // MediaPipe and the mirrored video. That flips triangle winding, so these
    // thin 2.5D planes must render from both sides.
    this.cigarette.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        material.side = THREE.DoubleSide;
        material.needsUpdate = true;
      }
    });
    this.cigarette.frustumCulled = false;
    this.scene.add(this.cigarette);

    this.lipMask = new THREE.Mesh(
      new THREE.CircleGeometry(0.5, 28),
      new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true, depthTest: true, side: THREE.DoubleSide }),
    );
    this.lipMask.position.z = 0.22;
    this.lipMask.renderOrder = 1;
    this.lipMask.visible = false;
    this.scene.add(this.lipMask);

    // Three.js uses the conventional position attribute to determine how many
    // points to draw, even when a custom shader reads positions from aStart.
    // Without it, drawCount stays Infinity and WebGLRenderer skips the draw.
    this.particleGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3));
    this.particleGeometry.setDrawRange(0, MAX_PARTICLES);
    this.particleGeometry.setAttribute("aStart", new THREE.BufferAttribute(this.starts, 3));
    this.particleGeometry.setAttribute("aVelocity", new THREE.BufferAttribute(this.velocities, 3));
    this.particleGeometry.setAttribute("aSpawnTime", new THREE.BufferAttribute(this.spawnTimes, 1));
    this.particleGeometry.setAttribute("aLifetime", new THREE.BufferAttribute(this.lifetimes, 1));
    this.particleGeometry.setAttribute("aSize", new THREE.BufferAttribute(this.sizes, 1));
    this.particleGeometry.setAttribute("aSeed", new THREE.BufferAttribute(this.seeds, 1));
    this.particleGeometry.setAttribute("aKind", new THREE.BufferAttribute(this.kinds, 1));

    this.particleMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: this.renderer.getPixelRatio() },
        uHandPosition: { value: this.handPosition },
        uHandVelocity: { value: this.handVelocity },
        uHandSpeed: { value: this.handSpeed },
        uHandInfluenceRadius: { value: this.handInfluenceRadius },
        uHandActive: { value: this.handActive },
        uPinchPosition: { value: this.pinchPosition },
        uPinchActive: { value: this.pinchActive },
        uPinchStrength: { value: this.pinchStrength },
        uPinchRadius: { value: this.pinchRadius },
      },
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.particleGeometry, this.particleMaterial);
    this.points.position.z = 0.32;
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
    this.scene.add(this.points);
    this.resize(window.innerWidth, window.innerHeight, this.videoWidth, this.videoHeight);
  }

  private createCigarette() {
    const outline = new THREE.Mesh(
      new THREE.PlaneGeometry(1.055, 0.135),
      new THREE.MeshBasicMaterial({ color: 0x151515, transparent: true, opacity: 0.68 }),
    );
    outline.position.z = -0.02;
    this.cigarette.add(outline);

    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.02, 0.11),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.38 }),
    );
    shadow.position.set(0.012, 0.028, -0.03);
    this.cigarette.add(shadow);

    const ash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.075, 0.095),
      new THREE.MeshBasicMaterial({ color: 0x77736b }),
    );
    ash.position.x = -0.4625;
    this.cigarette.add(ash);

    const paper = new THREE.Mesh(
      new THREE.PlaneGeometry(0.67, 0.095),
      new THREE.MeshBasicMaterial({ color: 0xfffcf2 }),
    );
    paper.position.x = -0.09;
    this.cigarette.add(paper);

    const paperShade = new THREE.Mesh(
      new THREE.PlaneGeometry(0.67, 0.025),
      new THREE.MeshBasicMaterial({ color: 0xb9b5ad, transparent: true, opacity: 0.55 }),
    );
    paperShade.position.set(-0.09, 0.035, 0.006);
    this.cigarette.add(paperShade);

    const filter = new THREE.Mesh(
      new THREE.PlaneGeometry(0.255, 0.1),
      new THREE.MeshBasicMaterial({ color: 0xb9783d }),
    );
    filter.position.x = 0.3725;
    this.cigarette.add(filter);

    const filterBand = new THREE.Mesh(
      new THREE.PlaneGeometry(0.018, 0.102),
      new THREE.MeshBasicMaterial({ color: 0xc59a64 }),
    );
    filterBand.position.set(0.252, 0, 0.008);
    this.cigarette.add(filterBand);

    this.ember = new THREE.Mesh(
      new THREE.CircleGeometry(0.057, 18),
      new THREE.MeshBasicMaterial({ color: 0xf24a1d }),
    );
    this.ember.position.set(-0.502, 0, 0.025);
    this.cigarette.add(this.ember);

    this.glow = new THREE.Mesh(
      new THREE.CircleGeometry(0.11, 24),
      new THREE.MeshBasicMaterial({ color: 0xff4a16, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.glow.position.set(-0.505, 0, 0.015);
    this.cigarette.add(this.glow);
    this.cigarette.position.z = 0.08;
    this.cigarette.renderOrder = 0;
  }

  getDiagnostics(): RendererDiagnostics {
    const gl = this.renderer.getContext();
    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = String(
      debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    );
    const vendor = String(
      debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
    );
    return {
      webglVersion: this.renderer.capabilities.isWebGL2 ? "WEBGL2" : "WEBGL1",
      renderer,
      vendor,
      hardwareAccelerated: !/(swiftshader|llvmpipe|software rasterizer)/i.test(renderer),
      maxTextureSize: this.renderer.capabilities.maxTextureSize,
    };
  }

  resize(width: number, height: number, videoWidth = this.videoWidth, videoHeight = this.videoHeight) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.videoWidth = Math.max(1, videoWidth);
    this.videoHeight = Math.max(1, videoHeight);
    this.renderer.setSize(this.width, this.height, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    if (this.particleMaterial?.uniforms.uPixelRatio) {
      this.particleMaterial.uniforms.uPixelRatio.value = this.renderer.getPixelRatio();
    }

    const videoAspect = this.videoWidth / this.videoHeight;
    const viewportAspect = this.width / this.height;
    if (viewportAspect > videoAspect) {
      this.displayedWidth = this.width;
      this.displayedHeight = this.width / videoAspect;
      this.cropX = 0;
      this.cropY = (this.displayedHeight - this.height) * 0.5;
    } else {
      this.displayedHeight = this.height;
      this.displayedWidth = this.height * videoAspect;
      this.cropX = (this.displayedWidth - this.width) * 0.5;
      this.cropY = 0;
    }
  }

  update(snapshot: InteractionSnapshot, face: FaceAnalysis, now: number, dt: number, fps: number, hand?: HandAnalysis) {
    const time = now / 1000;
    this.particleMaterial.uniforms.uTime.value = time;
    this.updatePerformanceQuality(fps, dt);
    this.updateHandInfluence(hand, dt);
    this.updatePinchInfluence(snapshot, hand, dt);

    const mapped = this.mapPoint(snapshot.cigarettePosition);
    const mappedLength = this.mapLength(snapshot.cigaretteLength);
    const mappedBaseLength = this.mapLength(snapshot.cigaretteBaseLength);
    this.cigarette.position.x = mapped.x;
    this.cigarette.position.y = mapped.y;
    this.cigarette.rotation.z = snapshot.cigaretteRotation;
    // Geometry is already modeled at roughly a 10:1 cigarette aspect ratio.
    // Only convert normalized X units to normalized Y units here; applying 0.1
    // again made the cigarette just 2–3 physical pixels thick.
    this.cigarette.scale.set(mappedLength, mappedBaseLength * (this.width / this.height) * 1.15, 1);
    const burning = snapshot.smokingState === "INHALING";
    const flicker = 0.9 + Math.sin(now * 0.013) * 0.08 + Math.sin(now * 0.037) * 0.035;
    this.ember.scale.setScalar(flicker);
    this.ember.material.color.setHex(burning ? 0xff4b1f : 0x665f59);
    this.glow.scale.setScalar(0.92 + Math.sin(now * 0.009) * 0.08);
    this.glow.material.opacity = burning ? 0.34 : 0.025;

    const mouthAttached = snapshot.cigaretteMouthSide !== null && (face.visible || face.inGracePeriod);
    this.lipMask.visible = mouthAttached;
    if (mouthAttached) {
      const mouth = this.mapPoint(face.mouthCenter);
      this.lipMask.position.x = mouth.x;
      this.lipMask.position.y = mouth.y;
      this.lipMask.rotation.z = face.roll;
      this.lipMask.scale.set(this.mapLength(face.mouthWidth) * 0.52, this.mapLength(face.mouthWidth) * 0.15 * (this.width / this.height), 1);
    }

    const emberVideo: Point3 = {
      x: snapshot.cigarettePosition.x - Math.cos(snapshot.cigaretteRotation) * snapshot.cigaretteLength * 0.505,
      y: snapshot.cigarettePosition.y - Math.sin(snapshot.cigaretteRotation) * snapshot.cigaretteLength * 0.505,
      z: 0,
    };
    const emberOrigin = this.mapPoint(emberVideo);
    this.baseSmokeAccumulator = burning ? this.baseSmokeAccumulator + dt * 60 * this.qualityFactor() : 0;
    let spawnedTipSmoke = false;
    while (this.baseSmokeAccumulator >= 1) {
      this.baseSmokeAccumulator -= 1;
      this.baseSmokeParticleCount += 1;
      this.spawn(emberOrigin, { x: (Math.random() - 0.5) * 0.016, y: -0.016 - Math.random() * 0.018, z: 0 }, 0, 4 + Math.random() * 2, 18 + Math.random() * 15);
      spawnedTipSmoke = true;
    }
    if (spawnedTipSmoke) this.markParticlesDirty();

    this.renderer.render(this.scene, this.camera);
    if (useInteractionStore.getState().debugMode && now - this.lastParticleDebugUpdate >= 250) {
      this.lastParticleDebugUpdate = now;
      useInteractionStore.getState().updateRuntime({
        baseSmokeParticles: this.baseSmokeParticleCount,
        particleDrawCount: this.renderer.info.render.points,
      });
    }
  }

  emit(emission: SmokeEmission) {
    if (emission.type === "MOUTH_BURST") this.emitMouthBurst(emission);
    if (emission.type === "NOSE_BURST") this.emitNoseBurst(emission);
    if (emission.type === "SMOKE_RING") this.emitSmokeRing(emission);
  }

  private emitMouthBurst(emission: Extract<SmokeEmission, { type: "MOUTH_BURST" }>) {
    const factor = this.qualityFactor();
    const origin = this.mapPoint(emission.origin);
    const count = Math.max(
      600,
      Math.round((280 + emission.strength * 120) * SMOKE_VOLUME_MULTIPLIER * factor),
    );
    this.mouthParticleCount += count;
    for (let index = 0; index < count; index += 1) {
      const lateral = (Math.random() + Math.random() - 1) * (0.075 + emission.strength * 0.035);
      const upward = -(0.075 + Math.pow(Math.random(), 0.68) * (0.14 + emission.strength * 0.045));
      const layeredOrigin = {
        x: origin.x + (Math.random() - 0.5) * 0.022,
        y: origin.y + (Math.random() - 0.5) * 0.012,
        z: origin.z,
      };
      this.spawn(
        layeredOrigin,
        { x: emission.direction.x * 0.08 + lateral, y: upward, z: 0 },
        1,
        2.7 + Math.random() * 1.5,
        20 + Math.random() * 42,
      );
    }
    this.markParticlesDirty();
  }

  private emitNoseBurst(emission: Extract<SmokeEmission, { type: "NOSE_BURST" }>) {
    const factor = this.qualityFactor();
    const origins = [this.mapPoint(emission.origin), this.mapPoint(emission.secondaryOrigin)];
    const countPerNostril = Math.max(
      200,
      Math.round((70 + emission.strength * 24) * SMOKE_VOLUME_MULTIPLIER * factor),
    );
    this.mouthParticleCount += countPerNostril * 2;
    origins.forEach((origin, nostrilIndex) => {
      const outward = nostrilIndex === 0 ? -1 : 1;
      for (let index = 0; index < countPerNostril; index += 1) {
        this.spawn(
          origin,
          {
            x: outward * (0.012 + Math.random() * 0.024) + (Math.random() - 0.5) * 0.014,
            y: -(0.065 + Math.random() * 0.105),
            z: 0,
          },
          2,
          2.3 + Math.random() * 1.2,
          14 + Math.random() * 25,
        );
      }
    });
    this.markParticlesDirty();
  }

  private emitSmokeRing(emission: Extract<SmokeEmission, { type: "SMOKE_RING" }>) {
    const factor = this.qualityFactor();
    const count = Math.round((400 + emission.strength * 180) * factor);
    const coreCount = Math.round(count * 0.62);
    const hazeCount = Math.round(count * 0.23);
    const wakeCount = count - coreCount - hazeCount;
    const origin = this.mapPoint(emission.origin);
    const coreRadiusX = 0.015 + emission.strength * 0.005;
    const coreRadiusY = coreRadiusX * (this.width / this.height);
    const hazeRadiusX = coreRadiusX * 1.2;
    const hazeRadiusY = hazeRadiusX * (this.width / this.height);
    const coreExpansionX = coreRadiusX * 1.28;
    const coreExpansionY = coreExpansionX * (this.width / this.height);
    const hazeExpansionX = coreExpansionX * 1.08;
    const hazeExpansionY = hazeExpansionX * (this.width / this.height);
    const travel = 0.073 + emission.strength * 0.014;
    const ringLifetime = 2.55 + emission.strength * 0.72;

    for (let index = 0; index < coreCount; index += 1) {
      const theta = (index / coreCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.012;
      const radiusScale = 0.965 + Math.random() * 0.07;
      const radialX = Math.cos(theta);
      const radialY = Math.sin(theta);
      const radialBand = (Math.random() - 0.5) * 0.0016;
      this.spawn(
        {
          x: origin.x + radialX * (coreRadiusX * radiusScale + radialBand),
          y: origin.y + radialY * (coreRadiusY * radiusScale + radialBand * (this.width / this.height)),
          z: origin.z,
        },
        {
          x: emission.direction.x * travel + radialX * coreExpansionX,
          y: -0.004 + emission.direction.y * travel * 0.12 + radialY * coreExpansionY,
          z: 0,
        },
        3,
        ringLifetime * (0.97 + Math.random() * 0.06),
        6 + Math.random() * 6,
      );
    }

    for (let index = 0; index < hazeCount; index += 1) {
      const theta = (index / hazeCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.04;
      const radiusScale = 1.08 + Math.random() * 0.24;
      const radialX = Math.cos(theta);
      const radialY = Math.sin(theta);
      const radialBand = (Math.random() - 0.5) * 0.003;
      this.spawn(
        {
          x: origin.x + radialX * (hazeRadiusX * radiusScale + radialBand),
          y: origin.y + radialY * (hazeRadiusY * radiusScale + radialBand * (this.width / this.height)),
          z: origin.z,
        },
        {
          x: emission.direction.x * travel * 0.96 + radialX * hazeExpansionX,
          y: -0.003 + emission.direction.y * travel * 0.1 + radialY * hazeExpansionY,
          z: 0,
        },
        4,
        ringLifetime * (0.9 + Math.random() * 0.18),
        12 + Math.random() * 10,
      );
    }

    for (let index = 0; index < wakeCount; index += 1) {
      const theta = (index / wakeCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.08;
      const radiusScale = 0.98 + Math.random() * 0.16;
      const radialX = Math.cos(theta);
      const radialY = Math.sin(theta);
      this.spawn(
        {
          x: origin.x + radialX * (coreRadiusX * radiusScale) - emission.direction.x * 0.004,
          y: origin.y + radialY * (coreRadiusY * radiusScale) - emission.direction.y * 0.004,
          z: origin.z,
        },
        {
          x: emission.direction.x * travel * (0.26 + Math.random() * 0.18) + radialX * coreExpansionX * 0.42,
          y: -0.001 + emission.direction.y * travel * 0.06 + radialY * coreExpansionY * 0.42,
          z: 0,
        },
        5,
        0.8 + emission.strength * 0.14 + Math.random() * 0.32,
        8 + Math.random() * 7,
      );
    }
    this.markParticlesDirty();
  }

  private spawn(origin: Point3, velocity: Point3, kind: number, lifetime: number, size: number) {
    const index = this.cursor;
    this.cursor = (this.cursor + 1) % MAX_PARTICLES;
    const base = index * 3;
    const originJitter = kind >= 3 ? 0.0008 : kind >= 1 ? 0.01 : 0.004;
    this.starts[base] = origin.x + (Math.random() - 0.5) * originJitter;
    this.starts[base + 1] = origin.y + (Math.random() - 0.5) * originJitter;
    this.starts[base + 2] = 0.3;
    this.velocities[base] = velocity.x;
    this.velocities[base + 1] = velocity.y;
    this.velocities[base + 2] = 0;
    this.spawnTimes[index] = this.particleMaterial.uniforms.uTime.value;
    this.lifetimes[index] = lifetime;
    this.sizes[index] = size;
    this.seeds[index] = Math.random();
    this.kinds[index] = kind;
  }

  private markParticlesDirty() {
    for (const name of ["aStart", "aVelocity", "aSpawnTime", "aLifetime", "aSize", "aSeed", "aKind"]) {
      (this.particleGeometry.getAttribute(name) as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  private mapPoint(point: Point3): Point3 {
    return {
      x: (point.x * this.displayedWidth - this.cropX) / this.width,
      y: (point.y * this.displayedHeight - this.cropY) / this.height,
      z: point.z,
    };
  }

  private mapLength(length: number) {
    return length * this.displayedWidth / this.width;
  }

  private mapVector(vector: Point3): Point3 {
    return {
      x: vector.x * this.displayedWidth / this.width,
      y: vector.y * this.displayedHeight / this.height,
      z: vector.z,
    };
  }

  private updateHandInfluence(hand: HandAnalysis | undefined, dt: number) {
    const smoothing = expSmoothing(dt, 16);
    if (hand?.visible) {
      const targetPosition = this.mapPoint(hand.palmCenter);
      const targetVelocity = this.mapVector(hand.velocity);
      this.handTargetPosition.set(targetPosition.x, targetPosition.y);
      this.handTargetVelocity.set(targetVelocity.x, targetVelocity.y);
      this.handPosition.lerp(this.handTargetPosition, smoothing);
      this.handVelocity.lerp(this.handTargetVelocity, expSmoothing(dt, 12));
      this.handSpeed = lerp(this.handSpeed, Math.min(1.2, hand.speed), expSmoothing(dt, 14));
      this.handInfluenceRadius = lerp(
        this.handInfluenceRadius,
        clamp(hand.palmSize * 1.8, 0.14, 0.24),
        smoothing,
      );
      this.handActive = lerp(this.handActive, 1, expSmoothing(dt, 24));
      this.handMissingSeconds = 0;
    } else {
      this.handMissingSeconds += dt;
      const decay = Math.exp(-dt * (this.handMissingSeconds > 0.12 ? 18 : 10));
      this.handVelocity.multiplyScalar(decay);
      this.handSpeed *= decay;
      this.handActive *= decay;
    }
    this.particleMaterial.uniforms.uHandPosition.value = this.handPosition;
    this.particleMaterial.uniforms.uHandVelocity.value = this.handVelocity;
    this.particleMaterial.uniforms.uHandSpeed.value = this.handSpeed;
    this.particleMaterial.uniforms.uHandInfluenceRadius.value = this.handInfluenceRadius;
    this.particleMaterial.uniforms.uHandActive.value = this.handActive;
  }

  private updatePinchInfluence(snapshot: InteractionSnapshot, hand: HandAnalysis | undefined, dt: number) {
    const cigaretteHeld = snapshot.cigaretteState === "HAND_HELD" || snapshot.cigaretteState === "FINGER_HELD";
    const pinchAllowed = Boolean(hand?.visible && hand.state === "PINCH" && !cigaretteHeld);
    if (pinchAllowed && hand) {
      const targetPosition = this.mapPoint(hand.pinchPoint);
      this.pinchTargetPosition.set(targetPosition.x, targetPosition.y);
      this.pinchPosition.lerp(this.pinchTargetPosition, expSmoothing(dt, 20));
      const targetStrength = clamp((0.29 - hand.pinchDistance) / 0.19, 0, 1);
      this.pinchStrength = lerp(this.pinchStrength, targetStrength, expSmoothing(dt, 22));
      this.pinchRadius = lerp(this.pinchRadius, clamp(hand.palmSize * 1.1, 0.1, 0.16), expSmoothing(dt, 18));
      this.pinchActive = lerp(this.pinchActive, 1, expSmoothing(dt, 24));
      this.pinchMissingSeconds = 0;
    } else {
      this.pinchMissingSeconds += dt;
      const decay = Math.exp(-dt * (this.pinchMissingSeconds > 0.08 ? 20 : 14));
      this.pinchStrength *= decay;
      this.pinchActive *= decay;
    }
    this.particleMaterial.uniforms.uPinchPosition.value = this.pinchPosition;
    this.particleMaterial.uniforms.uPinchActive.value = this.pinchActive;
    this.particleMaterial.uniforms.uPinchStrength.value = this.pinchStrength;
    this.particleMaterial.uniforms.uPinchRadius.value = this.pinchRadius;
  }

  private qualityFactor() {
    return this.quality === "HIGH" ? 1 : this.quality === "MEDIUM" ? 0.72 : 0.48;
  }

  private updatePerformanceQuality(fps: number, dt: number) {
    if (!fps) return;
    if (fps < 42) {
      this.lowFpsDuration += dt;
      this.recoveryDuration = 0;
    } else if (fps > 54) {
      this.recoveryDuration += dt;
      this.lowFpsDuration = Math.max(0, this.lowFpsDuration - dt * 0.5);
    }

    let next = this.quality;
    if (this.lowFpsDuration > 1.5) {
      next = this.quality === "HIGH" ? "MEDIUM" : "LOW";
      this.lowFpsDuration = 0;
    } else if (this.recoveryDuration > 4) {
      next = this.quality === "LOW" ? "MEDIUM" : "HIGH";
      this.recoveryDuration = 0;
    }
    if (next !== this.quality) {
      this.quality = next;
      if (useInteractionStore.getState().debugMode) {
        useInteractionStore.getState().updateRuntime({ particleQuality: next });
      }
    }
  }

  dispose() {
    this.renderer.dispose();
    this.particleGeometry.dispose();
    this.particleMaterial.dispose();
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
      else object.material.dispose();
    });
  }
}
