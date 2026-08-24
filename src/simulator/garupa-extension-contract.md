# Garupa/ExGarupa Product Extension Contract

## Runtime policy classification

Every behavior in this document is an explicit product semantic unless a paragraph cites Reverse for an original-compatible fact. Evidence gaps emit internal notices and do not reject otherwise valid product actions; integrity-invalid charts and non-finite state still reject the current action. See [`../runtime-contract-policy.md`](../runtime-contract-policy.md).

This document owns GarupaEditor-specific behavior layered above the reconstructed
10.1.4 simulator. It does **not** describe original-game parity. The product
implementation clue is `origin/main@a4ed4bbaa49d3e7db0407a1f2d5500f6d5940114`;
Reverse remains the only authority for original behavior.

## Boundary and identity

- Public request Schema 12 supplies only canonical `GarupaChartJson`, BGM bytes
  and `isFullLength` in `chartData`; Garupa JSON has no lane-count field and the
  simulator neither accepts one nor infers one from authored notes.
- The canonical parser emits no own property for an absent/Global timing group.
- Missing/invalid required fields, non-finite values and malformed group IDs reject the current chart action. Additional metadata keys are ignored by the owned semantic copy and never become gameplay fields; values are not coerced, clamped or routed to Global.
- Product data is copied, deeply frozen and bound to a constructed chart through
  simulator-owned metadata. It is not encoded as an invented original
  `ButtonType`, CC value, fixture identity or evidence identity.
- A chart uses the original-compatible route only when every authored item can be
  represented without dropping SV/group/lane/connection semantics. An extended
  Slide uses one product chain owner for the whole chain.

## Original Skin reuse

- Product-extension charts consume the same frozen original Skin recipe as original-compatible charts; they do not expose a second custom-Judge or rip-map mode.
- Note and Directional fronts use the selected original atlas bindings directly at continuous authored coordinates. No lane clamp or nearest-Sprite fallback is introduced.
- Field, background, Judge and Tap/Judge/Directional SE remain session-global selected owners.
- Product judgement flash binds the selected TapEffect portable texture with neutral cyan-white tint, target-line center and a 12-frame owner-local lifetime. `GE-PS-PRODUCT-JUDGEMENT-VISUAL` owns this visible product result and emits an internal evidence notice; disposal or frame preflight rejection atomically removes/discards the attempted owner. This mapping is `closed-product-extension`, not evidence that the original game supports fractional/outside lanes or that the mesh is an original particle composition.
- The selected TapEffect/Directional whole-pack module graph is prepared by the shared deterministic particle backend. Product continuous-span flash geometry remains a product mapping and binds the selected TapEffect texture; it is not original fractional-lane evidence.

## Original Live settings narrow projection

- Primary/Secondary judgement adjustment and MvDarkness use the same global original owners; product charts do not create alternate clocks or movie-opacity controls.
- Product nodes freeze `shortRhythmUnder8beat`; NoteColor uses the original normal/normal16 predicate and selected atlas.
- Same-position visible nodes freeze deterministic authored-order SyncLine sidecar pairs. Each endpoint uses its own continuous projection and recovered ordinary uniform Note scale every frame; line width is `uniformScale*0.28`, not a constant world width. No lane is rounded, clamped or selected as nearest.
- VisibleTapLaneEffect creates a separate recovered-Sprite sidecar at the exact continuous span center and authored width. Turning it Off does not disable the existing product judgement flash/particle, Judge, SE, Combo, Score or Life.
- These continuous/outside projections are `closed-product-extension`. They are not evidence that the original discrete GamePlayButton/NoteSyncLine owners accept fractional or outside lanes.

## Position and lane

- Garupa beat enters the existing adapter position bridge as
  `floor(beat * 48)`. BPM records that collide after this bridge fail closed;
  same-position SV records retain source order and later records win. Authored
  Slide connections may share a position and retain authored connection order.
- Lane is any finite number. Width is a positive integer and is never clamped.
- Rhythm span starts at `lane`. Directional Right starts at `lane`; Directional
  Left starts at `lane - width + 1`.
- Seven-lane coordinates remain exact: lane `0..6` use the existing goals.
  Continuous/outside coordinates use the same affine projection:

  ```text
  x(lane, progress) = centerX + (lane - 3) * laneSpacing * progress
  ```

  Mirror substitutes `6 - lane`. No rounding or nearest-button mapping occurs.
- The playfield always retains exactly the selected original Field UITexture's seven reference lines at
  lanes `0..6`; the product renderer does not duplicate them with a second curve-material mesh. The original camera, StarUI, safe-area and initial landscape projection come only from [`adaptive-layout-contract.md`](./adaptive-layout-contract.md); this product extension supplies no viewport, center, PPU or high-aspect constants. Authored lane values do not resize or add field lines. Fractional
  and outside notes continue through the same affine geometry and may be between
  those lines or outside the viewport; there is no lane domain.
- A rhythm front is centered at `lane + (width - 1) / 2`. Directional incoming
  anchor is `lane`; outgoing anchor is the span edge.
- Product rendering uses scalable generic front/line geometry when a lane- or
  width-specific original asset has no exact binding. `GE-PS-PRODUCT-VISUAL-LIFECYCLE` reuses the ordinary Note scale formula, shows an unjudged front only for curve `[0.002,1]`, permanently hides a judged identity, and intersects every Slide segment with that same interval before publishing vertices. Width above seven uses the one-head vertical aspect branch and authored horizontal span; it is not numerically clamped. It never reuses the nearest lane/width asset silently. Frame rejection discards the complete product transaction. This is reported as product-extension
  fidelity, not original resource parity.

## TimingGroup and SV

- Missing timing group means `#Global`. Non-Global IDs are canonical strings.
- Groups are ordered Global first, then English numeric collation. This ordering
  is identity only and never changes authored event order.
- BPM controls hit time, judgement, score, audio and natural completion. SV only
  controls visual axis.
- SV values are finite signed values normalized to six decimal places. Initial
  speed is 1. A non-Global group inherits all Global SV events.
- Events are ordered by bridged position and source order. At one position, a
  group event is applied before a Global event, so Global wins at that exact
  boundary. Two events from the same owner keep source order and the later event
  wins.
- Let an event at milliseconds `t` change old speed to `v`. The continuous axis
  intercept is updated as:

  ```text
  pos = pos + t * oldSpeed - t * v
  axis(x) = pos + v * x
  ```

  The new speed applies at the event boundary. Negative values reverse, zero
  stops, and positive values are not clamped.
- Note displacement is `axis(noteHitMs) - axis(nowMs)`. Visibility is sampled
  statelessly before judgement, so reverse/stop segments can leave and re-enter
  the viewport; once the one gameplay judgement commits, that identity remains hidden. Pausing freezes now;
  Retry creates a fresh profile; MoveTime samples the target time without
  publishing candidate output and commits the complete frame atomically.

## ExGarupa Slide graph

- Every non-empty `connections` array is legal, including singleton chains.
- Authored connection order is retained. Equal-position nodes are not sorted,
  deleted or shifted.
- Every adjacent authored pair forms one visual segment. Hidden connections are
  geometry anchors only: no judgement, score, combo, life, SE or particle.
- Every non-Hidden connection keeps its own Single/Flick/Skill/Directional type
  and creates one CS-V1 scoring unit. Skill remains chart-owned appearance/SE;
  character/card/deck effects remain excluded.
- Hidden head/tail are supported. An all-Hidden chain is visual-only and has zero
  scoring units. Chains containing Hidden use the product special line binding;
  all-Hidden line opacity is 0.5.
- Same-position segments remain graph edges. Their zero visual height is not
  turned into fake duration; visible node bodies and authored order still exist.

## Auto and CS-V1

- Auto gives one Perfect quota at BPM hit time to every non-Hidden note or
  connection. Hidden geometry and chain continuity add no scoring unit.
- `N` is generated from those units. The existing product formula remains
  `scoreMaximum = 10_000_000 + N`; Auto AP reaches that exact value.
- Fixed C/B/A/S/SS thresholds and all current score/life transactional rules are
  unchanged.

## Manual product owner

Manual behavior is a product contract; it is not taken from old main, which was
Auto-only.

- A chain owns one finger continuity state. Hidden nodes are geometry anchors.
  Every visible node is judged by its own type.
- A visible authored head establishes the owner. With a Hidden head, the first
  visible node establishes it in that node's timing window.
- Middle Single/Skill requires the owning finger inside that node's continuous
  span. Middle Flick/Directional additionally uses the existing gesture
  thresholds in world space.
- With a Hidden tail, gameplay ownership ends after the final visible node; the
  remaining Hidden geometry exits visually. A visible tail terminates according
  to its own type. All-Hidden chains never enter candidate arbitration.
- Screen input is transformed by the current revision's original bottom-left orthographic screen-to-world map.
  Continuous lane coordinate is derived from world X and existing lane spacing.
  A span accepts X from half a lane before its start through half a lane after its
  end. It is not snapped to a button.
- Overlap arbitration is stable by hit position, chart item identity and authored
  connection index. Equal-position visible nodes are processed in authored order
  within one outer-frame transaction.
- Miss/timeout, Combo, Life, score quota, SE and particles continue through the
  existing managers. The product owner contributes only candidate geometry,
  chain ownership and continuous render anchors.

## Backdrop product adaptation

`GE-PS-STANDARD-BACKDROP-ASPECT-COVER` applies only when a selected Standard 2D Skin backdrop does not already have the portable full-frame aspect. It preserves source aspect, uniformly covers the frozen surface and clips centered overflow. It never stretches X/Y independently, never substitutes another image, and does not claim an original framebuffer-equivalent adapter. Decode/allocation failure rejects the launch before mount; a later backend fault follows whole-generation cleanup.

## Lifecycle and composition

- Product managers participate in the same preflight/commit/discard outer-frame
  transaction as current managers. A failed product sample publishes no partial
  render, audio, particle, score/life or movie output.
- Retry uses a fresh chart/profile/manager graph. MoveTime reconstruction emits
  no physical output and atomically replaces the prior state only after every
  owner accepts. Active fingers are not synthesized across a seek.
- Live/Rehearsal × Manual/Auto, standard/MV backgrounds, Pause, natural
  completion, game-over, abort, terminal fault and dispose retain current owner
  ordering.

## Capability language and exclusions

Closed fields use `closed-product-extension`, separate from `closed-portable`:
`garupaSvTimingGroup`, `garupaContinuousLaneOutside`,
`garupaExtendedSlideGraph` and `garupaExtendedManualInput`. Receipts distinguish
`standard-original-compatible` from `garupa-product-extension` chart fidelity;
Retry and MoveTime reject any fresh-generation fidelity mismatch.

Portable product raster acceptance uses production Browser decoding and actual
Pixi/WebGL in three fresh WebView2 processes. The initial/negative-SV/zero-SV/
restored-positive stable digest is
`80b944d36aa34bd343b9acc36d3045012706e996ebcd4d1b671a413173cfcd89`.
This is a product portable claim, not Unity framebuffer or fixed-device parity.

This contract does not open character skills, Fever, multiplayer, HABAHIRO
original parity, standalone MVView, Star3D, CRI/USM, fixed-device exactness,
physical speaker onset or Stage 9 application integration.
