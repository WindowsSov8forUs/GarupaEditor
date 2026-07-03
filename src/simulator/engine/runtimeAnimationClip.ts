import runtimeUiBindingReport from "../assets/ui/runtime-ui-binding-report.json";

interface RuntimeAnimationCurve {
  index: number;
  value: number;
  coefficients: readonly number[];
}

interface RuntimeAnimationFrame {
  time: number;
  curves: readonly RuntimeAnimationCurve[];
}

interface RuntimeAnimationClip {
  name: string;
  stop_time: number;
  streamed_frames: readonly RuntimeAnimationFrame[];
}

interface RuntimeUiBindingReport {
  animation_clips?: Record<string, RuntimeAnimationClip>;
}

const animationClipsByName = new Map<string, RuntimeAnimationClip>();

for (const clip of Object.values((runtimeUiBindingReport as RuntimeUiBindingReport).animation_clips ?? {})) {
  animationClipsByName.set(clip.name, clip);
}

function findCurve(frame: RuntimeAnimationFrame, curveIndex: number): RuntimeAnimationCurve | null {
  return frame.curves.find((curve) => curve.index === curveIndex) ?? null;
}

function evaluateCurveSegment(curve: RuntimeAnimationCurve, deltaSeconds: number): number {
  // Source: AnimationClip m_StreamedClip data in runtime-ui-binding-report.json.
  // Coefficients are evaluated from the frame start time: a*t^3 + b*t^2 + c*t + d.
  const [a = 0, b = 0, c = 0, d = curve.value] = curve.coefficients;
  return (((a * deltaSeconds) + b) * deltaSeconds + c) * deltaSeconds + d;
}

export function getRuntimeAnimationClipDurationMs(name: string, fallbackMs: number): number {
  const clip = animationClipsByName.get(name);
  if (!clip || !Number.isFinite(clip.stop_time)) {
    return fallbackMs;
  }
  return Math.max(0, clip.stop_time * 1000);
}

export function evaluateRuntimeAnimationCurve(
  name: string,
  curveIndex: number,
  ageMs: number,
  fallback: number,
): number {
  const clip = animationClipsByName.get(name);
  if (!clip || !(ageMs >= 0)) {
    return fallback;
  }

  const frames = clip.streamed_frames;
  if (frames.length <= 0) {
    return fallback;
  }

  const timeSeconds = Math.min(Math.max(0, ageMs / 1000), clip.stop_time);
  let frame = frames[0];
  for (let index = 1; index < frames.length; index += 1) {
    if (frames[index].time > timeSeconds) {
      break;
    }
    frame = frames[index];
  }

  const curve = findCurve(frame, curveIndex);
  if (!curve) {
    return fallback;
  }
  return evaluateCurveSegment(curve, Math.max(0, timeSeconds - frame.time));
}
