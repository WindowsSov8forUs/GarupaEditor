# Application resources

`src/resources` is the application-owned resource authority. It manages resource discovery, selection, installation, user-media import, observed integrity, immutable snapshots and consumer leases for the main program.

## Source classes

- `builtin`: 22 application UI files plus 55 Simulator common files (77 total), imported only by the two builtin catalog owners and verified against generated integrity/provenance manifests. Every physical import is an explicit Vite `?url&no-inline` asset: packaging may change its URL or hashed filename but may not rewrite the bytes described by the source manifest. The Simulator pack contains common Combo/Life/Score/Rank/Startup/Pause countdown assets and semantic profiles; Skin, SE and particle source packages remain network resources.
- global `network`: reusable resources discovered from the live Bestdori `_info`, complete song master and their last complete offline catalog snapshot. Skin, TapSE/common sound, particle and other reusable packages are installed globally. Note Skin primary/sample bundles remain separate provider-native records and are joined only by explicit operation-local Snapshot slots, so migrated split records work offline without filename fallback or forced redownload. Provider BGM/jacket/MV candidates remain discoverable, but selected chart-media bytes are materialized in the current workspace rather than installed as global media records.
- current-session `workspace`: locally uploaded or provider-downloaded BGM, cover, MV and stage backdrop for the currently recoverable chart session. Skin/SE/package upload and a permanent user media library are not exposed. Legacy `user/media/*` is migration-only.

Consumers receive `ResourceConsumerLease` and may only decide how to decode/use files. They do not fetch, choose a source, inspect app-data paths, persist bytes or select fallback content.

## Persistence

The Tauri backend keeps global storage schema 2 under `app_data/resources/` and current-session workspace schema 1 under `app_data/cache/session/project-media/`. Both use the content-addressed `resources/blobs/` pool, but only global Builtin/reusable Network records receive a `library/` projection. Shared CAS bytes do not imply permanent library ownership. Chart sessions persist four `ResourceRef` slots in `cache/session/chart-resources/chart-resources.v5.json`; replacement is reconciled only after v5 is durable, and active snapshots keep retired bytes until final lease release. Graceful application exit clears process-owned snapshots and pending transactions before final CAS collection; initialization performs the same cleanup for crash residue.

The one-time migration adopts current v2 raw media and v3/v4 user/provider-media refs into the workspace. Unreferenced legacy user records are hard-linked or copied with integrity verification to `app_data/recovery/legacy-user-media-v1/` before leaving the active index; provider-media caches are removed and remain redownloadable. Recovery is not a catalog or fallback source.

A SHA-256 value is an observation of already acquired bytes, never a compiled remote allowlist. Network IDs use `bestdori/<server>/<original-logical-path>`; single official media append their provider-native file path, and never encode the download URL. Updating a URL or bytes under the same logical identity creates a new immutable record revision and atomically advances `current.json`; existing snapshots retain their previous revision and blobs until final lease release.

## Verification

```powershell
npx.cmd tsc -p src/resources/tsconfig.json
npm.cmd run resources:test
npm.cmd run build
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml resource_manager --lib --no-run
npm.cmd run chart:test
```

`npm run build` is not complete after Vite compilation alone: `resources:verify-production-assets` hashes `dist/assets` and requires all 77 logical Builtins to retain their source-manifest byte length and SHA-256. This closes source-to-production transformations such as SVG Data URL normalization while retaining the typed runtime byte-integrity check; a mismatch blocks only the affected resource action.

The current Windows environment compiles the Rust unit-test executable but cannot run it because the existing Tauri test binary exits with `STATUS_ENTRYPOINT_NOT_FOUND`; semantic resource lifecycle tests run through the isolated TypeScript memory backend. This environment limitation is recorded rather than treating `--no-run` as an executed Rust test pass.

Simulator production resource integration is governed by [`simulator-resource-integration-contract.md`](./simulator-resource-integration-contract.md). The old Store/selectors/fixed network manifests have been removed from production and retained only as isolated `testing/legacy*` regression helpers. Desktop and mobile compositions now use main-program Snapshot/Lease; interactive device acceptance remains separately reported and does not weaken resource ownership.
