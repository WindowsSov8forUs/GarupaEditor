# BMS Note Batch Pipeline

## Question

How does `NoteBatchInformationListFactory.CreateNoteBatchInformationList` turn BMS text into runtime `NoteBatchInformation` and `NoteInformation` objects?

The investigated sample is `jp.co.craftegg.band` 10.1.3 (`229`), `arm64-v8a`.

## Result

This part of the rhythm engine is recoverable to implementation level. The recovered boundary covers text splitting, header/bar parsing, note-material creation, conversion into runtime batches, slide/long-note grouping, multi-range lane combining, synchronized-note processing, and multiple-directional-flick setup.

It is not original C# source recovery. Names and field layouts come from IL2CPP metadata, while control flow comes from ARM64 and decompiler output. Exception scaffolding, generic collection helpers, and some compiler-generated delegates remain lower-level than source C#.

## Confirmed Flow

`CreateNoteBatchInformationList` performs these operations in order:

1. Initialize `NoteDataBMSBuilder` with `isCommand`.
2. Split the BMS string on LF (`0x0A`).
3. In non-command mode, run `MusicScoreBezierConverter.Convert` before parsing.
4. Feed every line to `ExcuteParseLineForNoteDataManager`.
5. Allocate `List<NoteBatchInformation>` and call `convertResultDictionary`.
6. Sort the batch list.
7. If `IsMultiRangeNotes && !isCommand`, call `combiningDictionary`.
8. Run `excuteNecessaryEndTimeAndSynchronizedNoteConduct`.
9. Run `setupMultipleDirectionalFlickNote`.
10. Clear the factory music dictionary and builder result dictionary, then return the list.

`ExcuteParseLineForNoteDataManager` ignores lines beginning with `*`, `%`, or `;`. Other lines first pass through `parseHeaderData`; a non-header line is passed to `parseBarData`.

Recognized headers include `#BPM`, `#WAV`, `#ENDTIME`, `#BGM`, `#TITLE`, `#PLAYLEVEL`, `#SHIFT`, `#ArrivalSecond`, `#HABAHIRO`, and `#cueName`. `#HABAHIRO` enables the multi-range path.

Bar data is decoded in two-character cells. `createBarData` treats channels 50 through 61 as the initial `FrontNoteType.Long` family and ordinary note channels as `FrontNoteType.Normal`. The cell's resolved sound-value string then supplies the final `FrontNoteType` and `GameNoteType`; see `sound_value_map.tsv`.

`convertResultDictionary` iterates the builder's `SortedDictionary<int, BMSBarData>`, creates `NoteInformation` objects, creates one `NoteBatchInformation(barIndex, numerator, denominator)` per timing position, assigns long and Slide A/B collections, and finalizes both slide families with `setupSlideNoteSet`.

## Multi-Range Combine

`combiningDictionary` scans each batch's `informationList_` in list order. A combinable run requires:

- a note type outside `GameNoteType` 4 through 25;
- Long notes with `buttonType_ != -1` (a Long placeholder with button `-1` is skipped);
- the same `gameNoteType_` as the preceding candidate; and
- consecutive `buttonType_` values.

When a run closes, `combineNotes(list, startIndex, endIndex)` computes the integer midpoint of the first and last buttons and uses `Enumerable.FirstOrDefault` to find the existing note at that center button. It appends the other covered button types to that center note, carries nonzero virtual-lane direction/distance data, merges nested sound-value entries, bakes the button array, and sets `IsMultiRangeCombine = true` on the covered notes.

This explains why the runtime can retain per-lane source notes while also exposing one playable wide note.

## Inference

- `combiningDictionary`'s `(gameNoteType - 4) < 22` exclusion means all Slide A/B, directional-flick, and add-direction variants are deliberately kept out of generic wide-lane combining. This is strongly supported by the enum range and branch, but the design intent is inferred.
- The existing midpoint note becomes the input-facing representative and the marked covered notes are rendering/support members. Selection and mutation of the midpoint object are confirmed; the ownership interpretation should be checked against `NoteManager.SetupNotes`.

## Open Questions

- Recover the exact judgement, input hit-test, and score-state consumers of `IsMultiRangeCombine`.
- Continue from `NoteManager.SetupNotes` into note-pool selection, timing windows, touch arbitration, and result propagation. Those are required for a complete engine reimplementation but are separate bounded investigations.

## Continued Integration

The later `../runtime-integration-prototype/bms_note_information_adapter.json`
pass now converts already constructed `NoteBatchInformation` and
`NoteInformation` records into playable backend-neutral `NoteSpec` roots. It
preserves baked lane widths, Long and Slide terminals, intermediate Slide
nodes, virtual lanes, multiple-direction side graphs, and chart-source order.

That continuation is followed by the `../music-score-bezier/` pass, which
integrates exact quadratic expansion, quantization, lane/WAV construction,
control grouping, force ordering, post-expansion reduction, full header
parsing, WAV-key allocation, chart partitioning, and score-line serialization.
Raw BMS text now feeds that converter end to end. The locked Poppin' Shuffle
Special chart produces 825 playable roots and matches the independent
Bestdori Single, Directional, Long, and source Slide fields without a missing
or extra event. Every one of the 298 authoring Slide nodes also remains an
ordered subsequence of the 1577 runtime-expanded nodes. The production
`786_miracle_april_habahiro_special` chart also preserves source CC families
independently from the internal half-button merge index. Its 821 Single lanes,
65 Directional fields, 104 Long lane paths, and 293 Slide lane nodes match the
independent Bestdori oracle without missing or extra fields. Endpoint-aware
simultaneous sync-line eligibility and downstream additional-type consumers
remain the upstream gaps. The later
`../runtime-integration-prototype/batch_finalize_and_front_sync.json` pass
confirms the four final `RemoveAll` filters and integrates the ordinary
front-only source-order sync chain without guessing Long/Slide tail rewiring.

## Evidence Notes

IDA initially merged `CreateNoteBatchInformationList` with `NoteDataBMSBuilder.Initialize`, and separately merged `combiningDictionary` with the following method. The boundaries in `targets.tsv` come from adjacent IL2CPP metadata RVAs and were asserted before exporting the corrected slices. A global bundle slice that reports a different entry must not be treated as evidence for the named method.

The source binary and metadata hashes are recorded in `artifacts/manifests/artifact_manifest.json`. The relevant sample hashes are:

- `libil2cpp.so`: `66C9C666C50962B662DF8D894E851C7D18F07142DCA145CFAC3D30D063D1D9FA`
- `global-metadata.dat`: `B485E5BB999F491C4B5EC7850AD856122B6EAE51DD4FAA06C4063F3AFC7D87FE`
- `dump.cs`: `B2672C8BEC6ADE997FE13793DF442D9F8381C98D1EABCA1BF06CD9710A4B638F`
- `stringliteral.json`: `AD6434D271C8A58B29B08406CB77873DC1854522D44E2C25159D249E854A06D8`

## Reproduction

Run the boundary export against an IDA database created from the version-matched `libil2cpp.so`:

```powershell
& 'HOST___________\IDA Professional 9.3\idat.exe' -A `
  "-S$((Resolve-Path artifacts\investigations\bms-note-batch\export_corrected_pipeline.py).Path) $((Resolve-Path tmp\bms-note-batch-corrected).Path)" `
  <path-to-version-matched-i64>
```

The script fails if any function does not have the requested metadata boundary. `CreateNoteBatchInformationList` and `combiningDictionary` may remain unavailable to Hex-Rays; their control flow is reconstructed from the bounded ARM64 instructions and the correctly decompiled callees.
