# Application resources

`src/resources` is the application-owned resource authority. It manages resource discovery, selection, installation, user-media import, observed integrity, immutable snapshots and consumer leases for the main program.

## Source classes

- `builtin`: the current 22 application files plus the separately registered minimal Simulator common pack, imported only by builtin catalog owners and verified against generated manifests.
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

Simulator production resource integration is now separately authorized and governed by [`simulator-resource-integration-contract.md`](./simulator-resource-integration-contract.md). During the migration, the old isolated store is an implementation baseline only; completion requires its removal from production and a main-program-created Snapshot/Lease.
