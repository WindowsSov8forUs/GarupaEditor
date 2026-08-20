# Application resources

`src/resources` is the application-owned resource authority. It manages resource discovery, selection, installation, user-media import, observed integrity, immutable snapshots and consumer leases for the main program.

## Source classes

- `builtin`: the 22 files under `src/assets`, imported only by `builtin/builtinResourceCatalog.ts` and verified against the generated manifest.
- `network`: resources discovered from the live Bestdori catalog or its last complete offline snapshot. Native IDs are open-ended; downloaded bytes receive observed length/SHA only after acquisition.
- `user`: locally uploaded BGM, cover, MV or stage backdrop. Skin/SE/package upload is not exposed.

Consumers receive `ResourceConsumerLease` and may only decide how to decode/use files. They do not fetch, choose a source, inspect app-data paths, persist bytes or select fallback content.

## Persistence

The Tauri backend stores content-addressed blobs, records, catalog snapshots and cross-window snapshots under `app_data/resources/`. Chart sessions persist `ResourceRef` values in `cache/session/chart-resources/chart-resources.v3.json`; legacy v2 bytes/Data URLs are imported once into user resources.

A SHA-256 value is an observation of already acquired bytes, never a compiled remote allowlist. Updating content under the same provider-native ID is accepted through a new complete transaction; existing leases keep their immutable old blob until release.

## Verification

```powershell
npx.cmd tsc -p src/resources/tsconfig.json
npm.cmd run resources:test
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml resource_manager --lib --no-run
npm.cmd run chart:test
```

The current Windows environment compiles the Rust unit-test executable but cannot run it because the existing Tauri test binary exits with `STATUS_ENTRYPOINT_NOT_FOUND`; semantic resource lifecycle tests run through the isolated TypeScript memory backend.

Simulator production resource integration is intentionally not part of this foundation. `src/simulator` retains its current isolated contracts until a separately authorized integration replaces its static store with a main-program snapshot.
