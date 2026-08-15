# Simulator mixed-authority integrity audit

This directory describes the current production boundary; it is not behavior authority by itself.

## Authority model

The pushed Reverse ledger `b5fb3dca34b26511355879d62839661c5cf505d3` freezes Garupa release `2b758eb6c40632c8c658e97772b9cb7afb5785fd`. It remains the baseline for unchanged judgement, Life, HUD presentation, resources, audio, particles, and runtime behavior, but it does **not** cover the later custom Score implementation.

GarupaEditor CS-V1 Score is a product contract defined by [`../scoring-contract.md`](../scoring-contract.md). [`current-product-scoring-delta.json`](./current-product-scoring-delta.json) binds every changed production file to exact SHA-256 values, symbols/formulas, mutation boundaries, retained Reverse behavior, and one of nine product claims. It never claims original score parity.

CS-V1 invariants include chart-owned scoring-unit identity, `scoreMaximum=10,000,000+N`, BigInt quota allocation, normalized Manual result rates without a Combo score multiplier, Auto Perfect quota, fixed Rank thresholds, and a Life-only Public gameplay input. Caller-authored master, ruleset, N, quota, level, parameter, or Auto coefficient is rejected before resource acquisition.

## Current observations

- Independent full-chart traversal: 1,007 scoring units.
- Auto final Score: 10,001,007.
- Production browser decoders: `BrowserPixiTextureDecoder` and `BrowserPixiParticleTextureDecoder`.
- Ordinary combined scene: particle before Note/HUD.
- WebView2 151.0.4129.78: three fresh processes, 17 captures each.
- CS-V1 aggregate digest: `ff6e7584988dc0ad32074858e52beed608ed19b6623c6558402dcef84bdf396c`.

The digest is a locked portable regression observation, not an original Unity or cross-GPU framebuffer oracle.

## Unchanged non-positive boundaries

HABAHIRO original parity remains `open-evidence-required`; fixed-device physical exact remains `open-objective-environment-blocked`; character/card/deck effects, Fever, and multiplayer remain `excluded`; Stage 9 main-program integration remains `unauthorized-stage-9`.
