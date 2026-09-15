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
  readonly curve: { readonly keys: readonly ScoreHighRankTweenKey[] };
}

export interface ScoreHighRankTweenKey {
  readonly time: number;
  readonly value: number;
  readonly inSlope: number;
  readonly outSlope: number;
}

export interface ScoreHighRankPlayback {
  readonly clipName: ScoreHighRankAnimationClipInput["name"];
  readonly elapsedSeconds: number;
  readonly tweens: readonly {
    readonly node: string;
    readonly factor: number;
    readonly direction: 1 | -1;
    readonly active: boolean;
  }[];
}

export function startScoreHighRankPlayback(
  clip: ScoreHighRankAnimationClipInput,
  tweens: readonly ScoreHighRankTweenInput[],
  previous: ScoreHighRankPlayback | null,
): ScoreHighRankPlayback {
  const values = sampleStreamedClip(clip, 0);
  return Object.freeze({
    clipName: clip.name,
    elapsedSeconds: 0,
    tweens: Object.freeze(tweens.map((tween) => {
      const before = previous?.tweens.find((state) => state.node === tween.node);
      const active = scalarBinding(clip, values, tween.node, "active");
      return Object.freeze({
        node: tween.node,
        factor: before?.factor ?? 0,
        direction: before?.direction ?? 1,
        active: active === null || active >= 0.5,
      });
    })),
  });
}

export function advanceScoreHighRankPlayback(
  playback: ScoreHighRankPlayback,
  clip: ScoreHighRankAnimationClipInput,
  tweens: readonly ScoreHighRankTweenInput[],
  elapsedSeconds: number,
): ScoreHighRankPlayback {
  if (clip.name !== playback.clipName || !Number.isFinite(elapsedSeconds) || elapsedSeconds < playback.elapsedSeconds) {
    throw new Error("High-rank sampling requires a started clip and a non-decreasing engine clock.");
  }
  if (elapsedSeconds === playback.elapsedSeconds) return playback;
  const delta = elapsedSeconds - playback.elapsedSeconds;
  const values = sampleStreamedClip(clip, elapsedSeconds);
  return Object.freeze({
    clipName: clip.name,
    elapsedSeconds,
    tweens: Object.freeze(playback.tweens.map((before) => {
      const tween = tweens.find((input) => input.node === before.node)!;
      const enabled = scalarBinding(clip, values, before.node, "active");
      const active = enabled === null || enabled >= 0.5;
      let { factor, direction } = before;
      // An enabled TweenAlpha owns its phase independently of Animator.Play.
      // Its first update after activation samples the retained factor with zero delta.
      if (active && before.active) {
        factor += delta / tween.durationSeconds * direction;
        if (factor > 1) {
          factor = 1 + Math.floor(factor) - factor;
          direction = direction === 1 ? -1 : 1;
        } else if (factor < 0) {
          factor = -factor - Math.floor(-factor);
          direction = direction === 1 ? -1 : 1;
        }
      }
      return Object.freeze({ node: before.node, factor, direction, active });
    })),
  });
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
  playback: ScoreHighRankPlayback,
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
        : sampleScoreHighRankTween(tween, playback.tweens.find((state) => state.node === node.name)!.factor, tweenTo),
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

export function sampleScoreHighRankTween(tween: ScoreHighRankTweenInput, factor: number, toAlpha = tween.toAlpha): number {
  const phase = Math.min(1, Math.max(0, factor));
  const keys = tween.curve.keys;
  let value = keys[keys.length - 1]!.value;
  for (let index = 1; index < keys.length; index += 1) {
    const right = keys[index]!;
    if (phase > right.time) continue;
    const left = keys[index - 1]!;
    const span = right.time - left.time;
    const t = (phase - left.time) / span;
    const t2 = t * t, t3 = t2 * t;
    value = (2 * t3 - 3 * t2 + 1) * left.value + (t3 - 2 * t2 + t) * span * left.outSlope +
      (-2 * t3 + 3 * t2) * right.value + (t3 - t2) * span * right.inSlope;
    break;
  }
  return tween.fromAlpha + (toAlpha - tween.fromAlpha) * Math.min(1, Math.max(0, value));
}
