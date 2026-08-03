# OPEN GAPS

## 门状态

```text
offline_work_gate=closed
offline_plan_gate=closed
ordinary_runtime_gate=closed
ordinary_frame_gate=closed
habahiro_portable_resource_gate=closed-current-external-fallback
habahiro_exact_parity_gate=open-not-claimed
habahiro_degraded_delivery_gate=closed
rendering_delivery_gate=closed
production_authorization=true
unknown_static_work=[]
unknown_fields=[]
methods=673
layouts=32
enums=19
cache_records=11026
ingameskin_bundles=57
base_resources=100
hud_profiles=8
skill_animation_clips=4
note_animation_clips=4
score_up_routes=5
historical_candidates=28
decisions=18
fixed_cases=40
runtime_hook_targets=55
r1_scenarios=2
frame_anchors=13
habahiro_degraded_profiles=2
habahiro_difference_rows=12
habahiro_degraded_sprite_keys=179
ordinary_runtime_events=87364
ordinary_runtime_categories=8
ordinary_runtime_anchors=8
render_setter_targets=10
ordinary_geometry_runtime_events=87037
ordinary_geometry_runtime_frames=636
ordinary_geometry_mesh_owners=510
ordinary_geometry_line_owners=80
ordinary_geometry_payload_gate=closed
current_sync_line_portable_profile=closed
current_ordinary_projection_profile=closed-1600x720
current_ordinary_note_geometry_producer_profile=closed-base-mesh-sync-line
current_ordinary_note_child_lifecycle_profile=closed-long-normal-after-base-mesh
note_child_arm64_slices=13
current_ordinary_hud_runtime_semantic_profile=closed-observed-subset
hud_setter_targets=22
hud_setter_arm64_slices=22
ordinary_hud_visible_runtime_events=19888
ordinary_hud_visible_runtime_frames=631
current_ordinary_hud_visible_profile=closed-portable-bitmap-mask-animation-subset
note_family_r4_targets=30
note_family_r4_arm64_slices=6
ordinary_note_family_r4_runtime_events=118152
ordinary_note_family_r4_aggregate_frames=1258
current_note_family_r4_profile=closed-observed-subset
final_r7_owner_targets=130
final_r7_runtime_events=625192
final_r7_aggregate_frames=3480
final_r7_observed_owners=51
final_r7_observed_setters=21
final_r7_remaining_pr_confirmed=21
final_r7_evidence_confirmed_cases=40
final_r7_unknown_fields=0
final_r7_blocking_findings=0
ordinary_physical_frames=7
habahiro_current_external_assets=12
remaining_exact_blockers=original-current-HABAHIRO-UnityFS-bytes,natural-HABAHIRO-runtime-R1,original-HABAHIRO-physical-frames
```

## 已关闭的离线工作

- 10.1.4/230/ARM64 package、ELF、metadata 与 cache index 身份。
- 673 个渲染相关 managed 方法、32 个布局、19 个枚举及独立 ARM64 字节切片。
- 57 个当前缓存 `ingameskin/*` bundle 的 Sprite/Texture2D/Material/NGUI atlas 结构与 RGBA hash。
- 100 个当前 APK Note/HUD resource、8 组 HUD profile、Skill/Note clip/controller 及 current ScoreUp route。
- H01–H28、D01–D18 和 PR01–PR40 的离线状态分类、portable preflight/rejection/ownership 草案。
- 所有仍可在不进入 Live、不请求游戏资源服务的条件下完成的工作；`unknown_static_work=[]`。
- 55个current hook target、2个natural-Live R1场景、13个实体frame anchor，以及trace/frame/runtime-oracle fail-closed verifier；缺失输入时验证入口已确认拒绝。

## HABAHIRO 显式降级处置

无法自然进入限时HABAHIRO Live时，不存在可等价替代S02对象/顺序/phase和S03原始frame的纯静态方案。经用户明确授权，另设不宣称原作一致性的降级交付轨：

- 首选`historical-atlas-proxy`：用户提供本地字节并匹配历史bundle/texture哈希，使用179个精确历史组合Sprite row；10.1.4字节等价性仍未证明。
- 次选`current-ordinary-stretch-proxy`：用当前ordinary/directional/field/judge资源拉伸或组合宽音符，视觉差异更大。
- 两者必须显式选择并显示`Approximate HABAHIRO`；禁止exact→degraded静默fallback，禁止生成frame进入原作golden/parity tests。
- lane change保留marker→flash-start→change-lane顺序，但缺`Root_effect`/clip时默认同engine frame换线；粒子、颜色、延迟和完成phase可能不同。
- HA-D01–HA-D12记录资源版本、宽音符图、mesh width输入、pool identity、lane animation、field/judge、mask/material/shader、HUD、lifecycle和raster差异；直接影响PR01、PR04、PR19、PR40。

该处置与后续ordinary运行时、实体frame及current external resource证据共同关闭`ordinary-exact-habahiro-degraded`交付profile；它不关闭`habahiro_exact_parity_gate`，也不允许静默fallback或原作一致性宣称。

## 已关闭的交付证据

- ordinary natural Auto Live冻结87,364个连续observation-only R1事件，覆盖8类render/HUD事件与8个required anchor；静态4-byte `NoteBase.OnStart` no-op明确记为不可hook，生命周期由510组真实同alias mesh Activate→Deactivate对覆盖。
- 后续natural ordinary R2冻结10个byte-pinned Unity setter与87,037个setter事件：闭合510个mesh owner的22-vertex/60-index/22-UV/22-color topology及运行时vertices/threshold，80个line owner的endpoint/equal width，以及field/mesh transform Float32载荷。
- current 10.1.4 APK补充解析NoteSyncLine prefab与material：确认两点world-space、View/Stretch、opaque white、零cap/corner/mask和R2 equal width，授权camera-facing textured quad portable mapping；GPU half-texel、Shader LOD与raster parity继续排除。
- current `RhythmGame.unity`的build index 3、正交`GameCamera` size 1与1600×720实体viewport关闭ordinary world→Pixi投影：`x=800+worldX*360`、`y=360-worldY*360`、`width=worldWidth*360`，全部R2 line写入均在viewport/clip内且禁止clamp；不外推HAB。
- consolidated producer profile将17个current ARM64方法、13个button与Launcher scene transform、Note motion/scale、R2 base mesh和sync-line update/margin一次闭合；仅授权ordinary fixed 1600×720 base subset，advanced/Multiple/threshold/HAB exact不在授权内。
- child lifecycle profile额外锁定13个隔离current `NoteLong`/`NoteManager` ARM64 slice，并连接既有17个static-contract方法与510-owner R2；只授权ordinary Long + Normal tail + base 22/60 mesh的after Wait→Move与deactivate ownership，Flick/Directional tail、Slide、Multiple、advanced与threshold继续false。
- ordinary HUD runtime profile从R1聚合23个target与14,084/1,452个HUD/animation caller entry；授权首次判定semantic顺序与两次observed life-heal先于life update，5条未出现route继续false。
- natural ordinary R3冻结22个byte-pinned setter/ARM64 slice、19,888个caller-correlated事件及631个相对frame：闭合bitmap score/combo/life、score-skill overlay、serialized field/sudden mask、combo/GameJudge normalized-time-zero restart与portable combo/life-heal curve sampling；未观察的Guard/NeverDie/Judge仍false，Unity PlayerLoop subframe与GPU raster parity仍排除。
- natural Note family R4按Flick/Slide/Multiple三组冻结118,152个caller-correlated事件与1,258个aggregate relative frame；30个owner target与6个新增Slide ARM64 slice共同授权front Flick/Directional icon、observed Slide mesh+line生命周期和MultipleDirectional connect/back-line。Long-after Flick、Slide Wait runtime、add-Long/add-Slide/after Multiple、Advanced与threshold继续false。
- natural HUD R5冻结core/overlay共30,975 events/1,059 frames；5条正向route关闭。
- final R6冻结五条clean全窗口trace共190,401 events/2,492 aggregate frames/26 observed owners；只新增All Perfect ExecUpdate active gate。R6未观察路线没有被当时外推，zero-event field trace已删除。
- final R7在production实现前一次性冻结130个owner target、七条confirmed trace与current static portable profile：625,192 events/3,480 aggregate frames/51 owners/21 setters；首次闭合field setup和真实Auto Live AddScore coroutine，并从current Shader程序闭合Advanced 42/120与threshold，从current方法/scene/clip闭合Guard/NeverDie/Judge/Crescendo。21个remaining PR及PR01–PR40证据门全部confirmed，unknown/blocker为0；Reverse仍不宣称Garupa已消费。
- 7个ordinary physical-device frame anchor锁定1600×720 viewport与隐私裁剪；PNG只保留在Reverse提交，Garupa冻结manifest中的尺寸/hash。
- 12项Bestdori current external portable asset与179个Sprite row/hash关闭HAB资源交付子门；production/test必须使用host本地hash provider，禁止联网，且不宣称原始UnityFS一致。
- `delivery_closure.json`按交付profile关闭V01、D01–D18与PR01–PR40；PR01/PR04/PR19/PR40继续标记degraded disclosure，HA-D01–HA-D12仍为强制差异。
- `rendering_delivery_gate=closed`、`production_authorization=true`仅解除RP03 typed renderer/Pixi backend硬门；profile外或未确认路径继续失败关闭。

## Exact 开放项

### 原始 current HABAHIRO UnityFS

服务器刷新后的`AssetBundleInfo`含11,041条记录，仍无HABAHIRO/wide bundle。current external portable atlas只关闭交付资源profile；若未来取得游戏原始`ingameskin/noteskin/habahiro` UnityFS，仍需锁定logical key、长度、SHA-256、atlas rows、texture/material/clip并独立关闭exact资源门。

### Natural HABAHIRO Live R1

ordinary R1已关闭。HABAHIRO对象identity、顺序、phase及original lifecycle仍需在未来自然进入HAB Live后按既定55-target计划observation-only捕获；synthetic invocation和ordinary投影不可晋升为exact。

### 原始 HABAHIRO frame anchors

ordinary 7个实体frame已关闭交付门。HABAHIRO原始frame只在exact parity轨必需，必须来自实体设备并遵守既定viewport、anchor与隐私规则；generated degraded frame永不进入原作golden。

上述三项保持`habahiro_exact_parity_gate=open-not-claimed`，但不阻塞显式delivery profile，也不再阻塞ordinary/common-HUD RP14实施。资源二进制仍不得入Garupa仓库，production/test仍不得联网。
