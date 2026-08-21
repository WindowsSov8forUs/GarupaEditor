# Application-Owned Resource Management Contract

## Authority

`ApplicationResourceManager` is the only production authority for locating, acquiring, installing, importing, snapshotting and releasing application resources. A consumer may interpret bytes for its own rendering/audio/movie contract, but it may not select a physical resource, consult a network source, read a path, persist bytes or choose fallback content.

This product contract is not Reverse evidence and does not change any original-game behavior claim. Simulator integration is separately authorized by `simulator-resource-integration-contract.md`; it must replace the simulator-owned store without weakening the source-neutral lease or consumer validation boundaries.

## Source classes

| Origin | Identity owner | Persistence | Update rule |
| --- | --- | --- | --- |
| `builtin` | application builtin catalog | shipped frontend resource | generated integrity describes the current application payload |
| `network` | live provider catalog | verified app-data package/blob | same source-native ID may publish new observed bytes without code changes |
| `user` | application import transaction | verified app-data blob | immutable imported media identity |

User imports are limited to BGM, cover, MV and stage backdrop. Skin, SE, HUD, particle and font imports are not exposed.

Consumers do not branch on origin. Every selected resource enters a consumer through a resource snapshot and lease.

## Identity and no-version-lock rule

A `ResourceId` is a stable source identity, not a content revision or game-version identity. Runtime IDs must not contain an application release, original-game release or `current-*` namespace. Network candidates are obtained from a live catalog or its last complete offline snapshot; hard-coded fallback candidate inventories are forbidden.

SHA-256 and byte length are **observed integrity** generated after builtin packaging, network download or user import. They detect incomplete or locally corrupted bytes. They are not compiled network allowlists. If a provider changes bytes under the same native ID, a complete new transaction becomes the current record and future snapshots may select it. Existing snapshots retain their already acquired blobs until release.

Storage schema numbers only migrate the application's own persistence format and do not limit resource eligibility.

## Selection and lifecycle

1. Main-program state maps semantic application slots to `ResourceRef` values.
2. Main program refreshes catalogs and explicitly ensures selected resources are available.
3. Main program creates an immutable snapshot of the required slots.
4. A consumer receives only a `ResourceConsumerLease` for that snapshot.
5. The consumer reads declared files or object URLs and validates how it can use them.
6. The consumer releases the lease; object URLs are revoked and unreferenced obsolete blobs may be collected.

Catalog refresh, downloads and selection changes never mutate an active snapshot. No consumer performs a hot switch. Cross-window payloads carry only snapshot IDs and semantic resource keys.

## Integrity and failure policy

The manager validates non-empty bytes, complete package manifests, unique safe relative paths, byte length, SHA-256 and atomic transaction publication. Persistent content is reverified when acquired. Corrupted or incomplete resources are rejected and quarantined; there is no alias, silence, white texture, stale partial file or source-class fallback.

Consumers own compatibility checks such as image/audio/video decode, required sprite/cue names and package structure. A compatibility rejection does not remove the resource globally or turn its observed digest into a future allowlist. The main program reports the incompatibility and requires another explicit selection.

## Dependency boundary

Only resource provider/composition code may import Vite assets, invoke Tauri resource commands, access resource network endpoints or create source-resource object URLs. Domain consumers receive leases and must not import `ApplicationResourceManager`; consumer-generated derivatives are owned and released with their lease.

Chart metadata contains no media URL. BGM, cover, MV and stage backdrop refs are persisted atomically in `chart-resources.v3.json`; v2 bytes/Data URLs are accepted only by the one-time migration path.

The authorized Simulator migration is governed by [`simulator-resource-integration-contract.md`](./simulator-resource-integration-contract.md). Until its assembly and Stage 9 acceptance gates close, the old static store remains an implementation baseline only and must not be described as already migrated.
