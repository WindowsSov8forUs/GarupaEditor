# Clock Scheduling Runtime Oracle

## Scope

This investigation freezes native ARM64 runtime evidence for the original
`jp.co.craftegg.band` 10.1.3 (229) client. It covers 60-mode initialization,
dual music clocks, launcher lead, and one complete CC03 and CC08 activation and
commit lifecycle. It records unresolved gates explicitly and does not claim
that S02 is closed.

The source baseline is `74ab76f6838847d98aae1a15741a5f024e3774ff`.
Collection used Frida 17.15.3 observation-only interceptors on device
`FICIPZUGEIQC4P7H`; no process memory, arguments, return values, or control flow
were modified.

## Frozen Samples

- `残酷な天使のテーゼ EASY` (`087_thesis_easy`) starts at `85`/`"85"`.
  CC03 at bar 7, beat `0/1`, absolute position 1344 changes to
  `140`/`"140"`. Launcher lead initializes to 68 ticks. The BPM object is
  acquired and activated at frame 1133, commits at frame 1193, becomes
  inactive, and is removed synchronously by the callback.
- `幾億光年 EASY` (`653_ikuoku_easy`) starts at `99.5`/`"99.5"`.
  CC08 at bar 16, beat `0/1`, absolute position 3072 changes to
  `95.5`/`"95.5"`. Launcher lead initializes to the Float32 value
  `79.5999984741211` (`0x429F3333`). Object `0x765d320780` activates at frame
  2269, commits at frame 2329, and the active list changes `1 -> 0` inside
  `NoteManager.onBpmChanged`.

Both captures observe only `Application.targetFrameRate(60)` requests. The
requests prove original-client intent, not physical display cadence.

## Runtime Correction

The earlier static label for `NoteManager +0x74` was incomplete. In one process,
`NoteDataBMSBuilder.Initialize` leaves the BPM value and string lists intact.
Every gameplay parses the same BMS twice: normal then command. In the frozen
CC08 run, the list is already 22 entries long; the normal parse appends `95.5`
and changes `22 -> 23`, the command parse appends it again and changes
`23 -> 24`, while `NoteManager +0x74` is 23. The controller's actual current
BPM-command list contains exactly one item.

Therefore `+0x74` is a process-history-accumulated builder-list count captured
after the normal parse. It is not the current chart's command count. The start
BPM remains separate and is not appended.

## Artifact Layout

- `sources/` contains the exact BMS strings consumed by the original client.
- `traces/raw/*.jsonl.gz` are deterministic gzip streams of the unmodified raw
  JSONL output. `sample_manifest.json` records compressed and original bytes
  and SHA-256 values.
- `traces/normalized/` contains lifecycle events plus the adjacent
  frame/substep windows.
- `summaries/` contains initialization, BPM lifecycle, adaptive-step,
  scheduling, pause, and judgement-offset state.
- `closure.json` maps evidence sections and the production matrix to confirmed,
  partial, static-only, or unresolved status.
- `verify_runtime_oracle.py` verifies hashes, raw trace sequence monotonicity,
  event counts, lifecycle identity, callback removal, and fail-closed status.

Rebuild local derived artifacts with:

```powershell
py artifacts/investigations/clock-scheduling-runtime-oracle/build_runtime_oracle.py
```

Verify the committed package offline with:

```powershell
py artifacts/investigations/clock-scheduling-runtime-oracle/verify_runtime_oracle.py
```

## Confirmed

- CC03 and CC08 preserve numeric and original string BPM values through setup,
  `UpdateBPM`, inactive transition, callback, and immediate active-list removal.
- Launcher activation precedes the music-clock crossing by 60 captured frames
  in both samples.
- The CC08 trace preserves Float32 bits and ordered active Note/BPM list member
  pointers; the older CC03 trace preserves counts but predates those probe
  additions.
- CC08 builder snapshots prove normal/command double parsing and persistent
  process-history accumulation.
- `653_ikuoku_easy` is in `musicscore/musicscore660`; its 1,691-byte TextAsset
  becomes the 1,688-byte runtime string by stripping only the UTF-8 BOM.

## Pass 2

A second capture pass added seven runs on the same device and package. All seven are complete
collections (`collection_complete`, zero writer faults, host queue depth never above one batch)
and all used the client's own auto-play so each chart reaches its end without human input.

| Run | Covers |
| --- | --- |
| `ikuoku-cc08-run-020-scheduling-60` | 60-mode CC08 lifecycle, two-phase scheduling, live adaptive substeps |
| `ikuoku-cc08-run-021-pause-during` | pause and resume with a BPM command resident in the active list |
| `ikuoku-cc08-run-022-pause-bracket` | pause and resume before acquisition and after commit |
| `tentai-zero-run-023-warm-process` | zero-BPM-change chart after a BPM-change chart in the same process |
| `tentai-zero-run-024-fresh-process` | the same chart as the first chart of a fresh process |
| `ikuoku-cc08-run-025-offset-plus5` | positive judgement offset across a bar and across the BPM change |
| `ikuoku-cc08-run-026-offset-minus5` | negative judgement offset with a bar borrow |

### Adaptive history fallback: the frozen bucket-to-counter mapping was off by one

`artifacts/investigations/music-bar-division-adaptive-substeps/README.md` (G06) mapped the
fallbacks to `counter[0] > 100`, `counter[1] > 20`, `counter[2] >= 6` against buckets 0, 1, 2 and
left bucket 3 uncompared. Six runs disagree: every one of them collapses to a single substep on
exactly the frame where `counters[3]` reaches 6, and two of them do so while `counters[2]` is
still 1. Re-reading `NoteManager.ExecUpdate @ 0x37760C0` in
`artifacts/rhythm/decompiled_bundles/note.c` resolves it — the compared elements of the `uint[4]`
at `NoteManager+0x78` are `+0x24`, `+0x28` and `+0x2C`, i.e. `counters[1]`, `counters[2]`,
`counters[3]`. `counters[0]` is incremented for sub-`0.018` s frames and never compared. The
`101 / 21 / 6` boundaries themselves are unchanged.

### Zero BPM-change gate depends on process history

`tentai-zero-run-024-fresh-process` runs 3,100 frames with 3,100 clock substeps, zero adaptive
decisions and zero bucket increments. `tentai-zero-run-023-warm-process` plays the same chart in a
process that had already parsed a BPM-change chart and takes the adaptive path 1,726 times. The
single-step gate therefore reads the process-accumulated `NoteManager+0x74`, consistent with the
pass-1 correction.

### Pause and resume

Three brackets — before acquisition, during residency, after commit. In every one:
`InGameManager.ExecUpdate` keeps running (2,036–3,780 calls per freeze) while
`NoteManager.ExecUpdate` is not entered at all, and there are zero clock substeps, zero BPM
updates, zero note updates and zero batch activations. The frame after the resume is the
immediate successor of the frame before the pause and advances by one ordinary frame, so nothing
catches up the paused wall-clock time. The observed transition path is
`onExecutePause` (GameState 5, PauseState 0→1) → `onPauseSound` (GameState 5→7) →
`onClickResume` (PauseState 1→0) → `onFinishResumeCountdownAnimation` (PauseState 0→2) →
`resumeGame` (GameState 7→5). `InGameStateController.ChangeGameState` produced no event.

### Judgement offset

`FastAbsolutePos` and `SlowAbsolutePos` step exactly `|offset|` times of 1/60 s each, and every
step re-reads the tempo at the cursor rather than reusing the call-site `CurrentBPM`. Run 025
frame 991: steps 0–3 advance 1.32667 ticks at BPM 99.5 inside bar 15, step 4 carries into bar 16
and reads BPM 95.5, step 5 advances 1.27333 ticks. Run 026 shows the negative direction borrowing
a bar (bar 5 beat 0.4548 → bar 4 beat 191.1282).

### Collection boundaries for pass 2

- The agent's per-frame snapshots slow the client to roughly 20 fps. The 2/3/4-substep samples are
  collector-induced slow frames, not an injected stall; these runs prove the branch mapping, not
  the delta distribution of an untraced client.
- The seven pass-2 runs used auto-play, which supplied input judgement and suppressed judgement
  display. The 10.1.4 runs captured after incident 9 use no auto-play and do not carry this boundary.
- `LiveCoreSettings.get_IsHighFrequencyMode` produced no event in any pass-2 run, so the 120
  branch still has no frozen consumer evidence.

## 10.1.4 / 230 — the locked version

`10.1.4 / 230` is the locked package version for this investigation's final evidence. The
capture device auto-updated after pass 2, and the choice was to re-capture on the new version
rather than downgrade. The 10.1.3 samples stay frozen exactly as they are: they remain a closed
sample for that version and cross-version corroboration for this one, and are never merged with
10.1.4 traces.

The matrix that gates `S02` is therefore `closure.json` → `version_10_1_4.sample_matrix`. The
top-level `sample_matrix` records the 10.1.3 sample set.


The capture device auto-updated after pass 2. `libil2cpp.so` differs across almost every 64 KiB
block, so the target set was re-proven before any further capture:
`artifacts/investigations/package-version-rebaseline-10-1-4/` — 70 hooks re-resolved by name with
unchanged signatures, all 7 probe instructions bit-identical at the same offsets, all 6 `.rodata`
constants re-located with unchanged bit patterns, and no field offset moved in the eight types the
agent reads. `capture_clock_scheduling_runtime.py` now picks its address table from the version
installed on the device and refuses any version it has no proven table for.

Runs taken on 10.1.4 live under `version_10_1_4_runs` in `sample_manifest.json` and the
`version_10_1_4` section of `closure.json`. They are **not** merged with the 10.1.3 samples and
close no 10.1.3 row.

### Captured on 10.1.4 so far

| Run | Events | Covers |
| --- | ---: | --- |
| `ikuoku-cc08-run-030-120-mode` | 47,712 | 120 request, CC08 lifecycle |
| `settings-run-031-high-frequency-toggle` | 176 | frame-rate setting UI owner |
| `ikuoku-cc08-run-032-scheduling-60` | 47,030 | 60 request, CC08 lifecycle, cross-bar, two-phase scheduling, adaptive |
| `ikuoku-cc08-run-033-pause-bracket` | 56,799 | pause before acquisition, pause after commit |
| `tentai-zero-run-034-fresh-process-manual` | 26,072 | fresh-process normal zero-BPM-change, no auto-live |
| `ikuoku-cc08-run-035-pause-during-setup` | 45,027 | CC08 Setup and pause entry with the BPM object resident |
| `ikuoku-cc08-run-036-pause-during-resume` | 13,685 | same-process resident pause, resume and BPM commit |
| `thesis-cc03-run-037-nonzero-60` | 36,309 | 60-mode CC03 lifecycle, 85→140 BPM |
| `ikuoku-cc08-run-057-offset-plus5` | 40,811 | +5 fast crossing, bar 15→16 and BPM 99.5→95.5 |
| `ikuoku-cc08-run-059-offset-minus5` | 38,253 | -5 slow crossing, bar 16→15 retaining BPM 95.5 |
| `ikuoku-cc08-run-060-full-note-detail` | 22,854 | reverse-index main active-list Update order, 16/16 multi-member substeps |

All eleven are complete collections with zero writer faults. Run 034 closes
`normal_zero_bpm_60` on the locked version with 763 frames, 763 clock substeps, and no adaptive
decision or bucket increment. Runs 035 and 036 close `pause_during_bpm` as a split capture of one
process and one BPM object: no clock, note or BPM-object update occurs while frozen, and resume
restarts the clock before committing BPM 95.5.

### Closed continuation row and explicit runtime boundaries on 10.1.4

Run 060 closes reverse-index ordering: all 16 sampled multi-member substeps update the main
active-list members in exact reverse list order after nested child updates are filtered by pointer
membership.

Runs 061–067 bracket the adaptive collector configurations without autoplay or touch injection.
Heavy hooks perturb frames into buckets 2/3; light hooks sustain bucket 0, with at most two
isolated bucket-2 frames and no bucket-1 frame. The `counter[1]`/`counter[2]` dynamic thresholds
are therefore blocked by observation-induced perturbation/runtime reachability, not left as an
ordinary capture TODO.

The cached production inventory contains 81 musicscore bundles and 4,176 BMS assets. Only 445
contain BPM commands and the maximum is 16, so no current chart can produce the 31 acquisitions
needed to wrap the 30-slot BPM cursor. The machine-readable inventory is
`summaries/cached_bpm_candidates_10_1_4.json`.

### The 120-mode request, which 10.1.3 never closed

The frame-rate setting is `フレームレート` in the `ライブ演出・音量設定` tab, owned by
`LiveEffectVolumeTabPage` — which is why searching the `ライブ設定` tab during pass 2 found
nothing. `InGameDirector.Awake` reads `LiveCoreSettings +0xA9` **inline**, which is why the hook
on `LiveCoreSettings.get_IsHighFrequencyMode` never fired.

With `120FPS` selected, `ikuoku-cc08-run-030-120-mode` records exactly one target frame rate
request inside `InGameDirector.Awake`, and it is `120` — the same position in the same call where
the 60-mode runs request `60`. The request proves original-client intent, not physical display
cadence.

The same run corroborates the frozen 10.1.3 closure across versions: byte-identical consumed BMS,
launcher lead `79.5999984741211`, start BPM `99.5`/`"99.5"`, committed `95.5`/`"95.5"`.

Still open on 10.1.4: the UI change callback
(`LiveEffectVolumeTabPage.<initializeHighFrequencyMode>b__57_0`) resolved by name with an
unchanged signature but produced no event when the radio was switched. Compiler-generated lambda
names are positional, so that name may denote a different closure in the new build. The setting
source is closed by the read site and the UI owner, not by this callback.

## Unresolved

- The HABAHIRO zero-change row cannot be captured at all on this account: `786 miracle_april`
  SPECIAL is exclusive to a limited-time event and is not selectable outside that window. The row
  stays blocking, but as an availability boundary rather than a collection gap — it must not be
  substituted with a synthetic chart or another wide-lane chart.
- The 30-slot BPM cursor-wrap sample is blocked by production chart availability: the complete
  cached inventory has at most 16 BPM commands per chart.
- The slow-frame 2/3/4 substeps remain collector-induced. `counter[3] = 6` is dynamic; the
  `counter[1]`/`counter[2]` thresholds remain fail-closed at the observation/reachability boundary.
- HABAHIRO zero-change 60-mode remains unavailable until its limited-time chart returns.

These unresolved items keep S02 blocked and S03-S10 fail closed.
