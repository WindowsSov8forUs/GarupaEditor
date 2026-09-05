# Skin source-package semantic catalog provenance

`currentRenderSemanticCatalog.json` and `currentParticleSemanticCatalog.json` are production semantic profiles for the locked `jp.co.craftegg.band` 10.1.4 / 230 / ARM64 domain. Original behavior authority remains verified, committed and pushed GirlsBandParty-Reverse evidence; production never reads Reverse, `tmp/` or testing fixtures.

## Source-bound identity

The particle catalog is Schema 2. Its locked current resource/state/GPU-pre scope is `closed-native-algorithm-equivalent` and covers:

- 27 logical particle resources;
- 1,375 concrete ParticleSystem components, including renderer-disabled systems;
- 1,147 enabled renderers and 114 control-flow signatures;
- all 152 reachable ordinary/directional Skin pairs;
- all current renderer/material/null-slot relations and four source meshes.

Each logical resource retains its application revision relation, official UnityFS and serialized-asset byte identity. Each system retains stable component PathIDs, serialized ordinal, self Transform, root→immediate-parent chain and ParticleSystem-parent flags. Renderer rows retain every material slot, renderer source digest, mesh pointer, sorting fields and GPU-pre handoff semantics. Texture rows retain source PathID, dimensions/settings and committed decoded-RGBA identity.

Names are diagnostics, not join keys. A system/profile/material/mesh/texture relation may be resolved only by its source-bound identity. Malformed or unknown current rows reject the whole selected pack; no row is skipped and no name/default/nearest fallback exists.

## Lease and prepared token

Application Snapshot/Lease owns the independent expected revision, file byte length and SHA-256. `OriginalResourcePackageView` rehashes each read against that receipt. The semantic sidecar must match the exact package revision/digest set; a hash calculated from the bytes under test is not an expected identity.

Default and selected Skin routes enter the same native-semantic validator. Encoded PNGs are rehashed and dimension-checked before browser decode; decoded metadata must match the source-bound profile. Ordinary, directional and source-bound Game-clear bundles are merged before backend creation into one immutable prepared token. Simulation and `PixiParticleRendererBackend` share that exact cached token and byte owner.

Game-clear adds 58 source ParticleSystems and 34 leased assets from Reverse `6cddb142806ffdb933cc6a237f69f4dd16e9ca97`. Only its two material-referenced textures enter the particle texture subset; the complete asset package remains available to the NGUI presentation. This is a set relation, not a literal-count eligibility gate.

## Algorithm and renderer boundary

Runtime random state belongs to each concrete `(owner generation, ParticleSystem component)` and follows the recovered auto/manual seed lifecycle. Canonical resource/path hashes and definition-global streams are forbidden. Shape 0/4/5/8/10 and no-Shape, module draw order, time/emission/capacity, parent order, Slide outer `n` versus ParticleSystem setup `g`, and renderer mode 0/1/4 are executed by the current native-semantic engine.

The engine emits immutable GPU-pre vertices, UVs, normals, colors, material pass and native sort order. Pixi is the final portable primitive executor. Browser font/texture raster, GPU/driver quantization, authored mip levels absent from leased PNGs, fixed-device framebuffer and context-loss behavior remain outside the algorithm-equivalence claim.

The render catalog remains source-bound to selected package sprites/atlases and does not authorize Live2D, character, CutIn, Fever, multiplayer or Stage 9 owners. Garupa continuous lanes and CS-V1 may reuse the closed presentation primitive but retain explicit `PRODUCT_ONLY` identity.
