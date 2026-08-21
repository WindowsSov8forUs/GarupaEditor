import { BestdoriApplicationResourceProvider } from "../providers/bestdoriCatalogProvider";

export async function runDynamicCatalogTests(): Promise<void> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/assets/_info.json")) {
      const jp = url.includes("/jp/");
      return jsonResponse(jp ? {
        ingameskin: {
          noteskin: { skin999: {} },
          fieldskin: {},
          bgskin: {},
          judgeskin: {},
          tapeffect: { skin999: {} },
          stageskin: { normal: {} },
        },
        sound: { tapseskin: {}, common: 1, bgm999: 4, bgm: { ignored: 1 } },
        musicjacket: { musicjacket1000: 3 },
        movie: { mv: { music_video_999_hq: 4 } },
      } : { ingameskin: {}, sound: {} });
    }
    if (url.includes("/api/skin/")) return jsonResponse({});
    if (url.endsWith("/api/songs/all.8.json")) return jsonResponse({
      "999": {
        jacketImage: ["future_song"],
        musicTitle: ["Future Song", null, null, null, null],
      },
    });
    if (url.endsWith("/skin999.json")) return jsonResponse(["atlas.bin"]);
    if (url.endsWith("/skin999sample.json")) return jsonResponse(["sample.bundle"]);
    if (url.endsWith("/skin999_rip/atlas.bin")) {
      return new Response(new TextEncoder().encode("dynamic-atlas"), {
        status: 200,
        headers: { "Content-Type": "application/octet-stream" },
      });
    }
    if (url.endsWith("/skin999sample_rip/sample.bundle")) {
      return new Response(new TextEncoder().encode("dynamic-sample"), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("not found", { status: 404 });
  };
  try {
    const provider = new BestdoriApplicationResourceProvider();
    const catalog = await provider.refresh(null);
    equal(catalog.status, "accepted");
    if (catalog.status !== "accepted") return;
    const future = catalog.value.resources.find((resource) => resource.source.family === "noteskin" && resource.source.nativeId === "skin999");
    equal(future?.ref.id, "bestdori/jp/ingameskin/noteskin/skin999");
    equal(catalog.value.resources.some((resource) => resource.ref.id === "bestdori/jp/ingameskin/tapeffect/skin999"), true);
    equal(catalog.value.resources.some((resource) => resource.ref.id === "bestdori/jp/ingameskin/stageskin/normal"), true);
    equal(catalog.value.resources.some((resource) => resource.ref.id === "bestdori/jp/sound/common"), true);
    equal(catalog.value.resources.some((resource) => resource.ref.id === "bestdori/jp/sound/bgm999"), true);
    equal(catalog.value.resources.some((resource) => resource.ref.id === "bestdori/jp/musicjacket/musicjacket1000"), true);
    equal(catalog.value.resources.some((resource) => resource.ref.id === "bestdori/jp/movie/mv/music_video_999_hq"), true);
    equal(catalog.value.resources.some((resource) => resource.ref.id === "bestdori/jp/sound/bgm999/bgm999.mp3"), true);
    equal(catalog.value.resources.some((resource) => resource.ref.id.includes("-future_song-jacket.png")), true);
    if (future === undefined) return;
    const installed = await provider.install(future);
    equal(installed.status, "accepted");
    if (installed.status !== "accepted") return;
    equal(installed.value.files.length, 2);
    equal(new TextDecoder().decode(installed.value.files[0]!.bytes), "dynamic-atlas");
    equal(new TextDecoder().decode(installed.value.files[1]!.bytes), "dynamic-sample");

    globalThis.fetch = async () => { throw new Error("offline"); };
    const offline = await provider.refresh(catalog.value);
    equal(offline.status, "rejected");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function equal(actual: unknown, expected: unknown): void {
  if (!Object.is(actual, expected)) {
    throw new Error(`assertion failed: expected ${String(expected)}, got ${String(actual)}`);
  }
}
