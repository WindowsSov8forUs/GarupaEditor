#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function parseCli(argv) {
  const args = {
    sprites: "",
    bundle: "",
    out: "./scripts/sprite_source_map.json",
    csv: "",
    sheetHeight: null,
    strict: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--sprites") {
      args.sprites = argv[++i] ?? "";
    } else if (token === "--bundle") {
      args.bundle = argv[++i] ?? "";
    } else if (token === "--out") {
      args.out = argv[++i] ?? "";
    } else if (token === "--csv") {
      args.csv = argv[++i] ?? "";
    } else if (token === "--sheet-height") {
      const v = Number(argv[++i]);
      if (!Number.isFinite(v) || v <= 0) {
        throw new Error("Invalid --sheet-height value.");
      }
      args.sheetHeight = Math.round(v);
    } else if (token === "--strict") {
      args.strict = true;
    } else if (token === "--help" || token === "-h") {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }

  if (!args.sprites || !args.bundle) {
    printUsage();
    throw new Error("Both --sprites and --bundle are required.");
  }

  return args;
}

function printUsage() {
  console.log("Usage:");
  console.log(
    "  node scripts/build-sprite-source-map.mjs --sprites <sprites_json> --bundle <bundle_json> [--out <json_out>] [--csv <csv_out>] [--sheet-height <number>] [--strict]"
  );
}

function readJsonMaybeNestedString(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  let parsed = JSON.parse(raw);
  while (typeof parsed === "string") {
    parsed = JSON.parse(parsed);
  }
  return parsed;
}

function normalizePathId(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function unityRectToTopLeft(rect, sheetHeight) {
  return {
    x: rect.x,
    y: sheetHeight - rect.y - rect.height,
    width: rect.width,
    height: rect.height,
  };
}

export function getSprites(spriteJson) {
  if (!Array.isArray(spriteJson)) {
    throw new Error("Sprites JSON root must be an array.");
  }

  const sprites = [];
  for (let i = 0; i < spriteJson.length; i += 1) {
    const base = spriteJson[i]?.Base;
    if (!base) {
      continue;
    }

    const name = String(base.m_Name ?? "");
    const rectRaw = base.m_Rect ?? {};
    const texturePathId = normalizePathId(base?.m_RD?.texture?.m_PathID);

    const rect = {
      x: Number(rectRaw.x ?? 0),
      y: Number(rectRaw.y ?? 0),
      width: Number(rectRaw.width ?? 0),
      height: Number(rectRaw.height ?? 0),
    };

    sprites.push({
      name,
      texturePathId,
      rect,
    });
  }

  return sprites;
}

export function getBundleImageEntries(bundleJson) {
  const base = bundleJson?.Base ?? bundleJson;
  const preloadTable = base?.m_PreloadTable;
  const container = base?.m_Container;

  if (!Array.isArray(preloadTable)) {
    throw new Error("Bundle JSON missing Base.m_PreloadTable array.");
  }
  if (!container || typeof container !== "object") {
    throw new Error("Bundle JSON missing Base.m_Container object.");
  }

  const preloadPathIds = preloadTable.map((x) => normalizePathId(x?.m_PathID));
  const entries = [];

  for (const [assetPath, info] of Object.entries(container)) {
    if (!assetPath.toLowerCase().endsWith(".png")) {
      continue;
    }

    const preloadIndex = Number(info?.preloadIndex ?? 0);
    const preloadSize = Number(info?.preloadSize ?? 0);
    const assetPathId = normalizePathId(info?.asset?.m_PathID);

    const slice = preloadPathIds.slice(preloadIndex, preloadIndex + preloadSize);
    entries.push({
      assetPath,
      fileName: path.basename(assetPath),
      preloadIndex,
      preloadSize,
      assetPathId,
      preloadPathIds: slice,
    });
  }

  return entries;
}

export function buildTextureOwnerIndex(entries) {
  const ownersByTexture = new Map();
  for (const entry of entries) {
    for (const pathId of entry.preloadPathIds) {
      if (!pathId) {
        continue;
      }
      if (!ownersByTexture.has(pathId)) {
        ownersByTexture.set(pathId, []);
      }
      ownersByTexture.get(pathId).push(entry);
    }
  }
  return ownersByTexture;
}

export function mapSpritesToImages(sprites, ownersByTexture, sheetHeight) {
  const mapped = [];
  const ambiguous = [];
  const unmapped = [];

  for (const sprite of sprites) {
    const owners = ownersByTexture.get(sprite.texturePathId) ?? [];
    const uniqueOwners = [];
    const seenAssetPaths = new Set();
    for (const owner of owners) {
      if (!seenAssetPaths.has(owner.assetPath)) {
        seenAssetPaths.add(owner.assetPath);
        uniqueOwners.push(owner);
      }
    }

    if (uniqueOwners.length === 1) {
      const owner = uniqueOwners[0];
      mapped.push({
        spriteName: sprite.name,
        texturePathId: sprite.texturePathId,
        sourceImageFile: owner.fileName,
        sourceImageAssetPath: owner.assetPath,
        sourceImageAssetPathId: owner.assetPathId,
        rectUnity: sprite.rect,
        rectTopLeft:
          sheetHeight == null ? null : unityRectToTopLeft(sprite.rect, sheetHeight),
      });
      continue;
    }

    if (uniqueOwners.length === 0) {
      unmapped.push({
        spriteName: sprite.name,
        texturePathId: sprite.texturePathId,
      });
      continue;
    }

    ambiguous.push({
      spriteName: sprite.name,
      texturePathId: sprite.texturePathId,
      ownerAssetPaths: uniqueOwners.map((x) => x.assetPath),
    });
  }

  return { mapped, ambiguous, unmapped };
}

function toCsv(rows) {
  const headers = [
    "spriteName",
    "texturePathId",
    "sourceImageFile",
    "sourceImageAssetPath",
    "sourceImageAssetPathId",
    "rectX",
    "rectYUnity",
    "rectWidth",
    "rectHeight",
    "rectYTopLeft",
  ];

  const esc = (v) => {
    const s = String(v ?? "");
    if (s.includes(",") || s.includes("\"") || s.includes("\n")) {
      return `"${s.replaceAll("\"", "\"\"")}"`;
    }
    return s;
  };

  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.spriteName,
        row.texturePathId,
        row.sourceImageFile,
        row.sourceImageAssetPath,
        row.sourceImageAssetPathId,
        row.rectUnity.x,
        row.rectUnity.y,
        row.rectUnity.width,
        row.rectUnity.height,
        row.rectTopLeft ? row.rectTopLeft.y : "",
      ]
        .map(esc)
        .join(",")
    );
  }
  return lines.join("\n");
}

function ensureOutDir(filePath) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

export function buildSpriteSourceMap({ spritesJson, bundleJson, sheetHeight = null }) {
  const sprites = getSprites(spritesJson);
  const imageEntries = getBundleImageEntries(bundleJson);
  const ownersByTexture = buildTextureOwnerIndex(imageEntries);
  const result = mapSpritesToImages(sprites, ownersByTexture, sheetHeight);

  const textureToSource = {};
  for (const [texturePathId, owners] of ownersByTexture.entries()) {
    const unique = [];
    const seen = new Set();
    for (const owner of owners) {
      if (!seen.has(owner.assetPath)) {
        seen.add(owner.assetPath);
        unique.push({
          fileName: owner.fileName,
          assetPath: owner.assetPath,
          assetPathId: owner.assetPathId,
          preloadIndex: owner.preloadIndex,
          preloadSize: owner.preloadSize,
        });
      }
    }
    textureToSource[texturePathId] = unique;
  }

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      spriteCount: sprites.length,
      imageEntryCount: imageEntries.length,
      mapped: result.mapped.length,
      ambiguous: result.ambiguous.length,
      unmapped: result.unmapped.length,
    },
    textureToSource,
    mappedSprites: result.mapped,
    ambiguousSprites: result.ambiguous,
    unmappedSprites: result.unmapped,
  };
}

function main() {
  const args = parseCli(process.argv.slice(2));
  const spritesJson = readJsonMaybeNestedString(args.sprites);
  const bundleJson = readJsonMaybeNestedString(args.bundle);
  const output = buildSpriteSourceMap({
    spritesJson,
    bundleJson,
    sheetHeight: args.sheetHeight,
  });

  output.inputs = {
    sprites: path.resolve(args.sprites),
    bundle: path.resolve(args.bundle),
    sheetHeight: args.sheetHeight,
  };

  ensureOutDir(args.out);
  fs.writeFileSync(args.out, JSON.stringify(output, null, 2), "utf8");

  if (args.csv) {
    ensureOutDir(args.csv);
    fs.writeFileSync(args.csv, toCsv(result.mapped), "utf8");
  }

  console.log(`Mapped ${output.summary.mapped}/${output.summary.spriteCount}, ambiguous=${output.summary.ambiguous}, unmapped=${output.summary.unmapped}`);
  console.log(`JSON output: ${path.resolve(args.out)}`);
  if (args.csv) {
    console.log(`CSV output: ${path.resolve(args.csv)}`);
  }

  if (args.strict && (output.summary.ambiguous > 0 || output.summary.unmapped > 0)) {
    process.exit(2);
  }
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main();
}
