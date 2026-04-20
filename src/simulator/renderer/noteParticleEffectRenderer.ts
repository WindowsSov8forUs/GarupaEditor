import { Graphics, PerspectiveMesh, Texture } from "pixi.js";
import type { NoteSkinTextureBundle } from "../engine/assets";
import type {
  ParticleCurve,
  ParticleCurveTerm,
  ParticleEase,
  ParticleEffectDefinition,
  ParticleTransformTerm,
} from "../engine/particlePack";
import type { SimulatorSettings } from "../engine/types";

export type ParticleLayoutPreset =
  | "linear"
  | "circular"
  | "lane"
  | "slot"
  | "holdLinear"
  | "holdCircular"
  | "directionalLinearLeft"
  | "directionalLinearRight";

export interface ActiveParticleEmitter {
  effect: ParticleEffectDefinition;
  lane: number;
  startMs: number;
  durationMs: number;
  loop: boolean;
  preset: ParticleLayoutPreset;
  seedBase: number;
}

export interface ParticleEmitterDrawContext {
  settings: SimulatorSettings;
  viewportWidth: number;
  viewportHeight: number;
  stageWToH: number;
  laneXAtPercentRaw(lane: number, percent: number): number;
  laneYAtPercentRaw(percent: number): number;
  allocEffectMesh(texture: Texture): PerspectiveMesh | null;
}

interface ParticleSeedSet {
  r1: number;
  r2: number;
  r3: number;
  r4: number;
  r5: number;
  r6: number;
  r7: number;
  r8: number;
  sinr1: number;
  sinr2: number;
  sinr3: number;
  sinr4: number;
  sinr5: number;
  sinr6: number;
  sinr7: number;
  sinr8: number;
  cosr1: number;
  cosr2: number;
  cosr3: number;
  cosr4: number;
  cosr5: number;
  cosr6: number;
  cosr7: number;
  cosr8: number;
}

interface Point {
  lane: number;
  percent: number;
}

interface LocalPoint {
  x: number;
  y: number;
}

interface QuadTransformInputs {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  x3: number;
  y3: number;
  x4: number;
  y4: number;
}

type SonolusQuad = [Point, Point, Point, Point];
type LocalQuad = [LocalPoint, LocalPoint, LocalPoint, LocalPoint];

type XProjectionMode = "perspective" | "judge";

interface ParticleLayoutBasis {
  baseQuad: SonolusQuad;
  xProjection: XProjectionMode;
}

const SLOT_EFFECT_SIZE_DEFAULT = 1;
const LANE_EFFECT_TOP_PERCENT = 0.05;

export function drawParticleEmitter(
  context: ParticleEmitterDrawContext,
  pack: NonNullable<NoteSkinTextureBundle["particleEffects"]>,
  emitter: ActiveParticleEmitter,
  unitElapsed: number,
  fallbackG: Graphics,
): void {
  const wToH = Math.max(1e-6, context.stageWToH);
  // Sonolus uses options.noteEffectSize (default 1.0). In this app, note effect size follows note size.
  const noteEffectSize = Math.max(0.01, context.settings.noteSize);
  // Slot effect follows Sonolus slotEffectSize default semantics (1.0) when no dedicated runtime setting exists.
  const slotEffectSize = SLOT_EFFECT_SIZE_DEFAULT;
  const layout = resolveLayoutBasis(emitter, noteEffectSize, slotEffectSize, wToH);
  const transformSeeds = createSeeds(emitter.seedBase ^ 0x3f2d);
  const transformedBaseQuad = applyEffectTransform(layout.baseQuad, emitter.effect, transformSeeds);

  for (let groupIndex = 0; groupIndex < emitter.effect.groups.length; groupIndex += 1) {
    const group = emitter.effect.groups[groupIndex];
    for (let instanceIndex = 0; instanceIndex < group.count; instanceIndex += 1) {
      for (let particleIndex = 0; particleIndex < group.particles.length; particleIndex += 1) {
        const particle = group.particles[particleIndex];
        const particleStart = particle.start;
        const particleEnd = particle.start + particle.duration;
        if (unitElapsed < particleStart || unitElapsed > particleEnd) {
          continue;
        }

        const progress = Math.max(0, Math.min(1, (unitElapsed - particleStart) / Math.max(1e-6, particle.duration)));
        const spawnIndex = resolveParticleSpawnIndex(unitElapsed, particleStart);
        const termSeeds = createSeeds(
          composeParticleSeed(
            emitter.seedBase,
            groupIndex,
            instanceIndex,
            particleIndex,
            spawnIndex,
          ),
        );

        const localX = evaluateCurve(particle.x, progress, 0, termSeeds);
        const localY = evaluateCurve(particle.y, progress, 0, termSeeds);
        const localW = Math.max(0, evaluateCurve(particle.w, progress, 0, termSeeds));
        const localH = Math.max(0, evaluateCurve(particle.h, progress, 0, termSeeds));
        const localR = evaluateCurve(particle.r, progress, 0, termSeeds);
        const localA = Math.max(0, Math.min(1, evaluateCurve(particle.a, progress, 0, termSeeds)));
        if (localA <= 0 || localW <= 0 || localH <= 0) {
          continue;
        }

        const localCorners = localRectCorners(localX, localY, localW, localH, localR);
        const sonolusCorners = mapLocalQuadToBaseQuad(transformedBaseQuad, localCorners);
        const pixiCorners = sonolusQuadToPixiCorners(sonolusCorners);

        const projectX = (point: Point) =>
          layout.xProjection === "perspective"
            ? context.laneXAtPercentRaw(point.lane, point.percent)
            : context.laneXAtPercentRaw(point.lane, 1);
        const pxCorners = pixiCorners.map((point) => ({
          x: projectX(point),
          y: context.laneYAtPercentRaw(point.percent),
        }));

        const texture = pack.spriteTextures.get(particle.spriteIndex) ?? null;
        if (texture) {
          const mesh = context.allocEffectMesh(texture);
          if (mesh) {
            mesh.alpha = localA;
            mesh.tint = particle.color;
            mesh.setCorners(
              pxCorners[0].x,
              pxCorners[0].y,
              pxCorners[1].x,
              pxCorners[1].y,
              pxCorners[2].x,
              pxCorners[2].y,
              pxCorners[3].x,
              pxCorners[3].y,
            );
            continue;
          }
        }

        fallbackG.fill({ color: particle.color, alpha: localA });
        fallbackG.moveTo(pxCorners[0].x, pxCorners[0].y);
        fallbackG.lineTo(pxCorners[1].x, pxCorners[1].y);
        fallbackG.lineTo(pxCorners[2].x, pxCorners[2].y);
        fallbackG.lineTo(pxCorners[3].x, pxCorners[3].y);
        fallbackG.closePath();
        fallbackG.fill();
      }
    }
  }
}

function resolveLayoutBasis(
  emitter: ActiveParticleEmitter,
  noteEffectSize: number,
  slotEffectSize: number,
  wToH: number,
): ParticleLayoutBasis {
  const lane = emitter.lane;

  if (emitter.preset === "lane") {
    const l = lane - 0.5;
    const r = lane + 0.5;
    const t = LANE_EFFECT_TOP_PERCENT;
    const b = 1;
    return {
      // In this renderer, laneXAtPercentRaw already applies depth contraction by `percent`.
      // So lane effect should keep lane bounds in the base quad and use perspective projection.
      baseQuad: rectQuad(l, r, t, b),
      xProjection: "perspective",
    };
  }

  if (emitter.preset === "circular") {
    const w = 1.5 * noteEffectSize;
    const h = 1 * noteEffectSize * wToH;
    const l = lane - w;
    const r = lane + w;
    const t = 1 - h;
    const b = 1 + h;
    return {
      baseQuad: rectQuad(l, r, t, b),
      xProjection: "judge",
    };
  }

  if (emitter.preset === "holdCircular") {
    const w = 0.9 * noteEffectSize;
    const h = 0.6 * noteEffectSize * wToH;
    const l = lane - w;
    const r = lane + w;
    const t = 1 - h;
    const b = 1 + h;
    return {
      baseQuad: rectQuad(l, r, t, b),
      xProjection: "judge",
    };
  }

  if (emitter.preset === "slot") {
    const w = 0.5 * slotEffectSize;
    const h = 2 * w * wToH;
    const l = lane - w;
    const r = lane + w;
    const t = 1 - h;
    const b = 1;
    return {
      baseQuad: rectQuad(l, r, t, b),
      xProjection: "judge",
    };
  }

  if (emitter.preset === "directionalLinearLeft") {
    const w = noteEffectSize;
    const h = 0.5 * noteEffectSize * wToH;
    const l = lane - w;
    const r = lane;
    const t = 1 - h;
    const b = 1 + h;
    return {
      baseQuad: leftRotatedQuad(l, r, t, b),
      xProjection: "judge",
    };
  }

  if (emitter.preset === "directionalLinearRight") {
    const w = noteEffectSize;
    const h = 0.5 * noteEffectSize * wToH;
    const l = lane;
    const r = lane + w;
    const t = 1 - h;
    const b = 1 + h;
    return {
      baseQuad: rightRotatedQuad(l, r, t, b),
      xProjection: "judge",
    };
  }

  // linear + holdLinear share Sonolus linearEffectLayout.
  const w = 0.5 * noteEffectSize;
  const h = noteEffectSize * wToH;
  const l = lane - w;
  const r = lane + w;
  const t = 1 - h;
  const b = 1;
  return {
    baseQuad: rectQuad(l, r, t, b),
    xProjection: "judge",
  };
}

function rectQuad(l: number, r: number, t: number, b: number): SonolusQuad {
  // Sonolus corner order: BL, TL, TR, BR.
  return [
    { lane: l, percent: b },
    { lane: l, percent: t },
    { lane: r, percent: t },
    { lane: r, percent: b },
  ];
}

function leftRotatedQuad(l: number, r: number, t: number, b: number): SonolusQuad {
  return [
    { lane: r, percent: b },
    { lane: l, percent: b },
    { lane: l, percent: t },
    { lane: r, percent: t },
  ];
}

function rightRotatedQuad(l: number, r: number, t: number, b: number): SonolusQuad {
  return [
    { lane: l, percent: t },
    { lane: r, percent: t },
    { lane: r, percent: b },
    { lane: l, percent: b },
  ];
}

function localRectCorners(centerX: number, centerY: number, halfW: number, halfH: number, rotation: number): LocalQuad {
  const corners: LocalQuad = [
    { x: centerX - halfW, y: centerY - halfH }, // BL
    { x: centerX - halfW, y: centerY + halfH }, // TL
    { x: centerX + halfW, y: centerY + halfH }, // TR
    { x: centerX + halfW, y: centerY - halfH }, // BR
  ];

  if (Math.abs(rotation) <= 1e-9) {
    return corners;
  }

  const cosR = Math.cos(rotation);
  const sinR = Math.sin(rotation);
  return corners.map((corner) => {
    const dx = corner.x - centerX;
    const dy = corner.y - centerY;
    return {
      x: centerX + dx * cosR - dy * sinR,
      y: centerY + dx * sinR + dy * cosR,
    };
  }) as LocalQuad;
}

function mapLocalQuadToBaseQuad(baseQuad: SonolusQuad, localQuad: LocalQuad): SonolusQuad {
  return [
    mapLocalPointToBaseQuad(baseQuad, localQuad[0]),
    mapLocalPointToBaseQuad(baseQuad, localQuad[1]),
    mapLocalPointToBaseQuad(baseQuad, localQuad[2]),
    mapLocalPointToBaseQuad(baseQuad, localQuad[3]),
  ];
}

function mapLocalPointToBaseQuad(baseQuad: SonolusQuad, localPoint: LocalPoint): Point {
  const [p1, p2, p3, p4] = baseQuad;
  const s = (localPoint.x + 1) * 0.5;
  const t = (localPoint.y + 1) * 0.5;

  const w1 = (1 - s) * (1 - t);
  const w2 = (1 - s) * t;
  const w3 = s * t;
  const w4 = s * (1 - t);

  return {
    lane: p1.lane * w1 + p2.lane * w2 + p3.lane * w3 + p4.lane * w4,
    percent: p1.percent * w1 + p2.percent * w2 + p3.percent * w3 + p4.percent * w4,
  };
}

function sonolusQuadToPixiCorners(quad: SonolusQuad): [Point, Point, Point, Point] {
  const [p1, p2, p3, p4] = quad;
  // Sonolus BL/TL/TR/BR -> Pixi TL/TR/BR/BL.
  return [p2, p3, p4, p1];
}

function applyEffectTransform(
  baseQuad: SonolusQuad,
  effect: ParticleEffectDefinition,
  seeds: ParticleSeedSet,
): SonolusQuad {
  const inputs: QuadTransformInputs = {
    x1: baseQuad[0].lane,
    y1: baseQuad[0].percent,
    x2: baseQuad[1].lane,
    y2: baseQuad[1].percent,
    x3: baseQuad[2].lane,
    y3: baseQuad[2].percent,
    x4: baseQuad[3].lane,
    y4: baseQuad[3].percent,
  };
  const transform = effect.transform;
  return [
    {
      lane: evaluateExpressionTerm(transform.x1, seeds, inputs),
      percent: evaluateExpressionTerm(transform.y1, seeds, inputs),
    },
    {
      lane: evaluateExpressionTerm(transform.x2, seeds, inputs),
      percent: evaluateExpressionTerm(transform.y2, seeds, inputs),
    },
    {
      lane: evaluateExpressionTerm(transform.x3, seeds, inputs),
      percent: evaluateExpressionTerm(transform.y3, seeds, inputs),
    },
    {
      lane: evaluateExpressionTerm(transform.x4, seeds, inputs),
      percent: evaluateExpressionTerm(transform.y4, seeds, inputs),
    },
  ];
}

function resolveParticleSpawnIndex(unitElapsed: number, particleStart: number): number {
  const index = Math.floor(unitElapsed - particleStart + 1e-9);
  return index > 0 ? index : 0;
}

function composeParticleSeed(
  emitterSeed: number,
  groupIndex: number,
  instanceIndex: number,
  particleIndex: number,
  spawnIndex: number,
): number {
  let seed = mixUint32(emitterSeed);
  seed = mixUint32(seed ^ Math.imul(groupIndex + 1, 0x9e3779b1));
  seed = mixUint32(seed ^ Math.imul(instanceIndex + 1, 0x85ebca6b));
  seed = mixUint32(seed ^ Math.imul(particleIndex + 1, 0xc2b2ae35));
  seed = mixUint32(seed ^ Math.imul(spawnIndex + 1, 0x27d4eb2f));
  return seed >>> 0;
}

function mixUint32(value: number): number {
  let x = value >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  x ^= x >>> 16;
  return x >>> 0;
}

function createSeeds(seedBase: number): ParticleSeedSet {
  const random01 = makeRng01(seedBase);
  const r1 = random01();
  const r2 = random01();
  const r3 = random01();
  const r4 = random01();
  const r5 = random01();
  const r6 = random01();
  const r7 = random01();
  const r8 = random01();
  return {
    r1,
    r2,
    r3,
    r4,
    r5,
    r6,
    r7,
    r8,
    sinr1: Math.sin(r1 * Math.PI * 2),
    sinr2: Math.sin(r2 * Math.PI * 2),
    sinr3: Math.sin(r3 * Math.PI * 2),
    sinr4: Math.sin(r4 * Math.PI * 2),
    sinr5: Math.sin(r5 * Math.PI * 2),
    sinr6: Math.sin(r6 * Math.PI * 2),
    sinr7: Math.sin(r7 * Math.PI * 2),
    sinr8: Math.sin(r8 * Math.PI * 2),
    cosr1: Math.cos(r1 * Math.PI * 2),
    cosr2: Math.cos(r2 * Math.PI * 2),
    cosr3: Math.cos(r3 * Math.PI * 2),
    cosr4: Math.cos(r4 * Math.PI * 2),
    cosr5: Math.cos(r5 * Math.PI * 2),
    cosr6: Math.cos(r6 * Math.PI * 2),
    cosr7: Math.cos(r7 * Math.PI * 2),
    cosr8: Math.cos(r8 * Math.PI * 2),
  };
}

function makeRng01(seedBase: number): () => number {
  let state = mixUint32(seedBase);
  if (state === 0) {
    state = 0x6d2b79f5;
  }
  return () => {
    state = (state ^ (state << 13)) >>> 0;
    state = (state ^ (state >>> 17)) >>> 0;
    state = (state ^ (state << 5)) >>> 0;
    return state / 0x100000000;
  };
}

function evaluateCurve(curve: ParticleCurve, progress: number, defaultValue: number, seeds: ParticleSeedSet): number {
  const from = curve.from ? evaluateCurveTerm(curve.from, seeds) : null;
  const to = curve.to ? evaluateCurveTerm(curve.to, seeds) : null;
  const eased = applyEase(curve.ease, progress);
  if (from === null && to === null) {
    return defaultValue;
  }
  if (from !== null && to === null) {
    return lerp(from, defaultValue, eased);
  }
  if (from === null && to !== null) {
    return lerp(defaultValue, to, eased);
  }
  return lerp(from ?? defaultValue, to ?? defaultValue, eased);
}

function evaluateCurveTerm(term: ParticleCurveTerm, seeds: ParticleSeedSet): number {
  return evaluateExpressionTerm(term, seeds);
}

function evaluateExpressionTerm(
  term: ParticleCurveTerm | ParticleTransformTerm,
  seeds: ParticleSeedSet,
  quadInputs?: QuadTransformInputs,
): number {
  const c = Number.isFinite(term.c) ? (term.c as number) : 0;
  let result = c;
  result += (term.r1 ?? 0) * seeds.r1;
  result += (term.r2 ?? 0) * seeds.r2;
  result += (term.r3 ?? 0) * seeds.r3;
  result += (term.r4 ?? 0) * seeds.r4;
  result += (term.r5 ?? 0) * seeds.r5;
  result += (term.r6 ?? 0) * seeds.r6;
  result += (term.r7 ?? 0) * seeds.r7;
  result += (term.r8 ?? 0) * seeds.r8;
  result += (term.sinr1 ?? 0) * seeds.sinr1;
  result += (term.sinr2 ?? 0) * seeds.sinr2;
  result += (term.sinr3 ?? 0) * seeds.sinr3;
  result += (term.sinr4 ?? 0) * seeds.sinr4;
  result += (term.sinr5 ?? 0) * seeds.sinr5;
  result += (term.sinr6 ?? 0) * seeds.sinr6;
  result += (term.sinr7 ?? 0) * seeds.sinr7;
  result += (term.sinr8 ?? 0) * seeds.sinr8;
  result += (term.cosr1 ?? 0) * seeds.cosr1;
  result += (term.cosr2 ?? 0) * seeds.cosr2;
  result += (term.cosr3 ?? 0) * seeds.cosr3;
  result += (term.cosr4 ?? 0) * seeds.cosr4;
  result += (term.cosr5 ?? 0) * seeds.cosr5;
  result += (term.cosr6 ?? 0) * seeds.cosr6;
  result += (term.cosr7 ?? 0) * seeds.cosr7;
  result += (term.cosr8 ?? 0) * seeds.cosr8;

  if (quadInputs) {
    const transformTerm = term as ParticleTransformTerm;
    result += (transformTerm.x1 ?? 0) * quadInputs.x1;
    result += (transformTerm.y1 ?? 0) * quadInputs.y1;
    result += (transformTerm.x2 ?? 0) * quadInputs.x2;
    result += (transformTerm.y2 ?? 0) * quadInputs.y2;
    result += (transformTerm.x3 ?? 0) * quadInputs.x3;
    result += (transformTerm.y3 ?? 0) * quadInputs.y3;
    result += (transformTerm.x4 ?? 0) * quadInputs.x4;
    result += (transformTerm.y4 ?? 0) * quadInputs.y4;
  }

  return result;
}

function applyEase(ease: ParticleEase, t: number): number {
  const p = Math.max(0, Math.min(1, t));
  if (ease === "linear" || ease === "none") {
    return p;
  }

  const match = /^(in|out|inOut|outIn)(Sine|Quad|Cubic|Quart|Quint|Expo|Circ|Back|Elastic)$/.exec(ease);
  if (!match) {
    return p;
  }
  const mode = match[1] as "in" | "out" | "inOut" | "outIn";
  const family = match[2] as "Sine" | "Quad" | "Cubic" | "Quart" | "Quint" | "Expo" | "Circ" | "Back" | "Elastic";
  return applyEaseFamily(mode, family, p);
}

function applyEaseFamily(
  mode: "in" | "out" | "inOut" | "outIn",
  family: "Sine" | "Quad" | "Cubic" | "Quart" | "Quint" | "Expo" | "Circ" | "Back" | "Elastic",
  t: number,
): number {
  if (mode === "in") {
    return easeInFamily(family, t);
  }
  if (mode === "out") {
    return 1 - easeInFamily(family, 1 - t);
  }
  if (mode === "inOut") {
    if (t < 0.5) {
      return easeInFamily(family, t * 2) * 0.5;
    }
    return 1 - easeInFamily(family, (1 - t) * 2) * 0.5;
  }
  if (t < 0.5) {
    return (1 - easeInFamily(family, 1 - t * 2)) * 0.5;
  }
  return easeInFamily(family, (t - 0.5) * 2) * 0.5 + 0.5;
}

function easeInFamily(
  family: "Sine" | "Quad" | "Cubic" | "Quart" | "Quint" | "Expo" | "Circ" | "Back" | "Elastic",
  t: number,
): number {
  if (family === "Sine") {
    return 1 - Math.cos((Math.PI * t) / 2);
  }
  if (family === "Quad") {
    return t * t;
  }
  if (family === "Cubic") {
    return t * t * t;
  }
  if (family === "Quart") {
    return t * t * t * t;
  }
  if (family === "Quint") {
    return t * t * t * t * t;
  }
  if (family === "Expo") {
    return t <= 0 ? 0 : 2 ** (10 * t - 10);
  }
  if (family === "Circ") {
    return 1 - Math.sqrt(Math.max(0, 1 - t * t));
  }
  if (family === "Back") {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return c3 * t * t * t - c1 * t * t;
  }
  if (t <= 0) {
    return 0;
  }
  if (t >= 1) {
    return 1;
  }
  return -(2 ** (10 * t - 10)) * Math.sin((t * 10 - 10.75) * ((Math.PI * 2) / 3));
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}
