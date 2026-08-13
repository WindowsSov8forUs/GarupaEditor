# Simulator evidence-integrity audit

This directory is the committed, machine-checkable statement of the simulator's production scope. It is not Reverse evidence and does not authorize behavior by itself.

Rules:

- `current-capability-matrix.json` classifies every public production capability as supported, explicit degraded preview, excluded, or evidence-required before mutation.
- `current-claim-ledger.json` limits wording in committed documentation and test output. A test pass proves only the named gate.
- Reverse remains the only behavioral source. Every supported row names committed Reverse evidence and a production-path observation requirement.
- A Reverse `productionAuthorization` field permits implementation; it never proves Garupa consumption.
- Recording backends, source markers, synthetic textures, or a self-authored `status: closed` field cannot close a positive production gate.
- `browser-decode-integration` and fixed-device framebuffer/audio gates remain separate from Pixi command/scene routing.
- Repository-local ignored working material is not an acceptance authority and must not be cited by committed files.

Status vocabulary:

- `closed-portable`: supported only within the listed portable/semantic scope.
- `degraded-explicit`: available only after explicit caller selection and with visible plus machine-readable fidelity disclosure.
- `excluded`: intentionally not implemented and not part of completion claims.
- `open-evidence-required`: rejected before resource/backend/domain mutation.
- `open-device-exact`: physical device parity is not claimed.
- `unauthorized-stage-9`: main-program integration is outside this branch.
