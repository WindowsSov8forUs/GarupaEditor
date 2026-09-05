export interface ScoreHighRankAnimationBinding {
  readonly node: string;
  readonly property: "localPosition" | "localScale" | "localEulerAngles" | "active" | "TweenAlpha.to";
  readonly streamedStartIndex: number | null;
}

export interface ScoreHighRankAnimationClipInput {
  readonly name: "ScoreGaugeSS" | "ScoreGaugeSSS";
  readonly durationSeconds: 3;
  readonly curveCount: number;
  readonly bindings: readonly ScoreHighRankAnimationBinding[];
  readonly frames: readonly {
    readonly time: number;
    readonly keys: readonly {
      readonly index: number;
      readonly coefficients: readonly [number, number, number, number];
    }[];
  }[];
}

export interface ScoreHighRankNodeInput {
  readonly name: string;
  readonly initialPosition: readonly [number, number, number];
  readonly initialRotation: readonly [number, number, number, number];
  readonly initialScale: readonly [number, number, number];
}

export interface ScoreHighRankTweenInput {
  readonly node: string;
  readonly durationSeconds: number;
  readonly fromAlpha: number;
  readonly toAlpha: number;
}

export interface ScoreHighRankNodeSample {
  readonly name: string;
  readonly position: readonly [number, number, number];
  readonly scale: readonly [number, number, number];
  readonly rotationRadiansScreen: number;
  readonly active: boolean;
  readonly tweenAlpha: number | null;
}

export function sampleScoreHighRankPresentation(
  clip: ScoreHighRankAnimationClipInput,
  nodes: readonly ScoreHighRankNodeInput[],
  tweens: readonly ScoreHighRankTweenInput[],
  elapsedSeconds: number,
): readonly ScoreHighRankNodeSample[] {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) {
    throw new Error("Score high-rank animation requires finite non-negative engine time.");
  }
  const values = sampleStreamedClip(clip, elapsedSeconds);
  return Object.freeze(nodes.map((node) => {
    const position = vectorBinding(clip, values, node.name, "localPosition") ?? node.initialPosition;
    const scale = vectorBinding(clip, values, node.name, "localScale") ?? node.initialScale;
    const euler = vectorBinding(clip, values, node.name, "localEulerAngles");
    const active = scalarBinding(clip, values, node.name, "active");
    const tween = tweens.find((candidate) => candidate.node === node.name);
    const tweenTo = clip.name === "ScoreGaugeSSS" && node.name === "Flash"
      ? Math.fround(0.5)
      : tween?.toAlpha;
    return Object.freeze({
      name: node.name,
      position: Object.freeze([...position]) as readonly [number, number, number],
      scale: Object.freeze([...scale]) as readonly [number, number, number],
      rotationRadiansScreen: euler === null
        ? reflectedQuaternionZRadians(node.initialRotation)
        : Math.fround(-euler[2] * Math.PI / 180),
      active: active === null || active >= 0.5,
      tweenAlpha: tween === undefined || tweenTo === undefined
        ? null
        : sampleLinearPingPong(tween.fromAlpha, tweenTo, tween.durationSeconds, elapsedSeconds),
    });
  }));
}

export function sampleStreamedClip(
  profile: ScoreHighRankAnimationClipInput,
  elapsedSeconds: number,
): readonly number[] {
  const phase = Math.fround(elapsedSeconds % profile.durationSeconds);
  const times = new Float32Array(profile.curveCount);
  const coefficients: Array<readonly [number, number, number, number] | null> =
    Array.from({ length: profile.curveCount }, () => null);
  for (const frame of profile.frames) {
    if (frame.time > phase) break;
    for (const key of frame.keys) {
      times[key.index] = frame.time;
      coefficients[key.index] = key.coefficients;
    }
  }
  return Object.freeze(coefficients.map((curve, index) => {
    if (curve === null) throw new Error("Score high-rank streamed curve has no current key.");
    const delta = Math.fround(phase - times[index]!);
    let value = Math.fround(Math.fround(curve[0] * delta) + curve[1]);
    value = Math.fround(Math.fround(value * delta) + curve[2]);
    return Math.fround(Math.fround(value * delta) + curve[3]);
  }));
}

export function reflectedQuaternionZRadians(
  quaternion: readonly [number, number, number, number],
): number {
  return Math.fround(-Math.atan2(
    2 * (quaternion[3] * quaternion[2] + quaternion[0] * quaternion[1]),
    1 - 2 * (quaternion[1] * quaternion[1] + quaternion[2] * quaternion[2]),
  ));
}

function vectorBinding(
  clip: ScoreHighRankAnimationClipInput,
  values: readonly number[],
  node: string,
  property: "localPosition" | "localScale" | "localEulerAngles",
): readonly [number, number, number] | null {
  const binding = clip.bindings.find((candidate) => candidate.node === node && candidate.property === property);
  if (binding?.streamedStartIndex === null || binding === undefined) return null;
  const start = binding.streamedStartIndex;
  return Object.freeze([values[start]!, values[start + 1]!, values[start + 2]!] as const);
}

function scalarBinding(
  clip: ScoreHighRankAnimationClipInput,
  values: readonly number[],
  node: string,
  property: "active",
): number | null {
  const binding = clip.bindings.find((candidate) => candidate.node === node && candidate.property === property);
  return binding?.streamedStartIndex === null || binding === undefined ? null : values[binding.streamedStartIndex]!;
}

function sampleLinearPingPong(from: number, to: number, duration: number, elapsedSeconds: number): number {
  const period = Math.fround(duration * 2);
  const phase = Math.fround(elapsedSeconds % period);
  const factor = phase <= duration
    ? Math.fround(phase / duration)
    : Math.fround((period - phase) / duration);
  return Math.fround(from + Math.fround(Math.fround(to - from) * factor));
}
