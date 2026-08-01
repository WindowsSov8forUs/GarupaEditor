# OPEN GAPS

## 门状态

```text
offline_work_gate=closed
offline_plan_gate=closed
habahiro_exact_parity_gate=open
habahiro_degraded_delivery_gate=closed-authorized-by-explicit-user-request
rendering_gate=open
production_authorization=false
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
remaining_exact_blockers=S01,S02,S03
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

该处置关闭的是`habahiro_degraded_delivery_gate`，不是`habahiro_exact_parity_gate`，也不授权当前production。

## Exact 开放项

### S01 当前 HABAHIRO bundle

当前 `AssetBundleInfo` 的 11,026 条记录中没有 HABAHIRO bundle。需要通过游戏资源服务或已证明的当前缓存取得 `ingameskin/noteskin/habahiro` 字节，锁定 logical key、长度、SHA-256、atlas rows、texture/material/clip 与分发边界。

### S02 自然 Live R1

ordinary R1仍是production前置；HABAHIRO R1仅在exact parity轨必需。需要自然进入 ordinary 与可用时的 HABAHIRO Live，observation-only 捕获 selected resource、Sprite bind、pool identity/reuse、transform/geometry/line/mask、Animator phase、engine→renderer caller 顺序及 pause/reset/fault/dispose lifecycle。无 natural Live 的 synthetic invocation 不可晋升。

### S03 实体 frame anchors

ordinary实体frame仍是production前置；HABAHIRO原始frame仅在exact parity轨必需。frame用于关闭原作scene/command/raster oracle，不导出账户、room、member/card/Skill身份、display string或raw pointer。

整体`rendering_gate`继续因ordinary runtime/frame和剩余contract工作保持open；RP03–RP14 production、Pixi backend、阶段package scripts与资源二进制仍未授权。
