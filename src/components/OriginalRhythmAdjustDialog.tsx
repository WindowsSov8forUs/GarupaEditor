import { useEffect, useRef, useState } from "react";
import { autoDetectRenderer, Container } from "pixi.js";
import profile from "../data/originalRhythmAdjust.json";
import { useApplicationResourceManager } from "../resources/applicationResourceContext";
import { simulatorBuiltinResourceRef } from "../resources/builtin/simulatorBuiltinResourceCatalog";
import type { ResourceRef } from "../resources/contracts";
import { ApplicationSimulatorResourceCapability } from "../app/simulator/ApplicationSimulatorResourceCapability";
import { prepareRhythmAdjustParticles, createRhythmAdjustParticles, sampleRhythmAdjustResultAnimation } from "../simulator/public/rhythmAdjust";
import type { OriginalPreviewParticlePack, OriginalPreviewParticleLease, OriginalPreviewParticleScene } from "../simulator/public/previewParticles";
import { OriginalAuthoredDialog, useOriginalUiScale } from "./OriginalAuthoredDialog";
import { OriginalPrefabModel, ORIGINAL_PREFABS, originalRef, type OriginalData } from "./originalPrefabModel";
import type { OriginalSettingsDraft } from "./originalSettingsPage";
import { useOriginalSkinSound } from "./useOriginalSkinSound";
import { OriginalRhythmAdjust, rhythmAdjustRound } from "./originalRhythmAdjust";
import { SerializedDialogMotion } from "./SerializedDialogMotion";

type Step = "ready" | "sampling" | "done";
const names = { ready: "rhythmadjustreadydialog", sampling: "rhythmadjustdialog", done: "rhythmadjustdonedialog" };
const models = Object.fromEntries(Object.entries(names).map(([step, name]) => {
  const source = new OriginalPrefabModel(ORIGINAL_PREFABS[name]!);
  const header = [...source.components.values()].find(c => c.kind === "DialogHeader")!.data;
  const frame = source.components.get(originalRef(header.baseSprite))!;
  const strip = source.components.get(originalRef(header.headerImageSprite))!;
  const label = source.components.get(originalRef(header.textLabel))!;
  const rule = profile.rendering.header, width = frame.data.mWidth - rule.widthInset;
  return [step, new OriginalPrefabModel(source.prefab, {
    components: { [strip.id]: { mWidth: width }, [label.id]: { mFontSize: rule.fontSize, mMaxLineCount: rule.maxLineCount } },
    nodes: { [strip.node]: { x: 0, y: frame.data.mHeight / 2 - rule.topCenterInset },
      [label.node]: { x: -width / 2 + rule.labelInset, y: rule.labelY } },
  })];
})) as Record<Step, OriginalPrefabModel>;
type Resources = { context: AudioContext; cues: AudioBuffer[]; particles: OriginalPreviewParticlePack };

/** LiveCoreSettingsJudgement -> Ready -> sampling -> Done, with original callback ownership. */
export function OriginalRhythmAdjustDialog({ draft, onDecide, onClose, onError }: {
  draft: OriginalSettingsDraft; onDecide(value: number): void; onClose(): void; onError(message: string): void;
}) {
  const manager = useApplicationResourceManager(), uiScale = useOriginalUiScale();
  const scaleAtRender = useRef(uiScale); scaleAtRender.current = uiScale;
  const [resources, setResources] = useState<Resources | null>(null);
  const [step, setStep] = useState<Step>("ready"), [run, setRun] = useState(0);
  const [value, setValue] = useState(0), [labels, setLabels] = useState(["", "", "", ""]);
  const [started, setStarted] = useState(false);
  const [closing, setClosing] = useState(false);
  const closeDialog = () => setClosing(true);
  const host = useRef<HTMLDivElement>(null), press = useRef<(() => void) | null>(null);
  const clock = useRef(new OriginalRhythmAdjust());
  const live = useRef({ draft, onError, onClose }); live.current = { draft, onError, onClose };
  const sound = useOriginalSkinSound(draft.options.simulatorSettings.skin.judgeSE,
    draft.options.noteSeVolumePercent * draft.options.simulatorSettings.masterVolumePercent / 10000,
    message => { live.current.onError(message); live.current.onClose(); }, "one-shot");
  const tapSound = useRef(sound.play); tapSound.current = sound.play;
  useEffect(() => {
    let active = true, settled = false, lease: OriginalPreviewParticleLease | null = null;
    const context = new AudioContext();
    const release = () => { const owner = lease; lease = null; if (owner) void owner.release(); };
    void (async () => {
      await context.resume();
      const paths = ["sound/rhythm-adjust", "portable/profiles/default-particle"];
      const refs: Record<string, ResourceRef> = {};
      for (const path of paths) {
        const ref = simulatorBuiltinResourceRef(path);
        if (ref.status !== "accepted") throw new Error(ref.failure.boundary);
        refs[path] = ref.value;
      }
      const acquired = await new ApplicationSimulatorResourceCapability(manager, refs).acquire(paths.map(path =>
        ({ semanticRole: path, logicalResource: path, requiredFiles: null })));
      if (acquired.status !== "accepted") throw new Error(acquired.failure.boundary);
      lease = acquired.value;
      if (!active) return;
      const cues: AudioBuffer[] = [];
      for (const name of ["short", "short2"]) {
        const bytes = await lease.readBytes(paths[0]!, name + ".wav");
        cues.push(await context.decodeAudioData(Uint8Array.from(bytes).buffer));
      }
      const particles = await prepareRhythmAdjustParticles(lease);
      if (active) setResources({ context, cues, particles });
    })().catch(error => { if (active) { live.current.onError(String(error)); live.current.onClose(); } })
      .finally(() => { settled = true; if (!active) release(); });
    return () => { active = false; if (settled) release(); void context.close(); };
  }, [manager]);

  const finish = () => { setValue(clock.current.result()); setStep("done"); };
  const finishRef = useRef(finish); finishRef.current = finish;
  const nextRun = () => { setLabels(["", "", "", ""]); setStarted(false); setStep("sampling"); setRun(old => old + 1); };
  useEffect(() => {
    if (!resources || !sound.ready || closing || step === "done" || !host.current) return;
    const target = host.current, source = models[step], camera = [...source.components.values()].find(c => c.kind === "Camera")!.data;
    const cameraNode = [...source.components.values()].find(c => c.kind === "Camera")!;
    const cameraPosition = source.nodes.get(cameraNode.node)!.position;
    const cameraSurface = target.closest<HTMLElement>("[data-original-camera-for]")!;
    const mask = document.getElementById(cameraSurface.dataset.originalCameraFor!)!;
    let active = true, frame = 0, renderer: Awaited<ReturnType<typeof autoDetectRenderer>> | null = null;
    let particles: OriginalPreviewParticleScene | null = null, audio: AudioBufferSourceNode | null = null;
    let gain: GainNode | null = null;
    const stage = new Container(), canvas = document.createElement("canvas");
    let previousParentScale = NaN;
    const paint = (delta: number) => {
      if (!renderer || !particles) return;
      const width = window.innerWidth, height = window.innerHeight;
      if (renderer.screen.width !== width || renderer.screen.height !== height) renderer.resize(width, height);
      stage.position.set(width / 2, height / 2);
      const motion = Number(getComputedStyle(mask).getPropertyValue("--original-dialog-scale"));
      const parentScale = 2 * scaleAtRender.current / height * motion;
      const cameraWorld = { x: cameraPosition.x * parentScale, y: cameraPosition.y * parentScale, z: cameraPosition.z * parentScale };
      if (parentScale !== previousParentScale) {
        particles.setParentTransform({ m_LocalPosition: cameraWorld,
          m_LocalRotation: { x: 0, y: 0, z: 0, w: 1 }, m_LocalScale: { x: parentScale, y: parentScale, z: parentScale } });
        previousParentScale = parentScale;
      }
      particles.advance(delta, width, height, height / (2 * Number(camera["orthographic size"])),
        Number(camera["near clip plane"]), Number(camera["far clip plane"]), cameraWorld);
      target.dataset.rhythmAdjustParticles = String(particles.sampleCount);
      renderer.render({ container: stage });
    };
    const currentClock = new OriginalRhythmAdjust(); clock.current = currentClock;
    const labelTimes = [-1, -1, -1, -1];
    const fail = (error: unknown) => { if (active) { live.current.onError(String(error)); live.current.onClose(); } };
    void (async () => {
      renderer = await autoDetectRenderer({ canvas, width: window.innerWidth, height: window.innerHeight, backgroundAlpha: 0, resolution: devicePixelRatio, autoDensity: true, preference: "webgl" });
      if (!active) { renderer.destroy(); renderer = null; return; }
      particles = await createRhythmAdjustParticles(resources.particles, step === "ready");
      if (!active) { particles.dispose(); renderer?.destroy(); particles = null; renderer = null; return; }
      particles.attachTo(stage); target.append(canvas);
      target.dataset.originalSurfaceReady = "true";
      gain = resources.context.createGain();
      gain.gain.value = live.current.draft.options.simulatorSettings.systemBgmVolumePercent * live.current.draft.options.simulatorSettings.masterVolumePercent / 10000;
      gain.connect(resources.context.destination);
      let last: number | null = null, elapsed = 0, musicStarted = false, preFinish: number | null = null;
      let readyProgress = 0;
      const hit = () => particles?.restartRoot("ordinary:effect_tap_perfect");
      press.current = () => { currentClock.press(); tapSound.current("tap"); hit(); };
      const startMusic = () => {
        audio = resources.context.createBufferSource(); audio.buffer = resources.cues[step === "ready" ? 0 : 1]!;
        audio.connect(gain!); audio.start(); musicStarted = true; setStarted(true);
      };
      const tick = (now: number) => {
        if (!active) return;
        try {
          const delta = last === null ? 0 : (now - last) / 1000; last = now; elapsed += delta;
          if (!musicStarted && elapsed >= (step === "ready" ? 0 : profile.clock.androidWaitSeconds)) {
            startMusic();
          } else if (musicStarted && preFinish === null) {
            if (step === "ready") {
              currentClock.elapsed += delta;
              const progress = Math.trunc(currentClock.elapsed * profile.clock.progressPerSecond);
              const bar = Math.trunc(progress / profile.clock.barDivision), within = progress % profile.clock.barDivision;
              if (bar <= 1 && profile.clock.sampleTargets.some(target => readyProgress < target && within >= target)) hit();
              readyProgress = within;
            } else {
              const before = currentClock.labels.join("|");
              const ended = currentClock.advance(delta);
              if (before !== currentClock.labels.join("|")) {
                setLabels([...currentClock.labels]);
                currentClock.samples.forEach((sample, i) => { if (sample !== null && labelTimes[i] < 0) labelTimes[i] = now; });
              }
              if (ended) preFinish = now;
            }
          }
          if (step === "sampling") {
            target.dataset.rhythmAdjustElapsed = String(currentClock.elapsed);
            target.dataset.rhythmAdjustSamples = JSON.stringify(currentClock.samples);
            const parent = mask;
            const ids = [110, 118, 131, 107];
            for (let i = 0; i < ids.length; i++) if (labelTimes[i]! >= 0) {
              const label = parent.querySelector<HTMLElement>(`[data-original-widget="${ids[i]}"]`);
              if (label) {
                const sample = sampleRhythmAdjustResultAnimation(profile.resultAnimation as unknown as Parameters<typeof sampleRhythmAdjustResultAnimation>[0], (now - labelTimes[i]!) / 1000);
                label.style.scale = `${sample[0]} ${sample[1]}`;
              }
            }
          }
          paint(delta);
          if (preFinish !== null && now - preFinish >= profile.clock.reverberationSeconds * 1000) {
            finishRef.current(); return;
          }
          frame = requestAnimationFrame(tick);
        } catch (error) { fail(error); }
      };
      frame = requestAnimationFrame(tick);
    })().catch(fail);
    return () => {
      active = false; cancelAnimationFrame(frame); press.current = null;
      audio?.stop(); audio?.disconnect(); gain?.disconnect();
      const dispose = () => { particles?.dispose(); renderer?.destroy(); particles = null; renderer = null; stage.destroy(); canvas.remove(); };
      // rAF timestamps describe the frame start and may precede cleanup's performance.now().
      // Keep both samples on the rAF clock; the first closing sample advances by zero.
      let previous: number | null = null;
      const end = performance.now() + SerializedDialogMotion.duration * 1000;
      const closeFrame = (now: number) => {
        if (!target.isConnected || now >= end || !particles || !renderer) { dispose(); return; }
        try { paint(previous === null ? 0 : (now - previous) / 1000); previous = now; requestAnimationFrame(closeFrame); }
        catch (error) { dispose(); live.current.onError(String(error)); }
      };
      requestAnimationFrame(closeFrame);
    };
  }, [resources, sound.ready, step, run, closing]);

  const activeStep = step;
  const renderStep = (view: Step) => {
    const current = view === activeStep;
    const step = view;
    const source = models[step], controller = [...source.components.values()].find(c => c.kind ===
      (step === "ready" ? "RhythmAdjustReadyDialog" : step === "sampling" ? "RhythmAdjustDialog" : "RhythmAdjustDoneDialog"))!;
    const components: Record<number, OriginalData> = {};
    const buttons: Record<number, { action: () => void; disabled?: boolean }> = {};
    if (step === "ready") {
      buttons[originalRef(controller.data.okButton)] = { action: nextRun, disabled: !started };
      buttons[originalRef(controller.data.cancelButton)] = { action: closeDialog };
    } else if (step === "sampling") {
      (controller.data.resultLabels as OriginalData[]).forEach((ref, i) => { components[originalRef(ref)] = { mText: labels[i] }; });
    } else {
      buttons[originalRef(controller.data.okButton)] = { action: () => { onDecide(value); closeDialog(); } };
      buttons[originalRef(controller.data.cancelButton)] = { action: nextRun };
      buttons[82] = { action: () => setValue(0) };
      components[originalRef(controller.data.label)] = { mText: String(value) };
    }
    const model = new OriginalPrefabModel(source.prefab, { ...source.overrides,
      components: { ...source.overrides.components, ...components } });
    const close = step === "sampling" ? () => {} : step === "done" ? nextRun : closeDialog;
    const tap = step === "sampling" ? source.componentAt(source.components.get(121)!.node, "BoxCollider2D")! : null;
    const tapRect = tap && source.rect(tap);
    return <OriginalAuthoredDialog key={step} open={current && resources !== null && sound.ready && !closing} model={model} onClose={close}
      onClosed={current && closing ? onClose : undefined}
      cameraOverlay={step !== "done" && <div ref={current ? host : undefined}
        data-original-surface-ready="false" data-rhythm-adjust={step}
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }} />}
      bindings={{ buttons, omit: new Set(step === "sampling" ? [113] : []),
        sliders: step === "done" ? { [originalRef(controller.data.slider)]: {
          value: (value + 30) / 60 * 100, label: source.text(source.components.get(60)!),
          onChange: percent => setValue(rhythmAdjustRound((percent / 100 - 0.5) * 60)),
        } } : undefined }}>
      {tapRect && <button type="button" className="original-button original-prefab-hit" data-rhythm-adjust-tap
        aria-label={source.text(source.components.get(originalRef(source.components.get(127)!.data.targetLabel))!)} style={{ position: "absolute", left: tapRect.x, top: tapRect.y,
          width: tapRect.width, height: tapRect.height, zIndex: 999, touchAction: "none" }}
        onPointerDown={event => { if (event.button === 0) { event.preventDefault(); press.current?.(); } }}
        onKeyDown={event => { if (!event.repeat && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); press.current?.(); } }} />}
    </OriginalAuthoredDialog>;
  };
  return <>{(["ready", "sampling", "done"] as const).map(renderStep)}</>;
}
