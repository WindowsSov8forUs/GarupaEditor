# Simulator Resource Integration Contract

## Authority

The main program owns every production resource identity, source, catalog, transaction, record revision, blob, selection, snapshot, lease and garbage-collection decision. Simulator code owns only semantic requirements and compatibility/decoding of leased bytes.

This is a GarupaEditor product architecture contract. Original logical resource names and current consumer behavior are evidence-backed by pushed Reverse commit `f461b287`; the application storage layout itself is not claimed as original-game behavior.

## Physical and logical boundary

The observed original Android cache stores `AssetBundleInfo` and hash-named payloads under `files/data`. Names such as `ingameskin/noteskin/skin00`, `sound/common`, `sound/bgm003`, `musicjacket/...` and `movie/mv/...` are logical Bundle names.

GarupaEditor keeps `resources/blobs/` as its only byte authority. It may expose an auditable `resources/library/` projection organized by those logical names, with immutable revisions and an atomic `current.json` pointer. That projection is a product index, not a clone of the original physical cache. Consumers never read it by path; they read only frozen Snapshot/Lease bytes.

## Identity

Resource IDs are stable source-native identities:

```text
builtin/application/...
builtin/game/<original-logical-path>
bestdori/<server>/<original-logical-path>
user/media/<opaque-id>
```

An ID must not contain an application version, game version, `current-*`, a download URL or an observed digest. Provider URLs are acquisition metadata only. SHA-256 and byte length describe acquired bytes and record revisions; they are not network eligibility allowlists.

A same-ID update commits a new immutable record revision. Existing snapshots continue to reference their previous revision and blobs. Only a later snapshot observes the new record.

## Consumer boundary

Simulator production code must not import `src/resources`, React, Tauri or editor types. `src/simulator/platform/resourceContracts.ts` defines exact neutral semantic requirements and a source-blind lease. The app adapter requires an explicit main-program binding for every logical resource, ensures records are available, creates one operation-local immutable snapshot without mutating global selection, validates exact required files and exposes only logical file metadata/bytes.

The Public business request remains exactly:

```ts
launchSimulatorModule({ chartData, presentation, config })
```

Resource IDs, snapshot IDs, source URLs, paths, digests, providers and platform surface data are not Public fields. Session BGM, jacket, stage and MV bytes are built from the same frozen app snapshot before Public validation.

## Catalog and compatibility

The current dynamic JP catalog covers all 133 locked Skin-package logical identities. The 130 Standard/MV package manifests contain the required family source derivatives; three `ingameskin/stageskin/*` packages remain catalogued but excluded because their original consumer is Live2D-only.

Future resources may be catalogued, installed and retained without a new application release. A current Simulator consumer may use one only when its evidence-backed resolver and semantic structure checks accept it. Compatibility rejection does not delete the record and never triggers a default, alias or old-revision fallback.

All source files in selected SE and particle packages may be installed. Simulator publishes only Reverse-confirmed cues and its current 17 gameplay particle roots. Resource presence does not authorize character, CutIn, Fever, multiplayer or Live2D behavior.

## Storage and projection

Each record stores:

- a stable ResourceRef;
- one immutable record revision;
- a canonical logical placement;
- file media types and observed integrity;
- blob references.

The library projection uses:

```text
library/<origin-and-provider>/<logical-resource>/
  current.json
  revisions/<package-digest>/files/...
```

Projection files prefer hard links to authoritative blobs. A platform that cannot hard-link may copy and immediately verify byte length and SHA-256. Path segments must reject traversal, absolute paths, reserved names, case collisions and Unicode-normalization collisions.

Snapshot reads always resolve stored blob refs, never projection paths. Garbage collection retains current records, persistent snapshots and open leases, and deletes only unreachable blobs and projection revisions.

## Failure and lifecycle

All required resources are acquired and decoded before backend, scene or engine mutation. A launch failure releases its snapshot exactly once. An accepted session retains it until the Public `closed` receipt settles, then releases object URLs and the lease exactly once.

Missing, offline-without-cache, partial, corrupt, unsafe, ambiguous or incompatible resources fail closed. Forbidden replacements include default Skin, stale revision, silent audio, white texture, nearest-name aliases, image MV and standard-stage-on-movie-fault.

Catalog refresh and selection changes never hot-switch an active session. Retry and MoveTime continue to use the session's frozen resource revision.
