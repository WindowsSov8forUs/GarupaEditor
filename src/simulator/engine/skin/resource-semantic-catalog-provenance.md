# Skin source-package semantic catalog provenance

`currentRenderSemanticCatalog.json` and `currentParticleSemanticCatalog.json` are production behavior profiles derived from the committed Reverse resource profile referenced by pushed closure `f461b287`:

```text
artifacts/investigations/simulator-skin-settings-complete-contract-10-1-4/skin_resource_profile.json
```

They contain no source UnityFS bytes, portable PNG/MP3 payload, provider URL, resource byte length, resource SHA-256 or runtime eligibility list.

- The render catalog retains only logical-resource roles, texture names, dimensions, mip count and serialized texture settings. Sprite/NGUI rows come from each leased Bestdori source package at runtime.
- The particle catalog retains only the 17 currently consumed gameplay roots and their evidence-backed system/module/renderer/material/texture semantics. It is globally deduplicated by semantic profile identity. Serialized/source hashes, source PathIDs and decoded pixel hashes are excluded.
- Non-finite serialized curve values use explicit JSON tags and are restored only by the Simulator semantic decoder.

A source package is compatible only when its exact logical Bundle identity, required container roots, source derivatives, texture names/dimensions, sprite rows and MP3 structure all validate. Unknown logical resources have no recipe and fail closed. These profiles do not turn a digest into an allowlist and do not authorize Live2D, character, CutIn, Fever or multiplayer owners.
