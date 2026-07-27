# Package Version Rebaseline 10.1.3 → 10.1.4

## Question

The capture device updated `jp.co.craftegg.band` from 10.1.3 / 229 to 10.1.4 / 230 on
2026-07-27, after the second clock-scheduling capture pass. Which addresses and offsets does the
clock-scheduling capture need on the new build, and does anything it depends on behave
differently?

## Result

The migration is a pure address translation. All 70 hooks, 7 instruction probes and 6 `.rodata`
constants resolve on 10.1.4, no managed signature changed, no probe instruction changed, and no
field offset moved in any of the eight types the capture agent reads.

| Item | Count | Outcome |
| --- | ---: | --- |
| Managed method hooks | 70 | all re-resolved by `Owner$$Method`, all signatures unchanged |
| Instruction probes | 7 | all bit-identical at the same offset inside their owner |
| `.rodata` Float32 constants | 6 | all re-located by unique context match, bit patterns unchanged |
| Types read by the agent | 8 | no field added, removed or moved |

This does **not** make 10.1.3 evidence valid for 10.1.4 or the reverse. It makes the *capture
tooling* usable on 10.1.4; the sample matrix must still be re-captured, because the requirements
forbid merging traces from different package versions into one closed sample.

## Binaries

| | 10.1.3 / 229 | 10.1.4 / 230 |
| --- | --- | --- |
| `libil2cpp.so` | `66C9C666…D1D9FA`, 119,819,736 B | `815DF625…F058D8F`, 119,816,840 B |
| `libunity.so` | `1936D775…C83378` | byte-identical |
| `global-metadata.dat` | `B485E5BB…7D87FE` | `298D92CB…12961F` |
| Metadata / Il2Cpp version | 31 / 31 | 31 / 31 |
| CodeRegistration | `0x687D758` | `0x687CD38` |
| MetadataRegistration | `0x6AAFB10` | `0x6AAF1C0` |

`libil2cpp.so` differs across 1,748 of 1,829 64 KiB blocks, so nothing could be carried over by
assumption.

## Address Movement

Method addresses shifted by only three distinct deltas, and the whole `.rodata` block by one:

| Delta | Methods |
| ---: | ---: |
| `-3772` | 39 |
| `-3672` | 28 |
| `-2628` | 3 |
| `-960` | all 6 constants |

The clustering is itself corroboration: a name-based remap that produced scattered per-method
deltas would suggest the resolution, not the binary, had changed.

## Probe Identity

Each probe sits on one exact instruction. Comparing each owner's full byte range word by word:

| Owner | Size | Differing words | Non-PC-relative | Probe words |
| --- | ---: | ---: | ---: | --- |
| `NoteManager.ExecUpdate` | `0x38C` | 30 | 12 | all identical |
| `NoteManager.FastAbsolutePos` | `0x260` | 35 | 12 | all identical |
| `NoteManager.SlowAbsolutePos` | `0x200` | 33 | 12 | all identical |

| Probe | Offset in owner | Word |
| --- | --- | --- |
| `ExecUpdate.deltaAndPreDivisionExecuteFrame` | `+0x88` | `0xB40013E0` |
| `ExecUpdate.slowBucketIncrement` | `+0x148` | `0xB900014B` |
| `ExecUpdate.substepDecision` | `+0x188` | `0x1E2202C1` |
| `FastAbsolutePos.stepHead` | `+0xE4` | `0x1E220100` |
| `FastAbsolutePos.stepBpm` | `+0x1D4` | `0x1E281821` |
| `SlowAbsolutePos.stepHead` | `+0xE0` | `0x1E220100` |
| `SlowAbsolutePos.stepBpm` | `+0x188` | `0x1E281821` |

The non-PC-relative differences are `LDR`/`LDRB` immediates addressing IL2CPP's per-version
global tables, not the instructions the probes read. Every one is recorded in
`version_map.json` under `probe_owners[].differing_word_detail` so a behavioural change cannot
hide behind the summary.

## Constants

All six constants keep their bit patterns and were confirmed again from the live 10.1.4 process
by a smoke capture, not only from the file:

| Constant | 10.1.4 RVA | Float32 | Bits |
| --- | --- | ---: | --- |
| `substep_threshold_two` | `0x153642C` | `0.017999999225139618` | `0x3C9374BC` |
| `substep_threshold_three` | `0x15363A8` | `0.032999999821186066` | `0x3D072B02` |
| `substep_threshold_four` | `0x1536398` | `0.05000000074505806` | `0x3D4CCCCD` |
| `execute_frame_cutoff_and_fast_step_seconds` | `0x15366A8` | `0.01666666753590107` | `0x3C888889` |
| `slow_step_seconds` | `0x1536008` | `-0.01666666753590107` | `0xBC888889` |
| `judgement_adjust_range_and_b_max` | `0x1532A50` | int `30`, next `5` | `0x0000001E` |

## Confirmed

- The clock-scheduling algorithm surface did not change between 10.1.3 and 10.1.4: same method
  set, same signatures, same field layout, same adaptive thresholds, same probe instructions.
- `capture_clock_scheduling_runtime.py` now selects its address table from the version installed
  on the device and refuses any version it has no proven table for, so a trace can no longer be
  taken against an unproven build by accident. The table used is recorded in every capture's
  metadata as `address_table`.
- A smoke capture on 10.1.4 installs all 70 hooks and 3 armed probes with zero script errors and
  reads all six constants at their migrated addresses.

## Inference

None. Every row in `version_map.json` is derived mechanically from the two dumps and the two
binaries.

## Boundary

- Name-based resolution proves *identity of the managed method*, and the byte comparison proves
  *identity of the probe instruction*. Neither proves the whole function body is semantically
  unchanged; the differing-word detail is recorded so that claim is never implied.
- Only the eight types the capture agent reads were checked for layout. This says nothing about
  the rest of the binary.
- The global `artifacts/` index layer is still built from the 10.1.3 dump. This investigation
  migrates one bounded target set, not the navigation baseline.

## Unresolved

- Whether to migrate the tracked index layer to 10.1.4 at all. Doing so would rewrite every
  index and invalidate the hashes each frozen investigation cites, so it needs its own decision
  rather than being a side effect of this migration.

## Reproduction

Regenerate the map from the local-only inputs (both dumps and both binaries):

```powershell
py artifacts/investigations/package-version-rebaseline-10-1-4/extract_version_rebaseline.py
```

Verify the committed map offline, with no device, network or binaries:

```powershell
py artifacts/investigations/package-version-rebaseline-10-1-4/verify_version_rebaseline.py
```
