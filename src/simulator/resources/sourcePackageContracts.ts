export type CurrentSkinResourceRole =
  | "notes"
  | "directional-note"
  | "field"
  | "habahiro-change-flash"
  | "tap-effect"
  | "directional-effect"
  | "special-background"
  | "tap-se"
  | "judge";

export interface PreparedSkinSourceFile {
  readonly id: string;
  /** Optional only for legacy compile compatibility; package sourceFiles owns production paths. */
  readonly logicalPath?: string;
  readonly mime: "image/png" | "audio/mpeg";
  readonly bytes: Uint8Array;
  /** Independent expected digest copied from the application Snapshot/Lease receipt. */
  readonly sha256: string;
  readonly width: number | null;
  readonly height: number | null;
}

export interface PreparedSkinSourcePackageFileIdentity {
  readonly logicalPath: string;
  readonly mediaType: string;
  readonly byteLength: number;
  readonly sha256: string;
}

export interface PreparedSkinSourcePackage {
  readonly logicalResource: string;
  /** Optional only for legacy compile compatibility; production particle conversion requires it. */
  readonly revision?: string;
  readonly role: CurrentSkinResourceRole;
  readonly profile: Readonly<Record<string, unknown>>;
  /** Optional only for legacy compile compatibility; production particle conversion requires it. */
  readonly sourceFiles?: readonly PreparedSkinSourcePackageFileIdentity[];
  readonly files: readonly PreparedSkinSourceFile[];
}
