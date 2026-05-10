import { Rectangle, Texture } from "pixi.js";

type ParticleEaseMode = "in" | "out" | "inOut" | "outIn";
type ParticleEaseFamily = "Sine" | "Quad" | "Cubic" | "Quart" | "Quint" | "Expo" | "Circ" | "Back" | "Elastic";

export type ParticleEase = "linear" | "none" | `${ParticleEaseMode}${ParticleEaseFamily}`;

interface ParticleExpressionTerm {
  c: number;
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

export interface ParticleCurveTerm extends ParticleExpressionTerm {}

export interface ParticleCurve {
  from: ParticleCurveTerm | null;
  to: ParticleCurveTerm | null;
  ease: ParticleEase;
}

interface ParticleTemplateDefinition {
  spriteIndex: number;
  color: number;
  start: number;
  duration: number;
  x: ParticleCurve;
  y: ParticleCurve;
  w: ParticleCurve;
  h: ParticleCurve;
  r: ParticleCurve;
  a: ParticleCurve;
}

interface ParticleGroupDefinition {
  count: number;
  particles: ParticleTemplateDefinition[];
}

export interface ParticleTransformTerm extends ParticleExpressionTerm {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  x3: number;
  y3: number;
  x4: number;
  y4: number;
}

interface ParticleTransformDefinition {
  x1: ParticleTransformTerm;
  y1: ParticleTransformTerm;
  x2: ParticleTransformTerm;
  y2: ParticleTransformTerm;
  x3: ParticleTransformTerm;
  y3: ParticleTransformTerm;
  x4: ParticleTransformTerm;
  y4: ParticleTransformTerm;
}

export interface ParticleEffectDefinition {
  name: string;
  transform: ParticleTransformDefinition;
  groups: ParticleGroupDefinition[];
  maxLife: number;
}

export interface ParticleEffectPack {
  slotToEffectName: Record<string, string>;
  requiredEffectNames: string[];
  effectsByName: Map<string, ParticleEffectDefinition>;
  spriteTextures: Map<number, Texture>;
  destroy(): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toFiniteNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function toInt(value: unknown, fallback: number): number {
  const rounded = Math.round(toFiniteNumber(value, fallback));
  return Number.isFinite(rounded) ? rounded : fallback;
}

function parseColor(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value)) & 0xffffff;
  }
  if (typeof value !== "string") {
    return 0xffffff;
  }
  const raw = value.trim().replace(/^#/, "");
  if (raw.length === 3) {
    const expanded = `${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`;
    const parsed = Number.parseInt(expanded, 16);
    return Number.isFinite(parsed) ? parsed : 0xffffff;
  }
  if (raw.length === 6) {
    const parsed = Number.parseInt(raw, 16);
    return Number.isFinite(parsed) ? parsed : 0xffffff;
  }
  return 0xffffff;
}

const RANDOM_TERM_KEYS = [
  "r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8",
  "sinr1", "sinr2", "sinr3", "sinr4", "sinr5", "sinr6", "sinr7", "sinr8",
  "cosr1", "cosr2", "cosr3", "cosr4", "cosr5", "cosr6", "cosr7", "cosr8",
] as const;

const TRANSFORM_COORD_KEYS = ["x1", "y1", "x2", "y2", "x3", "y3", "x4", "y4"] as const;

const DEFAULT_EXPRESSION_TERM: ParticleExpressionTerm = {
  c: 0,
  r1: 0,
  r2: 0,
  r3: 0,
  r4: 0,
  r5: 0,
  r6: 0,
  r7: 0,
  r8: 0,
  sinr1: 0,
  sinr2: 0,
  sinr3: 0,
  sinr4: 0,
  sinr5: 0,
  sinr6: 0,
  sinr7: 0,
  sinr8: 0,
  cosr1: 0,
  cosr2: 0,
  cosr3: 0,
  cosr4: 0,
  cosr5: 0,
  cosr6: 0,
  cosr7: 0,
  cosr8: 0,
};

const DEFAULT_TRANSFORM_TERM: ParticleTransformTerm = {
  ...DEFAULT_EXPRESSION_TERM,
  x1: 0,
  y1: 0,
  x2: 0,
  y2: 0,
  x3: 0,
  y3: 0,
  x4: 0,
  y4: 0,
};

const DEFAULT_IDENTITY_TRANSFORM: ParticleTransformDefinition = {
  x1: { ...DEFAULT_TRANSFORM_TERM, x1: 1 },
  y1: { ...DEFAULT_TRANSFORM_TERM, y1: 1 },
  x2: { ...DEFAULT_TRANSFORM_TERM, x2: 1 },
  y2: { ...DEFAULT_TRANSFORM_TERM, y2: 1 },
  x3: { ...DEFAULT_TRANSFORM_TERM, x3: 1 },
  y3: { ...DEFAULT_TRANSFORM_TERM, y3: 1 },
  x4: { ...DEFAULT_TRANSFORM_TERM, x4: 1 },
  y4: { ...DEFAULT_TRANSFORM_TERM, y4: 1 },
};

function parseEase(value: unknown): ParticleEase {
  if (typeof value !== "string") {
    return "linear";
  }
  if (value === "linear" || value === "none") {
    return value;
  }
  if (/^(in|out|inOut|outIn)(Sine|Quad|Cubic|Quart|Quint|Expo|Circ|Back|Elastic)$/.test(value)) {
    return value as ParticleEase;
  }
  return "linear";
}

function parseCurveTerm(raw: unknown): ParticleCurveTerm | null {
  if (!isRecord(raw)) {
    return null;
  }
  const hasAny = raw.c !== undefined || RANDOM_TERM_KEYS.some((key) => raw[key] !== undefined);
  if (!hasAny) {
    return null;
  }
  const parsed: ParticleCurveTerm = {
    ...DEFAULT_EXPRESSION_TERM,
    c: toFiniteNumber(raw.c, 0),
  };
  for (const key of RANDOM_TERM_KEYS) {
    parsed[key] = toFiniteNumber(raw[key], 0);
  }
  return parsed;
}

function parseTransformTerm(raw: unknown): ParticleTransformTerm {
  if (!isRecord(raw)) {
    return { ...DEFAULT_TRANSFORM_TERM };
  }
  const parsed: ParticleTransformTerm = {
    ...DEFAULT_TRANSFORM_TERM,
    c: toFiniteNumber(raw.c, 0),
  };
  for (const key of RANDOM_TERM_KEYS) {
    parsed[key] = toFiniteNumber(raw[key], 0);
  }
  for (const key of TRANSFORM_COORD_KEYS) {
    parsed[key] = toFiniteNumber(raw[key], 0);
  }
  return parsed;
}

function parseTransform(raw: unknown): ParticleTransformDefinition {
  if (!isRecord(raw)) {
    return {
      x1: { ...DEFAULT_IDENTITY_TRANSFORM.x1 },
      y1: { ...DEFAULT_IDENTITY_TRANSFORM.y1 },
      x2: { ...DEFAULT_IDENTITY_TRANSFORM.x2 },
      y2: { ...DEFAULT_IDENTITY_TRANSFORM.y2 },
      x3: { ...DEFAULT_IDENTITY_TRANSFORM.x3 },
      y3: { ...DEFAULT_IDENTITY_TRANSFORM.y3 },
      x4: { ...DEFAULT_IDENTITY_TRANSFORM.x4 },
      y4: { ...DEFAULT_IDENTITY_TRANSFORM.y4 },
    };
  }
  return {
    x1: isRecord(raw.x1) ? parseTransformTerm(raw.x1) : { ...DEFAULT_IDENTITY_TRANSFORM.x1 },
    y1: isRecord(raw.y1) ? parseTransformTerm(raw.y1) : { ...DEFAULT_IDENTITY_TRANSFORM.y1 },
    x2: isRecord(raw.x2) ? parseTransformTerm(raw.x2) : { ...DEFAULT_IDENTITY_TRANSFORM.x2 },
    y2: isRecord(raw.y2) ? parseTransformTerm(raw.y2) : { ...DEFAULT_IDENTITY_TRANSFORM.y2 },
    x3: isRecord(raw.x3) ? parseTransformTerm(raw.x3) : { ...DEFAULT_IDENTITY_TRANSFORM.x3 },
    y3: isRecord(raw.y3) ? parseTransformTerm(raw.y3) : { ...DEFAULT_IDENTITY_TRANSFORM.y3 },
    x4: isRecord(raw.x4) ? parseTransformTerm(raw.x4) : { ...DEFAULT_IDENTITY_TRANSFORM.x4 },
    y4: isRecord(raw.y4) ? parseTransformTerm(raw.y4) : { ...DEFAULT_IDENTITY_TRANSFORM.y4 },
  };
}

function parseCurve(raw: unknown): ParticleCurve {
  if (!isRecord(raw)) {
    return {
      from: null,
      to: null,
      ease: "linear",
    };
  }
  return {
    from: parseCurveTerm(raw.from),
    to: parseCurveTerm(raw.to),
    ease: parseEase(raw.ease),
  };
}

function parseTemplate(raw: unknown): ParticleTemplateDefinition | null {
  if (!isRecord(raw)) {
    return null;
  }
  const spriteIndex = toInt(raw.sprite, -1);
  if (spriteIndex < 0) {
    return null;
  }
  const duration = Math.max(1e-6, toFiniteNumber(raw.duration, 1));
  return {
    spriteIndex,
    color: parseColor(raw.color),
    start: toFiniteNumber(raw.start, 0),
    duration,
    x: parseCurve(raw.x),
    y: parseCurve(raw.y),
    w: parseCurve(raw.w),
    h: parseCurve(raw.h),
    r: parseCurve(raw.r),
    a: parseCurve(raw.a),
  };
}

function parseGroup(raw: unknown): ParticleGroupDefinition | null {
  if (!isRecord(raw)) {
    return null;
  }
  const particlesRaw = Array.isArray(raw.particles) ? raw.particles : [];
  const particles: ParticleTemplateDefinition[] = [];
  for (const item of particlesRaw) {
    const parsed = parseTemplate(item);
    if (parsed) {
      particles.push(parsed);
    }
  }
  if (particles.length <= 0) {
    return null;
  }
  return {
    count: Math.max(1, toInt(raw.count, 1)),
    particles,
  };
}

function parseEffect(raw: unknown): ParticleEffectDefinition | null {
  if (!isRecord(raw) || typeof raw.name !== "string" || raw.name.trim().length <= 0) {
    return null;
  }
  const groupsRaw = Array.isArray(raw.groups) ? raw.groups : [];
  const groups: ParticleGroupDefinition[] = [];
  let maxLife = 0;
  for (const item of groupsRaw) {
    const parsed = parseGroup(item);
    if (!parsed) {
      continue;
    }
    groups.push(parsed);
    for (const particle of parsed.particles) {
      const end = particle.start + particle.duration;
      if (Number.isFinite(end) && end > maxLife) {
        maxLife = end;
      }
    }
  }
  if (groups.length <= 0) {
    return null;
  }
  return {
    name: raw.name,
    transform: parseTransform(raw.transform),
    groups,
    maxLife: Math.max(1, maxLife),
  };
}

function parseSlotMap(raw: unknown): Record<string, string> {
  if (!isRecord(raw)) {
    return {};
  }
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string" && value.length > 0) {
      output[key] = value;
    }
  }
  return output;
}

function parseRequiredEffects(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const output: string[] = [];
  for (const item of raw) {
    if (typeof item === "string" && item.length > 0) {
      output.push(item);
    }
  }
  return output;
}

export function buildParticleEffectPack(manifestRaw: unknown, atlasTexture: Texture): ParticleEffectPack | null {
  if (!isRecord(manifestRaw)) {
    return null;
  }
  const atlasRaw = isRecord(manifestRaw.atlas) ? manifestRaw.atlas : null;
  const engineRaw = isRecord(manifestRaw.engine) ? manifestRaw.engine : null;
  if (!atlasRaw || !engineRaw) {
    return null;
  }

  const spriteTextures = new Map<number, Texture>();
  const spritesRaw = Array.isArray(atlasRaw.sprites) ? atlasRaw.sprites : [];
  for (const item of spritesRaw) {
    if (!isRecord(item)) {
      continue;
    }
    const index = toInt(item.index, -1);
    const x = toInt(item.x, 0);
    const y = toInt(item.y, 0);
    const w = toInt(item.w, 0);
    const h = toInt(item.h, 0);
    if (index < 0 || w <= 0 || h <= 0) {
      continue;
    }
    const frame = new Rectangle(x, y, w, h);
    const texture = new Texture({
      source: atlasTexture.source,
      frame,
    });
    spriteTextures.set(index, texture);
  }
  if (spriteTextures.size <= 0) {
    return null;
  }

  const effectsByName = new Map<string, ParticleEffectDefinition>();
  const effectsRaw = Array.isArray(manifestRaw.effects) ? manifestRaw.effects : [];
  for (const item of effectsRaw) {
    const effect = parseEffect(item);
    if (effect) {
      effectsByName.set(effect.name, effect);
    }
  }

  const slotToEffectName = parseSlotMap(engineRaw.slotToEffectName);
  const requiredEffectNames = parseRequiredEffects(engineRaw.requiredEngineEffects);

  return {
    slotToEffectName,
    requiredEffectNames,
    effectsByName,
    spriteTextures,
    destroy: () => {
      for (const texture of spriteTextures.values()) {
        texture.destroy(false);
      }
      spriteTextures.clear();
      effectsByName.clear();
    },
  };
}
