# Auto Live Runtime Contract Supplement

## Result

This supplement corrects the first Auto Live closure after a production-family
audit. `NoteMultipleDirectionalFlick` is not a manual-only or presentation-only
entity. Its constructor delegates to `NoteDirectionalFlick`, its `MoveState`
calls `NoteSingleBase.MoveState`, and the Auto crossing therefore reaches the
inherited `NoteFlickBase.forcePerfect` route. The inherited Directional getter
supplies `-500/+500`, while the Multiple override of `ExecTouchMoved` judges
note type 10, changes side-note ownership, and finishes the root.

The class spans stages: the synthetic route is Auto Live; real touch ownership
and directional thresholds remain manual input; Sprite, BackLine, animation,
audio and particles remain presentation. AddLong/AddSlide Multiple Directional
Visual helpers are separate classes whose `forcePerfect` methods are native
`RET` stubs and must not be mapped to the core judgement class.

Core production groups are not all same-position Directional notes. Native
`isMultipleDirectionalFlickSameGroupNotes` requires both records to have front
type 6, equal game-note type, and adjacent button type. NoteManager connects
the resulting chain. The root that judges recursively marks both side chains
used and clears the links; a portable immutable chart therefore needs a
separate runtime group owner rather than mutating frozen `NoteInformation`.

The supplemental fixed trace also closes omissions in the first trace: a Slide
Stop method fixture, active Long/Slide pause composition, and exact B=-5/0/+5
Float32 outputs including a committed positive cross-BPM device sample.
The offset cases preserve the source cursor as separate bar and Float32 beat
progress fields. The rounded absolute-position projection is not sufficient to
reconstruct the same Float32 result near a bar/BPM boundary.

## Provenance

- locked sample: `jp.co.craftegg.band` 10.1.3 (229), `arm64-v8a`;
- source commit: `a3f28d77e71c5e7a62cab0de81f0cf668a5b745b`;
- static source: committed method indexes and `artifacts/rhythm/decompiled_bundles/note.c`;
- offset source: committed clock-scheduling pass-2 runtime oracle;
- no Reverse working-tree artifact is consumed by the verifier.

## Reproduce

```powershell
python extract_arm64_slices.py
python generate_supplement.py
python verify_supplement.py
```

GarupaEditor must freeze this committed directory before implementation.
