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
- 后续natural ordinary R2冻结10个byte-pinned Unity setter与87,037个setter事件：闭合510个mesh owner的22-vertex/60-index/22-UV/22-color topology及运行时vertices/threshold，80个line owner的endpoint/equal width，以及field/mesh transform Float32载荷。它不外推Graphics cap/join、SpriteMask、NGUI glyph布局、动画clock或Unity shader/raster parity。
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

上述三项保持`habahiro_exact_parity_gate=open-not-claimed`，但不阻塞显式delivery profile。资源二进制仍不得入Garupa仓库，production/test仍不得联网。
