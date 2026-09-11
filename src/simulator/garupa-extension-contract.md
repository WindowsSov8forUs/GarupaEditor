# Garupa/ExGarupa Product Extension Contract

## Runtime policy classification

Extensions add semantics to the original chart; they are not a second chart type or an alternative implementation of original behaviour. Original calculations, state changes and output semantics remain authoritative for shared behaviour. Only the additional SV, continuous-coordinate and graph semantics are product-defined. Integrity-invalid charts and non-finite state still reject the current action. See [`../runtime-contract-policy.md`](../runtime-contract-policy.md).

This document owns GarupaEditor-specific behavior layered above the reconstructed
10.1.4 simulator. It does **not** describe original-game parity. The product
implementation clue is `origin/main@a4ed4bbaa49d3e7db0407a1f2d5500f6d5940114`;
Reverse remains the only authority for original behavior.

## Boundary and identity

- Extended Slide Flash playback has a monotonically increasing per-chain
  revision, incremented on successful manual Began/reacquisition and on the
  first visible auto node. Visibility is separate: an active→inactive→active
  sequence within one outer frame must still restart the clip. Revisions are
  captured/restored with the timeline transaction and cleared on disposal;
  the shared render owner remains responsible for pause, stop and sample clocks.
  Authority: Reverse `audio-runtime-contract-10-1-4/arm64/0321c46c__NoteSlide__playFlashAnimation.arm64.tsv`
  sets active/enabled and calls Animator.Play with normalized time zero.
- Garupa JSON deliberately ignores the original Long/Slide distinction for
  indistinguishable straight two-node holds. On the directly representable
  original path, two visible nodes with the same lane span and strictly increasing
  quantized positions become one Long root with a parent-owned tail. The head is
  Single/Skill; the tail is Single/Skill/Flick or a single-lane Directional.
  Integer lane spans of width 1–7 include even widths. Hidden/interior nodes,
  changed spans and multi-lane directional gestures retain their Slide graph.
  No JSON field is added. The original 786 Special straight Slides at beats
  108–110 (lane 4) and 110–112 (lane 2) are **刻意为之的忽略**: normalization is
  intentional and is not a claim of lossless original type recovery.
  Named groups and neutral SV preserve this mapping; non-neutral SV/continuous
  coordinates still use the existing extension owner and are not covered by
  this Long-path alignment. Construction consumes the existing Long graph
  (`afterNoteAbsolutePos`, tail rhythm flag and additional type), so scoring,
  manual/auto judgement, audio, particles and sprite selection use the Long
  consumers. Mixed SyncLines read the parent-owned tail transform separately.
  Sources: Reverse `score-life-state-runtime-contract-10-1-4/runtime-inputs/bms/`
  original chart bytes, `simulator-dynamic-acceptance-oracle-10-1-4/chart-oracles/`,
  and `audio-runtime-contract-10-1-4` NoteLong Activate/ExecTouchBegan/ForcePerfect.
- Public request Schema 13 supplies only canonical `GarupaChartJson`, BGM bytes
  and `isFullLength` in `chartData`; Garupa JSON has no lane-count field and the
  simulator neither accepts one nor infers one from authored notes.
- The canonical parser emits no own property for an absent/Global timing group.
- Missing/invalid required fields, non-finite values and malformed group IDs reject the current chart action. Additional metadata keys are ignored by the owned semantic copy and never become gameplay fields; values are not coerced, clamped or routed to Global.
- Product data is copied, deeply frozen and bound to a constructed chart through
  simulator-owned metadata. It is not encoded as an invented original
  `ButtonType`, CC value, fixture identity or evidence identity.
- Use the original path whenever it can preserve the authored behaviour. Extend
  that path where an axis, coordinate or Slide topology requires additional
  semantics; never select another algorithm for the entire chart. Neutral SV
  and unchanged named-group axes leave original notes on their original path.
  A connected Slide retains one owner so its finger and segment state cannot be
  split between implementations.
- The construction result always contains the original-compatible notes. Its
  extension metadata owns only the notes/chains needing additional semantics.
  They share the original music clock, input dispatch, OneFrame reflection and
  scoring namespace. Original touch acceptance takes priority; extensions cannot
  judge the same accepted touch again. Scoring and audio/particle ownership include
  both sets without replacing or duplicating original sources.
- Extension rendering supplies additional time, coordinate and graph inputs to
  the original motion, Slide child lifecycle, hide-before, Stop wait, mesh,
  sprite-binding, animation and line functions. TimingGroup cannot select an
  independent Slide follow/visibility/flash lifecycle. Mixed SyncLines and Slide
  particles consume committed owner transforms. Flick distance retains the
  original screen-to-world and distance normalization.

## Original Skin reuse

- Product-extension charts consume the same frozen original Skin recipe as original-compatible charts; they do not expose a second custom-Judge or rip-map mode.
- Note and Directional fronts use the selected original atlas bindings directly at continuous authored coordinates. No lane clamp or nearest-Sprite fallback is introduced.
- Field, background, Judge and Tap/Judge/Directional SE remain session-global selected owners.
- The former `GE-PS-PRODUCT-JUDGEMENT-VISUAL` rectangular flash is withdrawn: a selected ParticleSystem texture cannot be stretched across a synthetic NoteMesh or replaced by `Default-Particle`/first-texture selection.
- `GE-PS-PRODUCT-COMPATIBLE-PARTICLE-ROUTE` permits a product node to reuse one exact selected original particle root only when it has width one, an integer original button owner in `0..6`, a supported Single/Skill/Flick/Directional family and a successful judgement. This is a product reuse rule, not evidence that SV itself is original-compatible.
- Fractional/outside/wide nodes continue judgement, Judge HUD, score/life, SE and lifecycle atomically without inventing a nearest button or substitute particle. `GE-PS-PRODUCT-NONDISCRETE-PARTICLE-OMISSION` records that isolated product behavior; it is not a launch/session failure and makes no original visual-equivalence claim.
- The selected TapEffect/Directional whole-pack module graph remains prepared by the shared deterministic particle backend. Only that backend may consume its particle textures and renderer/material profiles.

## Original Live settings narrow projection

- Primary/Secondary judgement adjustment and MvDarkness use the same global original owners; product charts do not create alternate clocks or movie-opacity controls.
- Product nodes freeze `shortRhythmUnder8beat`; NoteColor uses the original normal/normal16 predicate and selected atlas.
- SyncLine endpoints enter the shared `SyncLineConnectionRules`, using the original activation interval, connection ownership, pending-tail decisions and directional endpoint selection. There is no authored-order adjacent-pair sidecar. The ordinary command producer owns all line objects, material binding, visibility and geometry. Coordinate adapters supply committed endpoint transforms; they do not round or substitute lanes.
- VisibleTapLaneEffect remains owned by the common 13-slot GamePlayButton owner. Compatible integer width-one product nodes reuse its exact slot/texture mapping; the product renderer creates no duplicate fixed-`NoteLaneEffect_4` sidecar. Fractional/outside/wide nodes do not use nearest-slot substitution. Turning it Off does not disable selected particles, Judge, SE, Combo, Score or Life.
- Product Slide strips use the selected curve texture with the original base-mesh white RGB and `0.8` alpha. Hidden connections preserve geometry continuity but do not add an invented chain-wide tint or alpha reduction. The texture is not recolored with a second saturated-green multiplier.
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
- `simulator.product-compatible-node-visual-routing-v2` preserves each locally compatible node's selected Normal/Skill/Flick/Long/Directional family, integer source-center lane key and original child ownership when that node's own axis or topology requires extension handling. A Slide root uses Long and owns the chain's only LongFlash; each visible non-terminal child uses `note_slide_among` with no flash; the ordinary terminal uses Long and terminal Flick/Directional nodes retain their corresponding animated icon children. Hidden nodes create mesh continuity but no front owner. Integer center lanes consume their exact `0..6` key. Fractional/outside centers use the fixed selected-family center glyph as an explicitly product-owned marker, never a nearest/default/first lookup or original-equivalence claim.
- `GE-PS-PRODUCT-VISUAL-LIFECYCLE` retains original local scale, parent scale,
  start depth, creation order, animation child transforms and animation sampling.
  Shared Slide lifecycle output owns the moving root, child visibility and mesh
  retirement; judging a child hides its predecessor according to the original
  rule rather than immediately hiding that child. Flash and TapKeep read the
  same moving root; neither projects the next node as a replacement root.
- Signed SV adds visibility sampling in curve `[0.002,1]` before retirement.
  `slideAxisMesh` clips only that extended domain, retaining the source strip
  topology, colour and width rules. An endpoint outside numeric world-coordinate
  range remains a clipping input; finite sections are projected without dropping
  the crossing segment. Original-compatible motion uses the ordinary mesh
  builder directly. No screenshot-derived mask or second tint is permitted.
- Directional spans reuse one-lane bodies and the shared MultipleDirectional
  line builder. The incoming lane anchors a Slide endpoint; side nodes carry
  the span and the outward icon. Continuous spans extend that graph at authored
  unit intervals, culling only nodes beyond the actual viewport. Hidden geometry
  does not introduce a separate material or opacity.
- Width above seven uses the source one-head vertical aspect branch and authored
  horizontal span. This does not clamp the authored width. Frame rejection
  discards the complete owner transaction.


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
- Note displacement is `axis(noteHitMs) - axis(nowMs)`. Reverse/stop segments
  may leave and re-enter the viewport while alive. Retirement is persistent:
  Single notes follow their judgement/timeout owner; Slide nodes and meshes
  follow the shared predecessor-hide and Stop lifecycle. SV never rewinds those
  states or changes BPM hit time. Pausing freezes motion and animation; Retry
  creates fresh owners; MoveTime publishes the complete frame atomically.

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
  scoring units. A Hidden tail keeps the geometry lifetime until its authored
  endpoint while the final playable node stops the flash. All chains use the
  original curve material and colour; Hidden does not select another line or
  reduce its opacity.
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

Deferred product input retains the adjusted music position and BPM captured when the host receives the frame, before `NoteManager.ExecUpdate` advances the shared clock. Candidate selection, node judgement and equal-position continuation consume that same snapshot; post-update expiry still uses the updated clock. This preserves the original input-before-Note-update order across extended coordinates/SV and BPM changes, rather than delaying extended input by one frame. The unchanged native judgement function was checked at the two sweetFrame=0 boundaries in Reverse `manual-input-runtime-contract-10-1-4/judgement_window_correction.json` through the deferred input clock consumer; no new product tests or fixtures were added.

The following rules define additional graph/coordinate behaviour. They do not
exempt ordinary judgement or gesture rules from the original implementation.

Slide contact uses committed shared-lifecycle virtual positions and `SlideNoteManager.Judge`; held normal nodes use the same Perfect/correction gate as `NoteSlide`. Terminal gestures share the perfect-line/origin/leave-grace gate, and directional width uses the original full-distance threshold. Release resolves the current node immediately. Miss deadlines are separate from hit windows: Single uses its elapsed counter; bound standalone Flick uses its seven-frame completion; Slide uses shared midpoint/successor rules, negative-B stop wait and terminal Flick frame count. Miss clears Flash/hold audio until a new Began. These owner states participate in outer-frame rollback and are released with the generation. Source: Reverse `manual-input-runtime-contract-10-1-4` correction files and registered NoteSingle/NoteFlickBase/NoteSlide/NoteSlideAfter instruction slices. The product contact consumer matches 65 committed native spatial rows with the later native clamp rule; the shared terminal gate matches 18 native outputs. These local comparisons do not establish whole-simulator equivalence.

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
- Original and extended candidates share the original input preflight: ordinary
  candidates compare distance from the captured unadjusted music position;
  Slide candidates and the final cross-family choice compare committed Y
  distance from the center gameplay button. Existing original scan winners
  precede appended extension candidates on ties. Selection happens before the
  hit-window check, with one shared per-frame extension reservation. The exact
  selected extended identity is committed by the input dispatcher and consumed
  by the deferred product owner without reselection. A selected original owner
  with no accepted judgement does not cause a second extension attempt.
  Slide ownership is checked only when establishing the first Slide candidate;
  subsequent occupied Slides still participate and can block a later touch.
  This also applies to same-frame reservations and to extension candidates after
  an original Slide winner, matching native `GetMoveEndTimeNearestZeroNote`
  at `0x37771C8–0x377723C`; ownership is still enforced when consuming Began.
  MJ04/MJ06 source-rule checks cover same-domain ties and two-finger reservation
  through deferred consumption. Equal-position visible nodes are processed in authored order
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
`standard-original-compatible` from `garupa-product-extension` capability receipts;
these labels describe whether additional semantics are used, never whole-chart execution routes.
Retry and MoveTime reject any fresh-generation fidelity mismatch.

Historical product raster acceptance (before the shared-path change; not current acceptance) used production Browser decoding and actual
Pixi/WebGL in three fresh WebView2 processes. The initial/negative-SV/zero-SV/
restored-positive stable digest is
`80b944d36aa34bd343b9acc36d3045012706e996ebcd4d1b671a413173cfcd89`.
This is a product portable claim, not Unity framebuffer or fixed-device parity.

This contract does not open character skills, Fever, multiplayer, HABAHIRO
original parity, standalone MVView, Star3D, CRI/USM, fixed-device exactness,
physical speaker onset or Stage 9 application integration.

## 保留的新增输入适配

多格 Directional、不同音符间的 SyncLine、Slide 连续跟随与持续粒子均为原作已有功能，不作为扩展渲染链路保留。

旧 `GarupaProductRenderProducer` 已删除。[Garupa 输入适配器](engine/garupa/garupaRenderInputAdapter.ts) 仅提交时间轴、坐标和图结构产生的呈现输入；[RenderCommandProducer](engine/rendering/renderCommandProducer.ts) 统一拥有资源绑定、对象、绘制命令、动画计时与会话释放。原作池路径及适配输入共用完整连接线命令、Slide 网格提交、变换和动画推进。Slide 闪光属于实际根节点，不再建立影子根节点。粒子统一使用 `note-slide` 所有者，不以原作/扩展标签分流。

| 保留输入 | 原作输入域外的必要适配 | 进入的共用路径 |
| --- | --- | --- |
| TimingGroup / 有符号 SV | [timingGroupAxis](engine/garupa/timingGroupAxis.ts) 提供轴位移；[slideAxisMesh](engine/garupa/slideAxisMesh.ts) 裁剪反向、停止及坐标溢出区间 | 原作运动、Slide 状态机、曲线和网格条带；组名本身不切换规则 |
| 连续/域外坐标及超出原作域的宽度 | [simulatorSceneLayout](scene/simulatorSceneLayout.ts) 投影新增坐标；Directional 跨度提供单格主体及端点输入；缺少原作精确资源键时采用明确字形映射 | 原作主体、方向图标、连接线、缩放、深度、动画和粒子；多格本身不是扩展 |
| 原作不支持的 Slide 图结构 | [slideRenderExtension](engine/garupa/slideRenderExtension.ts) 将单节点、同拍、隐藏首尾及内部新增类型转换为状态输入 | 原作根跟随、Wait/Move/Stop、隐藏、网格和闪光；[garupaSyncInputs](engine/garupa/garupaSyncInputs.ts) 只组织端点，连接决策由 [SyncLineConnectionRules](engine/rendering/syncLineConnectionRules.ts) 同时供原作 NoteManager 与适配输入使用 |
| CS-V1 超出预置数位的加分数值 | 超出原作数字对象容量时增加数字 Sprite | 原作数字 atlas、布局、间距、缩放、透明度和层级 |

场景/场地、普通 HUD、MV、Skin 材质、动画解码、Pixi 执行和粒子模拟不因扩展输入另开算法。HABAHIRO 属于原作分支；宿主坐标与资源格式转换属于接口适配。无离散按钮对应时仍保留既有单点判定粒子省略限制，不能将其表述为原作输出等价。

这份清单描述实现归属和保留输入，不代表视觉或整体算法等价验收。
