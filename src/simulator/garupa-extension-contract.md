# Garupa/ExGarupa Product Extension Contract

## Runtime policy classification

Extensions add semantics to the original chart; they are not a second chart type or an alternative implementation of original behaviour. Original calculations, state changes and output semantics remain authoritative for shared behaviour. Only the additional SV, continuous-coordinate and graph semantics are product-defined. Integrity-invalid charts and non-finite state still reject the current action. See [`../runtime-contract-policy.md`](../runtime-contract-policy.md).

This document owns GarupaEditor-specific behavior layered above the reconstructed
10.1.4 simulator. It does **not** describe original-game parity. The product
implementation clue is `origin/main@a4ed4bbaa49d3e7db0407a1f2d5500f6d5940114`;
Reverse remains the only authority for original behavior.

## Boundary and identity

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
- Same-position visible nodes freeze deterministic authored-order SyncLine sidecar pairs. Each endpoint uses its own continuous projection and recovered ordinary uniform Note scale every frame; line width is `uniformScale*0.28`, not a constant world width. No lane is rounded, clamped or selected as nearest.
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

The following rules define additional graph/coordinate behaviour. They do not
exempt ordinary judgement or gesture rules from the original implementation.

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

## 保留的扩展渲染链路

以下是相对原作谱面新增语义的完整入口清单。共有规则不得在这些入口中重写；新增入口必须说明现有路径无法承接的具体输入。

| 保留项 | 必要输入与边界 | 共用原作消费者 |
| --- | --- | --- |
| TimingGroup / 有符号 SV | [timingGroupAxis](engine/garupa/timingGroupAxis.ts) 提供轴位移；[slideRenderExtension](engine/garupa/slideRenderExtension.ts) 只替换运动输入与时间到达条件；[slideAxisMesh](engine/garupa/slideAxisMesh.ts) 处理反向、停止和超出坐标范围的可见区间 | `advanceOrdinaryLongNormalChild`、`advanceOrdinarySlideChildren`、原作曲线与网格条带 |
| 连续/域外轨道与宽度 | [simulatorSceneLayout](scene/simulatorSceneLayout.ts) 将连续坐标送入原作场景；超过七格仅补足原作没有的宽度输入 | 原作投影基准、`calculateOrdinaryNoteScaleAtY`、`calculateOrdinaryNoteStartDepth`、父级缩放和网格宽度 |
| 扩展 Slide 图结构 | 单节点、同拍边、隐藏首尾、全隐藏链及内部 Flick/Directional；必要的图结束状态位于 [slideRenderExtension](engine/garupa/slideRenderExtension.ts) | 原作根节点跟随、Wait/Move/Stop、`queueSlideRenderHideBefore`、`applySlideRenderHides`、`advanceSlideStopWait` |
| 连续多格 Directional 图 | [productRenderProducer](engine/garupa/productRenderProducer.ts) 将跨度展开为原作单格主体与邻接边；仅对实际视口外的附加主体做剔除 | `noteBodyBinding`、`appendOrdinaryAnimationStart`、`buildOrdinaryMultipleDirectionalLine` 和原作方向材质 |
| 原作没有对应项的字形映射 | 小数轨道/域外中心使用所选族的固定中心字形；超过原作资源宽度使用明确的单头字形。原作域内的精确键优先，禁止最近轨道和首张图回退 | [noteVisualBinding](engine/rendering/noteVisualBinding.ts) 中共用的主体、Flick 图标和 LongFlash 绑定；共用动画时钟 |
| 混合节点 SyncLine | [productRenderProducer](engine/garupa/productRenderProducer.ts) 补充包含扩展端点的谱面邻接关系；原作端点读取已提交状态 | `buildOrdinarySyncLine`；不重算原作端点运动，不重复原作端点间的连接 |
| 连续 Slide 粒子根变换 | [particleCommandProducer](engine/particles/particleCommandProducer.ts) 将同一 Slide 根位置提供给 TapKeep，并共用逐帧移动/停止；保留原有无离散按钮对应项时不伪造单点判定粒子的限制 | 原作粒子根、设置缩放、生命周期、模拟与 Pixi 粒子后端 |
| CS-V1 加分显示容量 | [pixiRendererBackend](backends/pixi/pixiRendererBackend.ts) 仅在数位超出原作预置数量时增加数字 Sprite | 原作数字 atlas、`spriteNumberPositions`、间距、缩放、透明度和层级 |

场景/场地、普通 HUD、MV、所选 Skin 材质、动画解码、Pixi 命令执行和粒子模拟均不按扩展谱面另开算法。HABAHIRO 是原作自己的分支；必要的宿主坐标与资源格式转换属于接口适配。上述保留项不等于逐像素验收，也不将原有粒子输出限制表述为原作等价。
