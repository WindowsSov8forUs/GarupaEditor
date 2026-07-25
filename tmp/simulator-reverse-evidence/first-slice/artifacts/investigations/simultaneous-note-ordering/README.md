# Simultaneous Note Ordering

## Question

When one note group contains simultaneous members, in what order are objects activated, appended to the active list, updated, removed from after-update processing, and connected by sync/Long/Slide relationships?

The investigated sample is `jp.co.craftegg.band` 10.1.3 (`229`), `arm64-v8a`.

## Result

The scheduler ordering is recoverable. Group members are activated in group-index order and appended to the active-note list in that order. The group is activated only after the current substep's update and after-update passes. On the next substep, the active list is scanned backward, so the last activated simultaneous member updates first. Still-active notes are appended to the after-update list in that same reverse order; notes deactivated during update are omitted.

This establishes deterministic simultaneous-note scheduling order. It does not yet prove the parser's tie-breaking order when initially constructing equal-position members inside a group.

## Group Activation Boundary

`NoteManager.ExecUpdate` performs each substep in this order:

```text
advance music clock
reverse active-note update
ordered after-update for survivors
playNoteGroupInformationList
```

`playNoteGroupInformationList` examines only the group at `NoteGroupIndex`. If `activateNotesJustNow` succeeds, the index increments by one. It does not activate multiple successive groups in a loop during the same call.

Because group activation is last, newly activated notes do not receive Move/Wait/Stop or OnUpdate work in the substep that created them. Their first update occurs in the next simulation substep.

## Member Order

`activateNoteAndConnectSyncLine` loops with `memberIndex = 0 .. group.Count - 1`. Each eligible member calls `activateNote` immediately. Pool selection advances a per-note-family ring cursor, finds a deactivated object, enables it, and invokes its virtual `Activate` method.

The activation path preserves group member order when appending/activating objects. Relationship work is also processed sequentially with the previous activated note retained as an anchor. This is used for:

- multiple-directional-flick continuation;
- Long/Slide front-to-after relationships;
- front/after sync-line reconnection; and
- final Long-end/sync-line setup after the loop.

## Update and After-Update Order

If a group activates `[A, B, C]`, the active list receives them in that order. On the next substep the manager iterates from `Count - 1` to zero:

```text
update C
update B
update A
```

Each note that remains non-deactive is appended to the temporary after-update list immediately. The subsequent forward traversal therefore produces:

```text
after-update C
after-update B
after-update A
```

If `B` deactivates during its update, the order becomes `C, A`; `B` receives no after-update call. The main active list is not structurally removed inside this loop; deactive state is the filter used for the current after-update pass.

## Activation Conditions

`canActivateNote` compares launcher and main music positions through `NoteUtility.IsNoteActivateJustNow`. It also handles invalid/empty bar notes before object activation. Detailed logging/error construction in `IsNoteActivateJustNow` confirms position-window validation but is not a separate ordering rule.

`SetupNotes` prepares pools, callbacks, sync-line storage, and per-family cursors. Its two captured lambdas remove/avoid duplicate members of a specific derived type; they are not sorting comparison functions. Equal-position parser/group construction order therefore remains a separate upstream question.

## Executable Validation

`../deterministic-engine-harness/` now contains two tests derived from this ordering:

- a newly queued simultaneous group receives no update until the next substep, then updates and after-updates in reverse activation order;
- a member deactivated during update is excluded from after-update while the surviving members retain reverse order.

## Confirmed Facts vs Inference

Confirmed:

- all 10 target functions match requested/actual boundaries and decompile independently;
- group activation occurs after update and after-update in each substep;
- group members are traversed from index zero upward;
- pool cursor rotation and activation occur inline for each member;
- main note update is reverse-list order;
- after-update preserves survivor collection order and filters deactive notes.

Inferred semantic labels:

- `PoolIndex`, pool-container names, and the exact managed name of the active-note list;
- semantic names of several sync-line/relationship helpers inferred from their metadata methods;
- whether parser construction order for equal positions is lane order, source order, or another stable key.

## Remaining Work

- Recover initial equal-position member ordering from BMS conversion into `NoteGroupInformation`.
- Validate wide-note midpoint/support-member ordering and equal-distance touch candidate ties.
- Extend the harness with concrete judgement aggregation for simultaneous notes.

## Sync-Line Continuation

The later runtime-integration pass independently exports the nine helper
boundaries from `isMultipleDirectionalFlickSameGroupNotes` through
`isAdjacentTwoNotes`. It confirms that batch finalization uses four
`List<NoteInformation>.RemoveAll` calls and therefore preserves the relative
order supplied by `informationList`. For an ordinary front-only batch, each
later activated front connects to the preceding eligible front in that source
order.

`../runtime-integration-prototype/batch_finalize_and_front_sync.json` records
the ordinary chain, Long/Slide After candidate priority, remaining ordinary
After pairing, and Multiple Directional far-note reconnection. The executable
adapter preserves explicit front/end endpoints and derives the outward
left/right endpoint from the recovered multiple-direction graph; it does not
replace the native order with a lane sort or link only the outermost two front
roots. Live callback-driven line replacement timing and the serialized
`noteSyncEdgeMargin` value remain outside this static pass.

## Reproduction

```powershell
& 'HOST___________\IDA Professional 9.3\idat.exe' -A `
  "-S$((Resolve-Path artifacts\investigations\simultaneous-note-ordering\export_corrected_pipeline.py).Path) $((Resolve-Path artifacts\investigations\simultaneous-note-ordering).Path)\decompiled" `
  samples\jp.co.craftegg.band\10.1.3_229\extracted\libil2cpp.so.i64
```
