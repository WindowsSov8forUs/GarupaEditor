# Application resources

`src/resources` is the application-owned resource authority. It manages resource discovery, selection, installation, user-media import, observed integrity, immutable snapshots and consumer leases for the main program.

## Source classes

- `builtin`: 22 application UI files plus 17 minimal Simulator common files (39 total), imported only by the two builtin catalog owners and verified against generated integrity/provenance manifests. The Simulator pack contains common Combo/Life/Score/Rank/Startup assets and semantic profiles; Skin, SE and particle source packages remain network resources.
- `network`: resources discovered from the live Bestdori `_info`, complete song master and their last complete offline snapshot. The catalog covers open-ended Note/Field/BG/Judge/TapEffect/Stage Skin packages, TapSE/common sound, BGM packages/files, music-jacket packages/files and every discoverable `movie/mv` package. Stage packages are catalogued even though current Simulator consumption remains excluded. Downloaded bytes receive observed length/SHA only after acquisition.
- `user`: locally uploaded BGM, cover, MV or stage backdrop. Skin/SE/package upload is not exposed.

Consumers receive `ResourceConsumerLease` and may only decide how to decode/use files. They do not fetch, choose a source, inspect app-data paths, persist bytes or select fallback content.

## Persistence

The Tauri backend uses storage schema 2 under `app_data/resources/`: content-addressed blobs, immutable record revisions, catalog snapshots, cross-window snapshots and a `library/` projection organized by original logical Bundle names. `library/` is auditable product indexing, not the byte authority and not an original Android-cache clone. Projection files are hard-linked when possible or copied and immediately reverified. Chart sessions currently persist `ResourceRef` values in `cache/session/chart-resources/chart-resources.v3.json`; the Stage 9 migration upgrades that cache separately.

A SHA-256 value is an observation of already acquired bytes, never a compiled remote allowlist. Network IDs use `bestdori/<server>/<original-logical-path>`; single official media append their provider-native file path, and never encode the download URL. Updating a URL or bytes under the same logical identity creates a new immutable record revision and atomically advances `current.json`; existing snapshots retain their previous revision and blobs until final lease release.

## Verification

```powershell
npx.cmd tsc -p src/resources/tsconfig.json
npm.cmd run resources:test
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml resource_manager --lib --no-run
npm.cmd run chart:test
```

The current Windows environment compiles the Rust unit-test executable but cannot run it because the existing Tauri test binary exits with `STATUS_ENTRYPOINT_NOT_FOUND`; semantic resource lifecycle tests run through the isolated TypeScript memory backend. This environment limitation is recorded rather than treating `--no-run` as an executed Rust test pass.

Simulator production resource integration is now separately authorized and governed by [`simulator-resource-integration-contract.md`](./simulator-resource-integration-contract.md). During the migration, the old isolated store is an implementation baseline only; completion requires its removal from production and a main-program-created Snapshot/Lease.
