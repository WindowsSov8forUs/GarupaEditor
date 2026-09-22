import behavior from "../data/originalSkinPreviewBehavior.json";
import { useEffect, useRef, useState } from "react";
import { autoDetectRenderer, Container, Mesh, MeshGeometry, Sprite, Texture } from "pixi.js";
import { createOriginalPreviewParticleScene, type OriginalPreviewParticlePack,
  type OriginalPreviewParticleScene } from "../simulator/public/previewParticles";
import { useApplicationResourceUrl } from "../resources/applicationResourceContext";
import { originalPreviewConnectionMesh, sampleOriginalPreviewFlickAnimation, type OriginalPreviewFlickDirection,
  createOriginalPreviewFieldFilter, installOriginalPreviewLinearOutput, configureOriginalPreviewTexture } from "../simulator/public/preview";
import { OriginalPrefabModel, ORIGINAL_PREFABS } from "./originalPrefabModel";
import { OriginalSkinPreviewMotion } from "./originalSkinPreviewMotion";
import type { OriginalAnimatedSkinResources } from "./useOriginalAnimatedSkinResources";
import type { OriginalSkinPreviewResources } from "./useOriginalSkinPreviewResources";

const source = new OriginalPrefabModel(ORIGINAL_PREFABS.skinpreview!);
const field = source.rect(source.components.get(49)!);
const background = source.components.get(54)!;
const backgroundTransform = source.transform(background.node);
const judgeTransform = source.transform(source.components.get(46)!.node);
const launcherY = source.nodes.get(15)!.position.y, targetY = source.nodes.get(17)!.position.y;
const frontCamera = source.components.get(41)!.data;
const halfHeight = Number(frontCamera["orthographic size"]);
const frontScale = source.nodes.get(18)!.scale.x;
// UIRoot.activeHeight and UIWidget's aspect correction use nearest-even rounding.
function roundDimension(value: number): number {
  const lower = Math.floor(value);
  return value - lower === 0.5 ? lower + (lower % 2) : Math.round(value);
}
async function decode(url: string): Promise<HTMLImageElement> {
  const image = new Image(); image.src = url; await image.decode(); return image;
}

/** Original preview keeps its cameras/resources alive while skins and tabs change. */
export function OriginalSkinPreview({ resources, animated, effects, speed, noteSize, lineBrightness, visible = true, onError }: {
  resources: OriginalSkinPreviewResources; animated: OriginalAnimatedSkinResources | null;
  effects: OriginalPreviewParticlePack | null;
  speed: number; noteSize: number; lineBrightness: number; visible?: boolean; onError?: (message: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null), failure = useRef(onError); failure.current = onError;
  const [prepared, setPrepared] = useState(false);
  const parameters = useRef({ speed, noteSize, lineBrightness }); parameters.current = { speed, noteSize, lineBrightness };
  const inputs = useRef({ resources, animated, effects, noteSize }); inputs.current = { resources, animated, effects, noteSize };
  const shown = useRef(visible); shown.current = visible;
  const motion = useRef<OriginalSkinPreviewMotion | null>(null);
  const controller = useRef<{ update(): void; show(): void } | null>(null);
  const backgroundUrl = useApplicationResourceUrl("ui.skin-preview-background");
  useEffect(() => {
    const target = host.current; if (!target) return;
    setPrepared(false);
    let active = true, frame = 0, generation = 0;
    let lastTime: number | null = null;
    let renderer: Awaited<ReturnType<typeof autoDetectRenderer>> | null = null;
    let particles: OriginalPreviewParticleScene | null = null;
    let effectCache: { pack: OriginalPreviewParticlePack; size: number; lastTime: number | null } | null = null;
    let currentResources: OriginalSkinPreviewResources | null = null;
    let currentAnimated: OriginalAnimatedSkinResources | null = null;
    const canvas = document.createElement("canvas"), stage = new Container(), root = new Container();
    // Filter areas use container-local coordinates. Keep the viewport-sized
    // output outside the centered/scaled source-camera coordinate system.
    stage.addChild(root);
    const output = installOriginalPreviewLinearOutput(stage, 1, 1);
    const backgroundFilter = createOriginalPreviewFieldFilter(), laneFilter = createOriginalPreviewFieldFilter();
    const foreground = new Container({ sortableChildren: true });
    const textures = new Map<string, Texture>(), notesById = new Map<number, Sprite>(), iconsById = new Map<number, Sprite>();
    const initial = originalPreviewConnectionMesh({ x: 0, y: launcherY, halfWidth: 0 },
      { x: 0, y: launcherY, halfWidth: 0 }, parameters.current.lineBrightness);
    const geometry = new MeshGeometry({ positions: initial.positions, uvs: initial.uvs, indices: initial.indices });
    const backdrop = new Sprite(Texture.EMPTY), lane = new Sprite(Texture.EMPTY), judge = new Sprite(Texture.EMPTY);
    // BackCamera clears an opaque black RGB target before either foreground pass.
    const clear = new Sprite(Texture.WHITE); clear.tint = 0;
    backdrop.filters = [backgroundFilter]; lane.filters = [laneFilter];
    const connection = new Mesh({ geometry, texture: Texture.EMPTY });
    lane.position.set(field.x, field.y); lane.width = field.width; lane.height = field.height;
    judge.zIndex = source.components.get(46)!.data.m_SortingOrder;
    connection.visible = false; connection.zIndex = behavior.rendering.connectionSortingOrder;
    foreground.addChild(judge, connection); root.addChild(clear, backdrop, lane, foreground);
    const resetClock = () => { lastTime = null; if (effectCache) effectCache.lastTime = null; };
    document.addEventListener("visibilitychange", resetClock);
    const restartNotes = () => {
      particles?.restartNotes();
      motion.current = new OriginalSkinPreviewMotion(parameters.current.speed, parameters.current.noteSize,
        launcherY, targetY, type => particles?.impact(type));
      resetClock();
    };
    const prepare = async () => {
      const revision = ++generation;
      const next = inputs.current;
      if (!renderer || !next.animated || !next.resources.lane || !next.resources.judge) return;
      if (currentResources?.lane === next.resources.lane && currentResources.judge === next.resources.judge && currentResources.background === next.resources.background &&
        currentAnimated === next.animated && (effectCache?.pack ?? null) === next.effects &&
        (!effectCache || effectCache.size === next.noteSize)) return;
      const urls = new Set([next.resources.background ?? backgroundUrl, next.resources.lane, next.resources.judge.url, next.animated.longNoteLine,
        ...Object.values(next.animated.bodies).map(sprite => sprite.url), ...Object.values(next.animated.flickTops).map(sprite => sprite.url)]);
      const created = new Map<string, Texture>();
      let replacement: OriginalPreviewParticleScene | null = null;
      try {
        const decoded = await Promise.allSettled([...urls].filter(url => !textures.has(url)).map(async url => [url, await decode(url)] as const));
        if (!active || revision !== generation) return;
        const failed = decoded.find(item => item.status === "rejected");
        if (failed?.status === "rejected") throw failed.reason;
        for (const item of decoded) {
          const [url, image] = (item as PromiseFulfilledResult<readonly [string, HTMLImageElement]>).value;
          const texture = Texture.from(image, true);
          configureOriginalPreviewTexture(texture, 1, 1);
          created.set(url, texture);
        }
        if (next.effects && (effectCache?.pack !== next.effects || effectCache.size !== next.noteSize))
          replacement = await createOriginalPreviewParticleScene(next.effects, next.noteSize);
        if (!active || revision !== generation) return;
        // Commit only fully prepared replacements. The camera, canvas and unaffected
        // scene objects stay alive; pending/failed selection never clears the frame.
        created.forEach((texture, url) => textures.set(url, texture)); created.clear();
        if (replacement) {
          if (particles) { replacement.retainUnchangedEffects(particles); particles.dispose(); }
          particles = replacement; replacement = null; particles.attachTo(foreground);
          effectCache = { pack: next.effects!, size: next.noteSize, lastTime: effectCache?.lastTime ?? null };
        }
        if (!next.effects) { particles?.dispose(); particles = null; effectCache = null; }
        currentResources = next.resources; currentAnimated = next.animated;
        backdrop.texture = textures.get(next.resources.background ?? backgroundUrl)!;
        lane.texture = textures.get(next.resources.lane)!; lane.width = field.width; lane.height = field.height;
        const image = next.resources.judge;
        judge.texture = textures.get(image.url)!; judge.anchor.set(image.pivotX, 1 - image.pivotY);
        judge.position.set(judgeTransform.x / halfHeight, -judgeTransform.y / halfHeight);
        judge.width = image.width * judgeTransform.scaleX / (image.pixelsPerUnit * halfHeight);
        judge.height = image.height * judgeTransform.scaleY / (image.pixelsPerUnit * halfHeight);
        connection.texture = textures.get(next.animated.longNoteLine)!;
        for (const sprite of [...notesById.values(), ...iconsById.values()]) { sprite.removeFromParent(); sprite.destroy(); }
        notesById.clear(); iconsById.clear();
        for (const [url, texture] of textures) if (!urls.has(url)) { texture.destroy(true); textures.delete(url); }
        restartNotes();
        target.dataset.previewEffectPack = next.effects?.profile.packIdentity ?? "unavailable";
        setPrepared(true);
      } catch (error) {
        if (active && revision === generation) failure.current?.(error instanceof Error ? error.message : String(error));
      } finally {
        created.forEach(texture => texture.destroy(true)); replacement?.dispose();
      }
    };
    const paint = (timestamp: number) => {
      if (!active || !shown.current) { frame = 0; resetClock(); return; }
        const resources = currentResources, animated = currentAnimated;
        const box = target.getBoundingClientRect(), ratio = window.devicePixelRatio;
        if (box.width <= 0 || box.height <= 0) { lastTime = null; frame = requestAnimationFrame(tick); return; }
        if (renderer!.width !== Math.round(box.width * ratio) || renderer!.height !== Math.round(box.height * ratio))
          renderer!.resize(box.width, box.height, ratio);
        // The authored dialog already scales its ancestors; CSS must not apply that scale twice.
        canvas.style.width = "100%"; canvas.style.height = "100%";
        // SkinPreview renders beneath the width-fitted UI Root, then fits that texture into
        // min(aspect, 2). FrontCamera's authored scale participates before projection.
        const aspect = window.innerWidth / window.innerHeight;
        const height = roundDimension(behavior.rendering.uiRootWidth / aspect), width = height * aspect;
        const projection = frontScale / halfHeight;
        root.position.set(box.width / 2, box.height / 2);
        root.scale.set(box.width / width, box.height / height);
        output.update(box.width, box.height);
        clear.position.set(-width / 2, -height / 2); clear.width = width; clear.height = height;
        const bgWidth = Math.round(width), bgHeight = roundDimension(bgWidth / background.data.aspectRatio);
        const bw = bgWidth * backgroundTransform.scaleX, bh = bgHeight * backgroundTransform.scaleY;
        // SkinPreview.Init gives both Y anchors the signed, Y-up offset. Invert
        // that offset only when positioning the final Y-down background sprite.
        const backgroundOffsetY = Math.trunc(-aspect * behavior.rendering.backgroundOffsetBase / behavior.rendering.backgroundAspectBase);
        backdrop.position.set(-bw / 2, -backgroundOffsetY - bh / 2);
        backdrop.width = bw; backdrop.height = bh;
        if (animated && resources?.lane && resources.judge) {
          const delta = lastTime === null || document.hidden ? 0 : (timestamp - lastTime) / 1000;
          motion.current!.setParameters(parameters.current.speed, parameters.current.noteSize);
          const notes = motion.current!.step(delta), currentIds = new Set(notes.map(note => note.id));
          const head = notes.find(note => note.type === 3), tail = notes.find(note => note.type === 5);
          connection!.visible = head !== undefined;
          if (head) {
            const mesh = originalPreviewConnectionMesh({ x: 0, y: head.y, halfWidth: head.scale },
              { x: 0, y: tail?.y ?? launcherY, halfWidth: tail?.scale ?? 0 }, parameters.current.lineBrightness);
            geometry!.positions = mesh.positions;
            connection!.scale.set(projection); connection!.alpha = mesh.alpha;
          }
          for (const [id, sprite] of notesById) if (!currentIds.has(id)) {
            sprite.removeFromParent(); sprite.destroy(); notesById.delete(id);
            const icon = iconsById.get(id);
            if (icon) { icon.removeFromParent(); icon.destroy(); iconsById.delete(id); }
          }
          for (const note of notes) {
            const image = animated.bodies[note.type];
            let sprite = notesById.get(note.id);
            if (!sprite) { sprite = new Sprite(textures.get(image.url)!); notesById.set(note.id, sprite); sprite.zIndex = behavior.rendering.noteSortingOrder; foreground.addChild(sprite); }
            sprite.anchor.set(image.pivotX, 1 - image.pivotY);
            sprite.position.set(0, -note.y * projection);
            sprite.width = image.width * note.scale * projection / image.pixelsPerUnit;
            sprite.height = image.height * note.scale * projection / image.pixelsPerUnit;
            const direction: OriginalPreviewFlickDirection | null = note.type === 2 ? "up"
              : note.type === 6 ? "right" : note.type === 7 ? "left" : null;
            if (direction !== null) {
              const image = animated.flickTops[direction];
              let icon = iconsById.get(note.id);
              if (!icon) {
                icon = new Sprite(textures.get(image.url)!);
                iconsById.set(note.id, icon); icon.zIndex = behavior.rendering.noteSortingOrder; foreground.addChild(icon);
              }
              const sample = sampleOriginalPreviewFlickAnimation(animated.flickAnimations,
                direction, note.animationElapsed);
              const scale = note.scale * projection;
              icon.anchor.set(image.pivotX, 1 - image.pivotY);
              icon.position.set(sample.x * scale, -note.y * projection - sample.y * scale);
              icon.width = image.width * scale / image.pixelsPerUnit;
              icon.height = image.height * scale / image.pixelsPerUnit;
              icon.rotation = -sample.rotationDegrees * Math.PI / 180;
            }
          }
          if (particles && effectCache) {
            const cached = effectCache;
            const effectDelta = cached.lastTime === null || document.hidden ? 0 : (timestamp - cached.lastTime) / 1000;
            // Geometry remains in front-camera child units. Camera clipping distances are
            // world units, so undo UI Root's 2/activeHeight and the authored Z scale.
            const depthScale = 2 / height * source.nodes.get(18)!.scale.z;
            particles.advance(effectDelta, width, height, projection,
              Number(frontCamera["near clip plane"]) / depthScale,
              Number(frontCamera["far clip plane"]) / depthScale);
            cached.lastTime = document.hidden ? null : timestamp;
            target.dataset.previewParticleCount = String(particles.sampleCount);
            target.dataset.previewParticleRoots = particles.visibleRoots.join(",");
            target.dataset.previewImpactCounts = JSON.stringify(particles.impactCounts);
          } else {
            target.dataset.previewParticleCount = "0";
            target.dataset.previewParticleRoots = "";
            target.dataset.previewImpactCounts = "{}";
          }
          foreground.sortChildren();
          target.dataset.previewNoteTypes = notes.map(note => note.type).join(",");
          target.dataset.previewConnection = head ? "visible" : "hidden";
          target.dataset.previewFlickIcons = String(iconsById.size);
          target.dataset.previewLineAlpha = String(parameters.current.lineBrightness / 100);
        }
        renderer!.render({ container: stage });
        lastTime = document.hidden ? null : timestamp;
        frame = requestAnimationFrame(tick);
      };
    const tick = (timestamp: number) => {
      try { paint(timestamp); }
      catch (error) {
        frame = 0;
        failure.current?.(error instanceof Error ? error.message : String(error));
      }
    };
    const show = () => {
      if (!active || !renderer) return;
      cancelAnimationFrame(frame); frame = 0; resetClock();
      if (shown.current) { if (currentAnimated) restartNotes(); frame = requestAnimationFrame(tick); }
    };
    void (async () => {
      const created = await autoDetectRenderer({ canvas, width: 1, height: 1, preference: "webgl", antialias: true,
        backgroundColor: 0x000000, resolution: window.devicePixelRatio, autoDensity: true });
      if (!active) { created.destroy({ removeView: false }); return; }
      renderer = created;
      canvas.style.display = "block"; target.appendChild(canvas);
      controller.current = { update: () => { void prepare(); }, show };
      await prepare(); show();
    })().catch(error => { if (active) failure.current?.(error instanceof Error ? error.message : String(error)); });
    return () => {
      active = false; generation++; controller.current = null;
      cancelAnimationFrame(frame); document.removeEventListener("visibilitychange", resetClock);
      particles?.dispose(); geometry.destroy();
      output.dispose(); backgroundFilter.destroy(); laneFilter.destroy();
      stage.destroy({ children: true, texture: false, textureSource: false });
      textures.forEach(texture => texture.destroy(true)); renderer?.destroy({ removeView: false }); canvas.remove();
    };
  }, [backgroundUrl]);
  useEffect(() => { controller.current?.update(); }, [resources.lane, resources.judge, resources.background, animated, effects, noteSize]);
  useEffect(() => { controller.current?.show(); }, [visible]);
  return <div ref={host} className="original-prefab-texture" data-original-preview="source-note-motion" aria-busy={!prepared} />;
}
