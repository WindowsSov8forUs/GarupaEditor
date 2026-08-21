export type CurrentSkinResourceRole =
  | "notes"
  | "directional-note"
  | "field"
  | "tap-effect"
  | "directional-effect"
  | "special-background"
  | "tap-se"
  | "judge";

export interface PreparedSkinPortableFile {
  readonly id: string;
  readonly mime: "image/png" | "audio/mpeg";
  readonly bytes: Uint8Array;
  readonly sha256: string;
  readonly width: number | null;
  readonly height: number | null;
}

export interface PreparedSkinPortablePack {
  readonly logicalResource: string;
  readonly role: CurrentSkinResourceRole;
  readonly profile: Readonly<Record<string, unknown>>;
  readonly files: readonly PreparedSkinPortableFile[];
}
