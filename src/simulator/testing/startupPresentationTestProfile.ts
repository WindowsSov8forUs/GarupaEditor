import type { SimulatorPresentationPackage } from "../public/contracts";

export function createTestPresentationPackage(): SimulatorPresentationPackage {
  const jacket = structuralPng(360, 360);
  const backdrop = structuralPng(1600, 720);
  return {
    song: {
      title: "Test Song",
      bandName: "Test Band",
      lyricist: "Lyricist",
      composer: "Composer",
      arranger: "Arranger",
    },
    difficulty: { type: "EXPERT", level: 25 },
    jacketPng: jacket,
    stage: { backdropPng: backdrop, sdCharacterAtlases: null },
    liveStartVoiceMp3: null,
    mv: null,
  };
}

function structuralPng(width: number, height: number): Uint8Array {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  const ihdr = new Uint8Array(13);
  writeU32(ihdr, 0, width);
  writeU32(ihdr, 4, height);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Uint8Array.from([
    ...signature,
    ...chunk("IHDR", ihdr),
    ...chunk("IDAT", Uint8Array.of(0)),
    ...chunk("IEND", new Uint8Array()),
  ]);
}

function chunk(type: string, payload: Uint8Array): number[] {
  const typeBytes = Uint8Array.from([...type].map((character) => character.charCodeAt(0)));
  const combined = new Uint8Array(typeBytes.length + payload.length);
  combined.set(typeBytes);
  combined.set(payload, typeBytes.length);
  const result = new Uint8Array(12 + payload.length);
  writeU32(result, 0, payload.length);
  result.set(combined, 4);
  writeU32(result, 8 + payload.length, crc32(combined));
  return [...result];
}
function writeU32(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value >>> 24;
  bytes[offset + 1] = value >>> 16;
  bytes[offset + 2] = value >>> 8;
  bytes[offset + 3] = value;
}
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
