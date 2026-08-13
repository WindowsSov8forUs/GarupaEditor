export interface HabahiroExternalPinnedAsset {
  readonly technicalName: string;
  readonly byteLength: number;
  readonly sha256: string;
  readonly dimensions: readonly [number, number] | null;
}

export const HABAHIRO_EXTERNAL_PINNED_ASSETS: readonly HabahiroExternalPinnedAsset[] = Object.freeze([
  Object.freeze({
    technicalName: "ingameskin-noteskin-habahiro.bundle",
    byteLength: 10448,
    sha256: "E4F0D2A380DC217AFB3EAD8A601493D72ED7A2C84746B949C0FD1BC4B08A96C5",
    dimensions: null,
  }),
  Object.freeze({
    technicalName: ".sprites",
    byteLength: 1214567,
    sha256: "BEFD45C7D0702D4479365AFFD527DFB5D5FA263A8B58176EA7C5EA88B3740B6A",
    dimensions: null,
  }),
  Object.freeze({
    technicalName: "RhythmGameSprites1.png",
    byteLength: 505257,
    sha256: "BD949E997D85E58BE1E674E1115870E14C81369142CF85D6E73AF80CC0383656",
    dimensions: Object.freeze([2048, 2048] as const),
  }),
  Object.freeze({
    technicalName: "RhythmGameSprites16.png",
    byteLength: 500135,
    sha256: "6FFE3A079FF03191F03A2A9CCA46B651DA1B3D4013D7E1556DD8D0C4E9E0A877",
    dimensions: Object.freeze([2048, 2048] as const),
  }),
  Object.freeze({
    technicalName: "RhythmGameSprites2.png",
    byteLength: 438702,
    sha256: "F1319CE2143BA1DEBE7F2B5BB0B6208F134C6E0FF077D12C938D2CDA0B373894",
    dimensions: Object.freeze([2048, 2048] as const),
  }),
  Object.freeze({
    technicalName: "RhythmGameSprites3.png",
    byteLength: 252911,
    sha256: "3193607C11352516393AFB0AE23144C575A92EB58B7D21349621F9F676823E97",
    dimensions: Object.freeze([2048, 2048] as const),
  }),
  Object.freeze({
    technicalName: "RhythmGameSprites4.png",
    byteLength: 445320,
    sha256: "E1D7E6C8F11A70BB2B633DFD9DA5C6D6F36005A47875DF7D652123D8C626D12D",
    dimensions: Object.freeze([2048, 2048] as const),
  }),
  Object.freeze({
    technicalName: "RhythmGameSprites5.png",
    byteLength: 443964,
    sha256: "CC4464CF02E143B37E9E01E87352ED30CDC90EDA9A4CB19D4E0AC38C2C69AD11",
    dimensions: Object.freeze([2048, 2048] as const),
  }),
  Object.freeze({
    technicalName: "longNoteLine.png",
    byteLength: 3124,
    sha256: "DC28380A2110D07022C63F323499DEC597DE5A82924F81DFC19394909C97E26E",
    dimensions: Object.freeze([146, 205] as const),
  }),
  Object.freeze({
    technicalName: "longNoteLine2.png",
    byteLength: 727,
    sha256: "845FE4E4FFC693B4C05526A765060E24E35E79A34CD9E4EA7F900104D4A9E397",
    dimensions: Object.freeze([146, 205] as const),
  }),
  Object.freeze({
    technicalName: "simultaneous_line.png",
    byteLength: 408,
    sha256: "1C9F1D79986F609733810D1068A927D895D9DA2E6366C2C5D68C975CAEB1BD88",
    dimensions: Object.freeze([10, 27] as const),
  }),
]);

export const HABAHIRO_EXTERNAL_PACK_IDENTITY =
  "habahiro-current-external-degraded-preview-2026-03-31" as const;
