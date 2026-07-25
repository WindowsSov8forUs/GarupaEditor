# Equal-position construction and cross-Note mutation

## Scope

This investigation closes two first-slice scheduler boundaries for `jp.co.craftegg.band` 10.1.3 (`229`) arm64-v8a:

1. the construction order retained when several runtime notes share one absolute position;
2. whether a represented Note update is allowed to synthesize removal of another lower-index active Note.

The conclusions are static IL2CPP results. They do not use `runtime/tools/`, the old GarupaEditor simulator, or a Python runtime dependency.

## Equal-position order

`NoteBatchInformationListFactory.CreateNoteBatchInformationList` splits the BMS text and visits the resulting line array from index zero upward. Each line is passed to `NoteDataBMSBuilder.ExcuteParseLineForNoteDataManager` before conversion begins.

`NoteDataBMSBuilder.createBarData` calls `BMSBarData.isExistSameButtonTypeNoteData`. A missing button group is appended to the tail of `BMSBarData.bmsNoteList_`; an existing group is reused. The outer group order is therefore the order in which each button type first appears in the parsed BMS stream, not lane order and not a later global button sort.

Within one `BMSBarDataWithButton.noteList_`, `createNoteData` uses `List<BMSNoteMaterial>.BinarySearch` and inserts only a missing value at the returned complement index. `BMSNoteMaterial.CompareTo @ 0x386F6A0` compares `absolutePos`; equal absolute positions compare as zero. A same-button same-position cell therefore reuses the existing material and contributes its sound value instead of creating a second ordered member.

`convertResultDictionary` enumerates the outer button groups in their retained first-occurrence order and each inner material list in ascending absolute position. `excuteMakeNoteBatchInformationList` appends the constructed `NoteInformation`; final `RemoveAll` passes and multiple-direction setup do not reorder survivors.

Consequently, members from different button groups that land at the same runtime position are ordered by button-group first occurrence in the parsed BMS stream. The first-slice GarupaEditor boundary accepts a preconstructed `NoteBatchInformationList`, so its strict responsibility is to preserve `informationList` order verbatim. It must not invent a separate `sourceOrder`, lane sort, or button sort.

## Cross-Note lower-index removal

`NoteManager.ExecUpdate` initializes one descending index from `activeNoteList.Count - 1`, fetches from the live list, and decrements the retained index without refreshing Count until the next adaptive substep.

The direct `NoteBase.ChangeState` xrefs used by the represented Long and Slide Update paths change the initiating root. The multiple-direction visual `MoveState`, `WaitState`, and `StopState` handlers are empty. Its `ConnectDeactivate` path and the terminal `ChangeSideNoteUsed` recursion can deactivate other visual objects, but that graph-consumption behavior belongs to judgement/input processing that the first slice explicitly leaves `evidence-required`; it is not a confirmed first-slice Note Update action.

The first slice therefore closes G03 as a scoped negative result: preserve the live-list fixed-index mechanism, self-removal, append-time After list, and next-substep Count refresh, but do not expose or test a fabricated cross-Note removal hook. When later judgement evidence introduces a real caller, that later slice must add the caller and its exact timing together rather than retroactively treating a synthetic scheduler mutation as original behavior.

## Evidence files

- `closure.json` records the machine-readable G02/G03 conclusions.
- `decompiled/native_ranges.txt` is an IDA-generated instruction listing for the locked native ranges.
- `decompiled/xrefs.json` records direct xrefs to the investigated state and parsing methods.
- `targets.tsv` maps each conclusion to native or previously frozen evidence.
- `verify_equal_position_and_cross_note_mutation.py` verifies the closure package and the routed source artifacts.

## Reproduction

```powershell
& 'HOST___________\IDA Professional 9.3\idat.exe' -A `
  "-S$((Resolve-Path artifacts\investigations\equal-position-and-cross-note-mutation\export_xrefs.py).Path) $((Resolve-Path artifacts\investigations\equal-position-and-cross-note-mutation).Path)\decompiled" `
  samples\jp.co.craftegg.band\10.1.3_229\extracted\libil2cpp.so.i64

python artifacts\investigations\equal-position-and-cross-note-mutation\verify_equal_position_and_cross_note_mutation.py
```
