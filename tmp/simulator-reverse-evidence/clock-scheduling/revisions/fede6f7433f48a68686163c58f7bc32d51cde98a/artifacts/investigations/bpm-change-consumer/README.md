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
CC03/CC08 values are appended to process-persistent builder value/string lists;
the initial BPM is stored separately and is not appended. Runtime capture shows
that `NoteDataBMSBuilder.Initialize` does not clear those lists and that the
same chart is parsed once with `isCommand=false` and once with
`isCommand=true`. `NoteManager.bpmChangeCount` therefore receives the
post-normal-parse accumulated builder-list count, not the current chart's
effective command count.

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
backward restore. The prototype currently enables adaptive steps from the
current chart's effective CC03/CC08 count. That preserves isolated-chart intent
but is not an exact reproduction of the original process-history-dependent
`+0x74` field.

## Confirmed

- `#BPM ` is the basic BPM and is distinct from change commands.
- CC03/CC08 are recognized by `ccNum`, not by `GameNoteType`.
- command activation uses integer `192 * numerator / denominator` within the
  matching bar.
- `UpdateBPM` writes both `currentBPM` and `currentBPMString`.
- the callback removes the completed object from the active BPM list.
- `NoteDataBMSBuilder.Initialize` preserves the BPM value/string lists across
  chart parses and gameplay sessions in one process.
- one gameplay parses the BMS twice and appends the same command twice, while
  `NoteManager +0x74` captures the count after the first parse.
- both locked production charts contain one beat-zero BPM event and no change
  commands; their BMS values `220` and `180` match the independent chart API.

## Implementation Inference

The prototype materializes every effective command when the chart is built
instead of reproducing the launcher-time pooled-object allocation. This is
behaviorally equivalent for the recovered current/next BPM and clock boundary,
but not a claim about the exact number of frames that a future BPM command
spends in `activeNoteBpmChangeList` before its target position.

## Unresolved

- Reset and reuse of one `NoteBpmChange` pool object across two acquisitions is
  not yet sampled.
- 120-mode, pause/resume, slow-frame substeps, and judgement-offset crossings
  remain outside this runtime batch.

No AVD evidence was used.

## Reproduction

```powershell
Set-Location ..\runtime-integration-prototype
python -m unittest -v test_runtime_integration.py

Set-Location ..\music-score-bezier
python validate_production_bms.py
python validate_production_habahiro_bms.py
```
