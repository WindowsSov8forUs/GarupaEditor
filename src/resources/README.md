# Application resources

`src/resources` is the application-owned production authority for resource discovery, acquisition, selection, persistence, immutable snapshots and consumer leases. Domain consumers decode leased bytes; they do not fetch, choose fallbacks, inspect App Data paths or persist resources.

## Source classes

- **Builtin**: source-controlled application and Simulator assets. `builtinResourceManifest.json` is generated from the complete `src/assets` inventory. `builtinResourceCatalog.ts` owns the application-only set; `simulatorBuiltinResourceCatalog.ts` owns the Simulator set described by `simulatorBuiltinResourceManifest.json`. The sets must be disjoint and their union must equal the generated source manifest.
- **Network**: reusable packages discovered from the live Bestdori catalog or the last complete offline catalog. A digest observes downloaded bytes; it is not a compiled eligibility allowlist. Note Skin primary and sample packages remain distinct records and are joined only by explicit Snapshot slots.
- **Workspace**: BGM, cover, MV and stage-backdrop media for the current recoverable chart session. These bytes do not become a permanent global media library. Legacy `user/media/*` is migration input only.

Every physical Builtin import uses `?url&no-inline`. Vite may rename the emitted file but must preserve the source-manifest bytes. The application catalog, Simulator catalog, generated manifest and Simulator provenance manifest have separate owners and are not merged merely because bytes or names overlap.

Simulator particle preparation is source-bound: each leased logical resource exposes an immutable snapshot revision plus file receipt byte length/SHA-256; the consumer rehashes reads before relating them to official UnityFS/component semantics. Default and selected Skin use one Schema-2 validator, and ordinary, directional and Game-clear bundles enter one cached prepared token shared by simulation and Pixi. A semantic profile self-hash, package name, same-looking raster or successful decode cannot replace the independent application receipt.

## Persistence and lifecycle

Global reusable resources use storage schema 2 under `app_data/resources/`; current-session workspace resources use schema 1 under `app_data/cache/session/project-media/`. Both share the content-addressed `resources/blobs/` pool, while only reusable Builtin/Network records receive a `resources/library/` projection.

Chart sessions persist four `ResourceRef` slots in `chart-resources.v5.json`. Replacement becomes reachable only after the binding is durable. Existing snapshots keep their frozen revisions and blobs until the final lease release. Graceful exit and next-start recovery clear process-owned snapshots and incomplete transactions before garbage collection.

The full behavior contract is [`resource-management-contract.md`](./resource-management-contract.md). Simulator ownership is further constrained by [`simulator-resource-integration-contract.md`](./simulator-resource-integration-contract.md).

## Verification

```powershell
npm.cmd run resources:builtin-manifest          # regenerate after an intentional src/assets change
node scripts/build-builtin-resource-catalog.mjs --check
npm.cmd run resources:test
npm.cmd run chart:test
npm.cmd run build
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml resource_manager --lib --no-run
```

`resources:test` runs the manifest `--check` gate, exact catalog/manifest set comparisons, dependency boundaries and TypeScript resource lifecycle tests. No application-only, Simulator or union count is hard-coded; the current values are derived from the owned sets.

`npm run build` is complete only after `resources:verify-production-assets` hashes `dist/assets` and finds every source-manifest payload unchanged. A runtime integrity mismatch remains scoped to the affected action and never authorizes regeneration from transformed output.
