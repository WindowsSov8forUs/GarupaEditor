# Manual Input Runtime Contract — 10.1.4

## Question

What version-matched static and runtime evidence is required to reconstruct manual touch input,
judgement windows, Flick/Multiple movement, Long/Slide hold and release, and natural timeout Miss
behavior for `jp.co.craftegg.band` 10.1.4 / 230 on `arm64-v8a`?

## Version Boundary

The target is the current rooted native ARM64 device sample:

- package: `jp.co.craftegg.band`;
- version: 10.1.4 / 230;
- `libil2cpp.so` SHA-256:
  `815DF62582B35F3EF2223AB033FAC6DC909DE492D548DD28950BF1F98F058D8F`;
- `global-metadata.dat` SHA-256:
  `298D92CB0DC44B11681C5478F3BB08CE5476321361CE962096095CC31812961F`.

The earlier touch investigations are 10.1.3 / 229 evidence. They supply a migration target list,
not target-version behavior. The extractor resolves every managed method again by
`Owner$$Method`, compares signatures and globally adjacent method boundaries, exports the exact
10.1.4 ARM64 range, and compares all fields and enums used by this investigation. No uniform RVA
delta is assumed.

The clock-scheduling investigation was separately re-captured on 10.1.4 and remains closed. Its
version migration does not substitute for this manual-input target set.

## Static Result

The static gate is closed:

- 99/99 bounded methods resolve uniquely on both versions;
- every managed signature is unchanged;
- every 10.1.4 range has the same byte length as its 10.1.3 counterpart;
- all changed branch/ADR words retain their ARM64 PC-relative instruction class;
- every remaining changed word differs only in the unsigned 12-bit displacement used for
  IL2CPP per-version global tables; register, opcode and access width remain identical;
- all fields of 12 input/judgement owner types are unchanged;
- all members of 8 input/judgement enums are unchanged.

This is stronger than address translation: `arm64/` contains the current-version instruction
range for every target, and `manual_input_static_contract.json` records both exact function hashes
and every differing word.

## Corrected Slide Wait Boundary

The old 10.1.3 Hex-Rays exports for `NoteSlide.WaitState` and
`NoteSlide.execOverWaitState` were contaminated by a merged cfunc. The current evidence does not
copy those C files. Metadata and exact 10.1.4 ARM64 establish two independent methods:

| Method | 10.1.4 range | Size |
| --- | --- | ---: |
| `NoteSlide.WaitState` | `0x321B414–0x321B628` | 532 bytes |
| `NoteSlide.execOverWaitState` | `0x321B628–0x321B69C` | 116 bytes |

Their current binary hashes differ and their disassembly files are independently bounded. This
closes the static boundary conflict without treating the old merged pseudocode as evidence.

## Confirmed Static Values

The current 10.1.4 ARM64 directly fixes these values and comparisons:

- `InputManager` allocates its `buttonWithFingerIdArray` with length 15.
- `TouchPhase` is Began 0, Moved 1, Stationary 2, Ended 3, Canceled 4.
- `NoteResultType` is None -1, Miss 0, Bad 1, Good 2, Great 3, Perfect 4.
- `JudgeTiming` is None 0, Fast 1, Slow 2.
- `NoteBase.fingerId` remains at `+0xC0`; `InputManager.buttonWithFingerIdArray` remains at
  `+0x20`; `GamePlayButton` touch-origin/note arrays remain at `+0x60/+0x68`.
- `NoteFlick.ExecTouchMoved` loads Float32 `0.04` from target RVA `0x1536460` and rejects
  `<=`, therefore success is strict `> 0.04`.
- Directional Flick loads Float32 `0.01` from target RVA `0x1536580` and uses `gt`.
- Long and Slide movement paths encode grace reset `8.0` directly as ARM64 `FMOV`.
- `NoteUtility.GetResult` rounds against 60.0 and uses exclusive upper bounds
  `sweetFrame + 3/+6/+7/+8`.
- `NoteUtility..cctor` stores Float32 bits `0x3E5DDDDE`
  (`0.21666666865348816`) into `MissSecondInterval`.

The exact movement, ownership, candidate, release and timeout ordering is represented by the
current instruction ranges and summarized in `manual_input_static_contract.json`. Runtime traces
remain required for equal-distance candidate arbitration, physical coordinate conversion,
multi-touch identity, Slide band contents, exact threshold boundary inputs, simultaneous Miss
ordering and whole-frame lifecycle/mutation combinations.

## Capability

Static extraction uses local-only locked binaries and metadata and writes only bounded evidence.
Runtime work for this investigation is explicitly R1: observation-only function hooks and memory
reads on the rooted native ARM64 device. It does not replace return values, write process memory,
patch APKs, or persist modified libraries.

## Boundary

- Structural identity across versions does not merge 10.1.3 and 10.1.4 evidence. All confirmed
  files under this directory contain 10.1.4 addresses and bytes.
- IL2CPP global-table displacement changes are accepted only because the exact opcode/register
  shape is verified and the target managed identity/signature is resolved independently.
- Presentation effects, sound, score/life/skill consumers, Unity rendering and application input
  integration are outside this investigation.
- No runtime claim is closed by the static gate alone.

## Reproduction

From the repository root, with the two local-only dumps and binaries present:

```powershell
py artifacts\investigations\manual-input-runtime-contract-10-1-4\extract_manual_input_contract.py
py artifacts\investigations\manual-input-runtime-contract-10-1-4\verify_manual_input_contract.py
```
