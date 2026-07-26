# BPM Change Consumer

## Question

How do the BMS start BPM and CC03/CC08 commands become the live tempo map,
and when does `NoteBpmChange` update the music-score controller?

The investigated sample is `jp.co.craftegg.band` 10.1.3 (`229`),
`arm64-v8a`.

## Result

`NoteDataBMSBuilder.parseHeaderData` stores a plain `#BPM ` value separately as
`startBpm` and `StartBpmString`. CC03 parses each two-character cell as a
hexadecimal BPM, while CC08 resolves its cell through the `#BPMxx` dictionary.
Only CC03/CC08 records contribute to `NoteManager.bpmChangeCount`; the initial
BPM does not enable the adaptive performance branch.

`NoteManager.activateNotesJustNow` calls
`activateBPMChangeNoteProcess` once for the arriving batch. That method scans
the batch in list order and immediately tail-calls `setupBpmChangeNote` for the
first record whose `ccNum` is `3` or `8`. A second BPM record at the same batch
position is therefore not activated by this path.

`NoteBpmChange.ExecUpdate` keeps the command active until either the current
music bar is greater than the command bar, or both bars match and
`MusicBeatProgress >= 192 * numerator / denominator`. `updateBpm` then calls
`InGameMusicScoreController.UpdateBPM(bpm, bpmString)`, clears `isActive`, and
invokes `NoteManager.onBpmChanged`; the callback removes the object from
`activeNoteBpmChangeList`.

The backend-neutral prototype now preserves the start BPM string, separates
effective BPM commands from playable notes, constructs a 192-unit `TempoMap`,
emits `bpm_changed`, tracks current/next BPM, and rebuilds BPM state after a
backward restore. The NoteManager adaptive-step count uses the number of
effective CC03/CC08 commands rather than the total TempoMap entry count.

## Confirmed

- `#BPM ` is the basic BPM and is distinct from change commands.
- CC03/CC08 are recognized by `ccNum`, not by `GameNoteType`.
- command activation uses integer `192 * numerator / denominator` within the
  matching bar.
- `UpdateBPM` writes both `currentBPM` and `currentBPMString`.
- the callback removes the completed object from the active BPM list.
- both locked production charts contain one beat-zero BPM event and no change
  commands; their BMS values `220` and `180` match the independent chart API.

## Implementation Inference

The prototype materializes every effective command when the chart is built
instead of reproducing the launcher-time pooled-object allocation. This is
behaviorally equivalent for the recovered current/next BPM and clock boundary,
but not a claim about the exact number of frames that a future BPM command
spends in `activeNoteBpmChangeList` before its target position.

## Unresolved

- Live callback timing relative to Unity audio transport has not been sampled.
- No locked production chart with a nonzero CC03/CC08 change was available in
  the two existing production oracles; synthetic BMS tests cover that path.
- Runtime object-pool indices and launcher lead time remain outside the
  backend-neutral state model.

No AVD evidence was used.

## Reproduction

```powershell
Set-Location ..\runtime-integration-prototype
python -m unittest -v test_runtime_integration.py

Set-Location ..\music-score-bezier
python validate_production_bms.py
python validate_production_habahiro_bms.py
```
