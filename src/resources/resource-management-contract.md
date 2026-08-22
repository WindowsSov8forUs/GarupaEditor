# Application-Owned Resource Management Contract

## Authority

`ApplicationResourceManager` is the only production authority for locating, acquiring, installing, importing, snapshotting and releasing application resources. A consumer may interpret bytes for its own rendering/audio/movie contract, but it may not select a physical resource, consult a network source, read a path, persist bytes or choose fallback content.

This product contract is not Reverse evidence and does not change any original-game behavior claim. Simulator integration is separately authorized by `simulator-resource-integration-contract.md`; it must replace the simulator-owned store without weakening the source-neutral lease or consumer validation boundaries.

## Source classes

| Scope/origin | Identity owner | Persistence | Update rule |
| --- | --- | --- | --- |
| global `builtin` | application builtin catalog | shipped frontend resource | generated integrity describes the source-controlled payload; packaging may rename its URL but may not rewrite its bytes |
| global `network` | live provider catalog | verified app-data package/blob | same source-native ID may publish new observed bytes without code changes |
| current-session `workspace` | current chart-media workspace | recoverable session record backed by the shared CAS | replacement retires the old record after the persisted binding and final lease release |

User uploads are limited to BGM, cover, MV and stage backdrop and always enter the current-session workspace. Bestdori BGM, jacket and MV selected for a chart are downloaded into the same workspace rather than installed as global media records. Skin, SE, HUD, particle, font and other reusable packages remain global; user upload for them is not exposed. Legacy `user/media/*` is migration input only.

Consumers do not branch on scope or provenance. Every selected resource enters a consumer through a resource snapshot and lease.

## Identity and no-version-lock rule

A `ResourceId` is a stable source identity, not a content revision or game-version identity. Runtime IDs must not contain an application release, original-game release, `current-*` namespace or download URL. Bestdori IDs use the server plus original logical package/file path (`ingameskin`, `sound`, `musicjacket`, `movie/mv`). Network candidates are obtained from live `_info` plus the complete song master or their last complete offline snapshot; hard-coded fallback candidate inventories are forbidden. Note Skin primary and `sample` bundles retain their distinct provider-native IDs and records. An editor Skin operation binds both identities under separate immutable snapshot slots; providers may not silently fold the sample manifest into the primary logical package, and consumers may not infer a missing sample from a similarly named primary file.

SHA-256 and byte length are **observed integrity** generated after builtin packaging, network download or user import. They detect incomplete or locally corrupted bytes. They are not compiled network allowlists. If a provider changes bytes under the same native ID, a complete new transaction becomes the current record and future snapshots may select it. Existing snapshots retain their already acquired blobs until release.

Storage schema numbers only migrate the application's own persistence format and do not limit resource eligibility. Global schema 2 records deterministic revisions and manager-owned logical placement; it maintains `library/<origin>/<logical-resource>/revisions/<digest>/files` plus an atomic `current.json` projection for reusable Builtin/Network packages. Current-session workspace schema 1 stores reachability under `cache/session/project-media/`, shares the content-addressed `resources/blobs/` byte pool, and creates no `library/user` or chart-media projection. A shared CAS is an implementation detail, not a permanent media-library ownership claim.

## Selection and lifecycle

1. Main-program state maps semantic application slots to `ResourceRef` values, or supplies one operation-local explicit binding map without mutating global selection.
2. Main program refreshes catalogs and explicitly ensures selected resources are available.
3. Main program creates an immutable snapshot frozen to record revisions and file integrities.
4. A consumer receives only a `ResourceConsumerLease` for that snapshot.
5. The consumer reads declared files or object URLs and validates how it can use them.
6. The consumer releases the lease; object URLs are revoked and unreferenced obsolete blobs may be collected. Workspace reconciliation happens only after chart-media bindings are persisted, so a crash may leave an orphan for later cleanup but may not leave a persisted dangling ref.
7. Graceful process exit clears process-owned snapshot/transaction files and performs final CAS collection. Initialization clears the same transient directories after a crash; neither route changes global/workspace record ownership.

Catalog refresh, downloads and selection changes never mutate an active snapshot. No consumer performs a hot switch. Cross-window payloads carry only snapshot IDs and semantic resource keys.

## Integrity and failure policy

The manager validates non-empty bytes, complete package manifests, unique safe relative paths, byte length, SHA-256 and atomic transaction publication. Persistent content is reverified when acquired. Corrupted or incomplete resources are rejected and quarantined; there is no alias, silence, white texture, stale partial file or source-class fallback.

All 40 physical Builtins are explicit non-inlined Vite URL assets. The source manifest remains authoritative across development and production: the bundler may emit a content-hashed filename, but the bytes returned by that URL must retain the manifest length and SHA-256. Production build acceptance hashes `dist/assets` after Vite completes; successful compilation without that post-build byte gate is not a releasable resource payload. A runtime mismatch remains fail-closed and reports the logical path plus expected/observed integrity; the manifest must never be regenerated from transformed output merely to silence the failure.

Consumers own compatibility checks such as image/audio/video decode, required sprite/cue names and package structure. A compatibility rejection does not remove the resource globally or turn its observed digest into a future allowlist. The main program reports the incompatibility and requires another explicit selection.

## Dependency boundary

Only resource provider/composition code may import Vite assets, invoke Tauri resource commands, access resource network endpoints or create source-resource object URLs. Builtins are materialized through the same backend transaction and application-lifetime Snapshot/Lease as other bytes; synchronous UI hooks expose only already-open lease Object URLs, not Vite source URLs. Domain consumers receive leases and must not import `ApplicationResourceManager`; consumer-generated derivatives are owned and released with their lease.

Chart metadata contains no media URL. BGM, cover, MV and stage backdrop refs are persisted atomically in `chart-resources.v5.json`; v2 raw bytes and v3/v4 global refs are accepted only by one-time migration paths. A legacy identity that cannot be proved from committed bytes or its provider descriptor fails closed and is reported, never retained as an alias or replaced with a default.

The authorized Simulator migration is governed by [`simulator-resource-integration-contract.md`](./simulator-resource-integration-contract.md). Simulator continues to consume source-neutral Snapshot/Lease bytes; current-session ownership does not change Public Schema 12, original behavior, resource resolver or compatibility validation.
