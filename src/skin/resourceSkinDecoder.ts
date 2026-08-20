import type { ResourceConsumerLease, ResourceSnapshotId } from "../resources/contracts";
import type { ApplicationResourceSlot } from "../resources/selections";
import {
  extractNamedSprites,
  extractNamedSpritesFromAsset,
  parseAssetJsonOrThrow,
  parseBundleJsonOrThrow,
  parseSpritesJsonOrThrow,
  type AssetManifest,
  type BundleManifest,
} from "../noteSkinAssetTool";
import type {
  AnyRhythmSkinAssets,
  BGSkin,
  DirectionalAssets,
  DirectionalSampleAssets,
  DirectionalSeSkinAssets,
  DirectionalSkinAssets,
  FieldSkinAssets,
  HabahiroNoteAssetKey,
  HabahiroRhythmAssets,
  HabahiroRhythmSkinAssets,
  JudgeSkin,
  JudgeSkinAssets,
  NoteAssets,
  RhythmAssets,
  RhythmSampleAssets,
  RhythmSeSkinAssets,
  SeSkinAssets,
  SkinAssets,
} from "../skinLoader";

const NOTE_LANES = ["0", "1", "2", "3", "4", "5", "6"] as const;
const HABAHIRO_KEYS: readonly HabahiroNoteAssetKey[] = [
  "0", "1", "2", "3", "4", "5", "6",
  "0_1", "1_2", "2_3", "3_4", "4_5", "5_6",
  "0_1_2", "1_2_3", "2_3_4", "3_4_5", "4_5_6",
  "0_1_2_3", "1_2_3_4", "2_3_4_5", "3_4_5_6",
  "0_1_2_3_4", "1_2_3_4_5", "2_3_4_5_6",
  "0_1_2_3_4_5", "1_2_3_4_5_6", "0_1_2_3_4_5_6",
];

export interface AppliedSkinResources {
  readonly snapshotId: ResourceSnapshotId;
  readonly identities: Readonly<{ rhythm: string; directional: string; judge: string }>;
  readonly note: SkinAssets<AnyRhythmSkinAssets>;
  readonly se: SeSkinAssets;
  readonly field: FieldSkinAssets;
  readonly background: BGSkin;
  readonly judge: JudgeSkin;
  dispose(): Promise<void>;
}

interface PackageView {
  readonly texts: ReadonlyMap<string, string>;
  readonly urls: ReadonlyMap<string, string>;
  readonly paths: readonly string[];
}

export async function decodeAppliedSkinResources(
  lease: ResourceConsumerLease,
  identities: {
    readonly rhythm: string;
    readonly directional: string;
    readonly judge: string;
  },
): Promise<AppliedSkinResources> {
  const derivedUrls = new Set<string>();
  const createImageUrl = async (canvas: HTMLCanvasElement): Promise<string> => {
    const blob = await canvasBlob(canvas);
    const url = URL.createObjectURL(blob);
    derivedUrls.add(url);
    return url;
  };
  try {
    const [rhythmPackage, directionalPackage, rhythmSePackage, directionalSePackage, fieldPackage, backgroundPackage, judgePackage, commonPackage] = await Promise.all([
      openPackage(lease, "skin.rhythm"),
      openPackage(lease, "skin.directional"),
      openPackage(lease, "skin.rhythm-se"),
      openPackage(lease, "skin.directional-se"),
      openPackage(lease, "skin.field"),
      openPackage(lease, "skin.background"),
      openPackage(lease, "skin.judge"),
      openPackage(lease, "skin.common-se"),
    ]);
    const [rhythm, directional, judge] = await Promise.all([
      decodeRhythm(rhythmPackage, identities.rhythm, createImageUrl),
      decodeDirectional(directionalPackage, identities.directional, createImageUrl),
      decodeJudge(judgePackage, identities.judge, createImageUrl),
    ]);
    const se: SeSkinAssets = Object.freeze({
      rhythm: decodeRhythmSe(rhythmSePackage),
      directional: decodeDirectionalSe(directionalSePackage),
      tapSkill: requireUrl(commonPackage, "SE_RHYTHM_TAP_SKILL.mp3"),
    });
    const applied: AppliedSkinResources = Object.freeze({
      snapshotId: lease.snapshotId,
      identities: Object.freeze({ ...identities }),
      note: Object.freeze({ rhythm, directional }),
      se,
      field: decodeField(fieldPackage),
      background: decodeBackground(backgroundPackage),
      judge,
      async dispose(): Promise<void> {
        for (const url of derivedUrls) URL.revokeObjectURL(url);
        derivedUrls.clear();
        await lease.release();
      },
    });
    return applied;
  } catch (error) {
    for (const url of derivedUrls) URL.revokeObjectURL(url);
    await lease.release();
    throw error;
  }
}

async function openPackage(
  lease: ResourceConsumerLease,
  slot: ApplicationResourceSlot,
): Promise<PackageView> {
  const files = lease.listFiles(slot);
  if (files.length === 0) throw new Error(`selected resource package is empty: ${slot}`);
  const texts = new Map<string, string>();
  const urls = new Map<string, string>();
  const paths: string[] = [];
  const basenames = new Set<string>();
  for (const file of files) {
    const key = basename(file.logicalPath).toLowerCase();
    if (basenames.has(key)) throw new Error(`resource package has ambiguous filename: ${key}`);
    basenames.add(key);
    paths.push(file.logicalPath);
    const bytes = await lease.readBytes(slot, file.logicalPath);
    if (file.mediaType === "application/json" || key === ".sprites" || key.endsWith(".bundle") || key.endsWith(".asset")) {
      texts.set(key, new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    }
    if (file.mediaType.startsWith("image/") || file.mediaType.startsWith("audio/")) {
      urls.set(key, await lease.openObjectUrl(slot, file.logicalPath));
    }
  }
  return Object.freeze({ texts, urls, paths: Object.freeze(paths) });
}

async function decodeRhythm(
  source: PackageView,
  identity: string,
  createImageUrl: (canvas: HTMLCanvasElement) => Promise<string>,
): Promise<AnyRhythmSkinAssets> {
  const sprites = parseSpritesJsonOrThrow(requireText(source, ".sprites"), `${identity} .sprites`);
  const bundleName = `ingameskin-noteskin-${identity}.bundle`;
  const sampleId = identity === "habahiro" ? "habahiro_sample" : `${identity}sample`;
  const sampleBundleName = `ingameskin-noteskin-${sampleId}.bundle`;
  const bundle = parseBundleJsonOrThrow(requireText(source, bundleName), `${identity} bundle`);
  const sampleBundle = parseBundleJsonOrThrow(requireText(source, sampleBundleName), `${identity} sample bundle`);
  const named = await extractNamedSprites({
    filePathByName: Object.fromEntries(source.urls),
    sprites,
    bundle,
    createImageUrl,
  });
  const sample: RhythmSampleAssets = Object.freeze({
    NoteNormal3: requireUrl(source, "note_normal_3.png"),
    NoteSkill3: requireUrl(source, "note_skill_3.png"),
    NoteFlick3: requireUrl(source, "note_flick_3.png"),
    NoteFlickTop: requireUrl(source, "note_flick_top.png"),
    NoteLong3: requireUrl(source, "note_long_3.png"),
    NoteSlideAmong: requireUrl(source, "note_slide_among.png"),
  });
  const lines = {
    longNoteLine: requireUrl(source, "longNoteLine.png"),
    longNoteLine2: requireUrl(source, "longNoteLine2.png"),
    simultaneousLine: requireUrl(source, "simultaneous_line.png"),
  };
  if (identity === "habahiro") {
    const assets: HabahiroRhythmAssets = Object.freeze({
      noteNormal: habahiroByPrefix(named, "note_normal", identity),
      noteNormal16: habahiroByPrefix(named, "note_normal_16", identity),
      noteSkill: habahiroByPrefix(named, "note_skill", identity),
      noteFlick: habahiroByPrefix(named, "note_flick", identity),
      noteFlickTop: Object.freeze({
        "1": requireSprite(named, "note_flick_top", identity),
        "2": requireSprite(named, "note_flick_top_2", identity),
        "3": requireSprite(named, "note_flick_top_3", identity),
      }),
      noteLong: habahiroByPrefix(named, "note_long", identity),
      noteLongFlash: habahiroByPrefix(named, "note_long_flash", identity),
      noteSlideAmong: Object.freeze(Object.fromEntries(
        [1, 2, 3, 4, 5, 6, 7].map((width) => [String(width), requireSprite(
          named,
          width === 1 ? "note_slide_among" : `note_slide_among_${width}`,
          identity,
        )]),
      )) as HabahiroRhythmAssets["noteSlideAmong"],
      ...lines,
    });
    return Object.freeze({
      assets: Object.freeze({ sprites, bundle, assets }),
      sample: Object.freeze({ bundle: sampleBundle, assets: sample }),
    }) as HabahiroRhythmSkinAssets;
  }
  const assets: RhythmAssets = Object.freeze({
    noteNormal: lanesByPrefix(named, "note_normal", identity),
    noteNormal16: lanesByPrefix(named, "note_normal_16", identity),
    noteSkill: lanesByPrefix(named, "note_skill", identity),
    noteFlick: lanesByPrefix(named, "note_flick", identity),
    noteFlickTop: requireSprite(named, "note_flick_top", identity),
    noteLong: lanesByPrefix(named, "note_long", identity),
    noteLongFlash: lanesByPrefix(named, "note_long_flash", identity),
    noteSlideAmong: requireSprite(named, "note_slide_among", identity),
    ...lines,
  });
  return Object.freeze({
    assets: Object.freeze({ sprites, bundle, assets }),
    sample: Object.freeze({ bundle: sampleBundle, assets: sample }),
  });
}

async function decodeDirectional(
  source: PackageView,
  identity: string,
  createImageUrl: (canvas: HTMLCanvasElement) => Promise<string>,
): Promise<DirectionalSkinAssets> {
  const sprites = parseSpritesJsonOrThrow(requireText(source, ".sprites"), `${identity} .sprites`);
  const bundle = parseBundleJsonOrThrow(
    requireText(source, `ingameskin-noteskin-${identity}.bundle`),
    `${identity} bundle`,
  );
  const sampleBundle = parseBundleJsonOrThrow(
    requireText(source, `ingameskin-noteskin-${identity}sample.bundle`),
    `${identity} sample bundle`,
  );
  const named = await extractNamedSprites({
    filePathByName: Object.fromEntries(source.urls),
    sprites,
    bundle,
    createImageUrl,
  });
  const assets: DirectionalAssets = Object.freeze({
    noteFlickL: lanesByPrefix(named, "note_flick_l", identity),
    noteFlickR: lanesByPrefix(named, "note_flick_r", identity),
    noteFlickTopL: requireSprite(named, "note_flick_top_l", identity),
    noteFlickTopR: requireSprite(named, "note_flick_top_r", identity),
    flickNoteLineL: requireUrl(source, "FlickNoteLine_l.png"),
    flickNoteLineR: requireUrl(source, "FlickNoteLine_r.png"),
  });
  const sample: DirectionalSampleAssets = Object.freeze({
    NoteFlickL3: requireUrl(source, "note_flick_l_3.png"),
    NoteFlickR3: requireUrl(source, "note_flick_r_3.png"),
  });
  return Object.freeze({
    assets: Object.freeze({ sprites, bundle, assets }),
    sample: Object.freeze({ bundle: sampleBundle, assets: sample }),
  });
}

function decodeRhythmSe(source: PackageView): RhythmSeSkinAssets {
  return Object.freeze({
    perfect: requireOneUrl(source, ["perfect.mp3", "perfect.wav", "perfect.ogg"]),
    flick: requireOneUrl(source, ["flick.mp3", "flick.wav", "flick.ogg"]),
  });
}

function decodeDirectionalSe(source: PackageView): DirectionalSeSkinAssets {
  return Object.freeze({ directionalFL: Object.freeze({
    1: requireOneUrl(source, ["directional_fl.mp3", "directional_fl.wav", "directional_fl.ogg"]),
    2: requireOneUrl(source, ["directional_fl_2.mp3", "directional_fl_2.wav", "directional_fl_2.ogg"]),
    3: requireOneUrl(source, ["directional_fl_3.mp3", "directional_fl_3.wav", "directional_fl_3.ogg"]),
  }) });
}

function decodeField(source: PackageView): FieldSkinAssets {
  return Object.freeze({
    bgLineRhythm: requireUrl(source, "bg_line_rhythm.png"),
    gamePlayLine: requireUrl(source, "game_play_line.png"),
    gamePlayLineSkillAdjustEffect: requireUrl(source, "game_play_line_skill_adjust_effect.png"),
  });
}

function decodeBackground(source: PackageView): BGSkin {
  const liveBG = source.urls.get("livebg.png") ?? source.urls.get("livebg_normal.png");
  if (liveBG === undefined) throw new Error("background resource is missing liveBG.png/liveBG_normal.png");
  const fever = source.urls.get("livebg_fever.png");
  const preview = source.urls.get("previewbg.png");
  return Object.freeze({
    assets: Object.freeze({ liveBG, ...(fever === undefined ? {} : { liveBGFever: fever }) }),
    ...(preview === undefined ? {} : { preview: Object.freeze({ previewBG: preview }) }),
  });
}

async function decodeJudge(
  source: PackageView,
  identity: string,
  createImageUrl: (canvas: HTMLCanvasElement) => Promise<string>,
): Promise<JudgeSkin> {
  const assetName = requireSingleSuffix(source.paths, ".asset");
  const bundleName = requireSingleSuffix(source.paths, ".bundle");
  const atlasName = requireSingleSuffix(source.paths, ".png");
  const asset: AssetManifest = parseAssetJsonOrThrow(requireText(source, basename(assetName)), `${identity} judge asset`);
  const bundle: BundleManifest = parseBundleJsonOrThrow(requireText(source, basename(bundleName)), `${identity} judge bundle`);
  const atlasKey = basename(atlasName).toLowerCase();
  const atlasUrl = source.urls.get(atlasKey);
  if (atlasUrl === undefined) throw new Error("judge atlas URL is unavailable");
  const sprites = await extractNamedSpritesFromAsset({
    filePathByName: { [atlasKey]: atlasUrl },
    asset,
    bundle,
    atlasFileName: atlasKey,
    coordinateOrigin: "top-left",
    createImageUrl,
  });
  const assets: JudgeSkinAssets = Object.freeze({
    judgePerfect: requireSprite(sprites, "judge_perfect", identity),
    judgeGreat: requireSprite(sprites, "judge_great", identity),
    judgeGood: requireSprite(sprites, "judge_good", identity),
    judgeBad: requireSprite(sprites, "judge_bad", identity),
    judgeMiss: requireSprite(sprites, "judge_miss", identity),
    judgeAuto: requireSprite(sprites, "judge_auto", identity),
    judgeFast: requireSprite(sprites, "judge_fast", identity),
    judgeSlow: requireSprite(sprites, "judge_slow", identity),
  });
  return Object.freeze({ asset, bundle, assets });
}

function lanesByPrefix(
  sprites: Readonly<Record<string, string>>,
  prefix: string,
  label: string,
): NoteAssets {
  return Object.freeze(Object.fromEntries(
    NOTE_LANES.map((lane) => [lane, requireSprite(sprites, `${prefix}_${lane}`, label)]),
  )) as NoteAssets;
}

function habahiroByPrefix(
  sprites: Readonly<Record<string, string>>,
  prefix: string,
  label: string,
): HabahiroRhythmAssets["noteNormal"] {
  return Object.freeze(Object.fromEntries(
    HABAHIRO_KEYS.map((key) => [key, requireSprite(sprites, `${prefix}_${key}`, label)]),
  )) as HabahiroRhythmAssets["noteNormal"];
}

function requireText(source: PackageView, fileName: string): string {
  const value = source.texts.get(fileName.toLowerCase());
  if (value === undefined) throw new Error(`resource package is missing text file: ${fileName}`);
  return value;
}

function requireUrl(source: PackageView, fileName: string): string {
  const value = source.urls.get(fileName.toLowerCase());
  if (value === undefined) throw new Error(`resource package is missing binary file: ${fileName}`);
  return value;
}

function requireOneUrl(source: PackageView, candidates: readonly string[]): string {
  for (const candidate of candidates) {
    const value = source.urls.get(candidate.toLowerCase());
    if (value !== undefined) return value;
  }
  throw new Error(`resource package is missing required alternatives: ${candidates.join(", ")}`);
}

function requireSprite(
  sprites: Readonly<Record<string, string>>,
  key: string,
  label: string,
): string {
  const value = sprites[key];
  if (value === undefined || value.length === 0) throw new Error(`${label} is missing sprite ${key}`);
  return value;
}

function requireSingleSuffix(paths: readonly string[], suffix: string): string {
  const matches = paths.filter((path) => path.toLowerCase().endsWith(suffix));
  if (matches.length !== 1) throw new Error(`resource package requires exactly one ${suffix} file`);
  return matches[0]!;
}

function basename(path: string): string {
  return path.split("/").pop() ?? path;
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob === null || blob.size === 0) reject(new Error("derived skin image encoding failed"));
      else resolve(blob);
    }, "image/png");
  });
}
