# Music Bar Division and Adaptive Substeps

## Scope

This investigation closes first-slice gaps G01 and G06 for
`jp.co.craftegg.band` 10.1.3 (`229`), `arm64-v8a`.

## G01: Music Position Unit

Managed metadata declares `NoteManager.MUSIC_BAR_DIVISION_COUNT` as the first
static `int` field of `NoteManager`. `NoteManager..cctor @ 0x377E334` writes
`0xC0` to that field, so the confirmed value is `192`.

`InGameMusicScoreController.get_MusicPos` and `get_LauncherMusicPos` read that
same static field. Their returned absolute position is:

```text
progressWithinBar + 192 * completedBarCount
```

`UpdateMusicScoreProgress(deltaTime)` uses `NoteUtility.GetBarSeconds(bpm) =
240 / bpm`, therefore each clock advances by:

```text
progressWithinBar += deltaTime / ((240 / bpm) / 192)
```

When progress reaches or exceeds `192`, the recovered method subtracts `192`
once and increments the corresponding bar counter once. It contains no loop for
multiple-bar overflow in one call.

`NoteBatchInformation..ctor` computes its integer `absolutePos` as:

```text
barIndex * 192 + (denominator == 0 ? 0 : numerator * 192 / denominator)
```

The division is signed integer division. `NoteUtility.IsNoteActivateJustNow`
rejects a first member whose `barIndex` is already behind `MusicBarProgress`.
For a nonempty valid batch it activates only when:

```text
MusicPos < batch.absolutePos && batch.absolutePos <= LauncherMusicPos
```

An empty member list is accepted immediately by `NoteManager.canActivateNote`.

The former semantic placeholder `UnitsPerBar` is therefore replaced by the
confirmed managed name `MUSIC_BAR_DIVISION_COUNT` and confirmed value `192`.

## G06: Adaptive Substep History

`NoteManager..ctor @ 0x377E0C0` allocates a persistent four-element `uint`
counter array at instance offset `+0x78`. `analyzeBMS @ 0x377CD50` writes the
parsed BPM-change count to `+0x74`. `ExecUpdate @ 0x37760C0` enables adaptive
substeps only when that count is at least one.

The selected delta-time bucket is incremented before fallback evaluation:

| Bucket | Delta time | Initial steps | Counter | Fallback after increment |
| --- | --- | ---: | --- | --- |
| 0 | `< 0.0179999992` | 1 | `+0x20` | never compared |
| 1 | `< 0.0329999998` | 2 | `+0x24` | `counter[1] > 100` |
| 2 | `< 0.0500000007` | 3 | `+0x28` | `counter[2] > 20` |
| 3 | otherwise | 4 | `+0x2C` | `counter[3] > 5` |

Consequently the 101st bucket-1 sample, 21st bucket-2 sample, and 6th bucket-3
sample use one step. Once any compared persistent counter reaches its fallback
condition, subsequent adaptive updates also use one step. When the parsed
BPM-change count is zero, `ExecUpdate` uses one step and does not increment any
counter.

### Second pass: the bucket-to-counter mapping was off by one

The first pass of this investigation attributed the three fallback comparisons to
buckets 0, 1 and 2 and left bucket 3 uncompared. That mapping is wrong. The
comparison operands in `ExecUpdate @ 0x37760C0` are `+0x24`, `+0x28` and `+0x2C`,
which are `counter[1]`, `counter[2]` and `counter[3]`; `counter[0]` is
incremented for sub-`0.0179999992` frames and never read back.

`artifacts/investigations/clock-scheduling-runtime-oracle` (pass 2) closes the
same conclusion dynamically: six runs collapse to a single substep on exactly the
frame where `counter[3]` reaches 6, and two of them do so while `counter[2]` is
still 1, which the earlier mapping cannot produce. The `101 / 21 / 6` boundaries
themselves are unchanged; only their owning buckets are corrected.

Before selecting the adaptive count, `ExecUpdate` computes `ExecuteFrame` as
`min(deltaTime * 60, 1.0)` for nonnegative delta time. It then divides both
`deltaTime` and `ExecuteFrame` by the final step count.

## Confirmed Facts

- `MUSIC_BAR_DIVISION_COUNT` is the original managed field name and its value is
  exactly `192`.
- Both main and launcher music positions use the same division count.
- Batch absolute-position construction and the open-current/closed-launcher
  activation window are closed statically.
- The adaptive counters are persistent instance state initialized to four zeroes.
- Bucket comparisons, post-increment ordering, fallback thresholds, and the
  BPM-change activation gate are closed statically.
- The final substep count divides both seconds and 60 Hz frame progress.

## Inference

None is required by the first-slice implementation. Human-readable names such
as "performance counters" describe the recovered role but are not claimed as
managed field names.

## Unresolved

- The design reason for the asymmetric `100`, `20`, and `6` thresholds is not
  present in managed metadata. It does not affect executable behavior.
- Negative `deltaTime` is outside the observed gameplay caller contract and is
  not assigned replacement behavior by this investigation.

## Reproduction

```powershell
python artifacts\investigations\music-bar-division-adaptive-substeps\verify_music_bar_division_adaptive_substeps.py
```
