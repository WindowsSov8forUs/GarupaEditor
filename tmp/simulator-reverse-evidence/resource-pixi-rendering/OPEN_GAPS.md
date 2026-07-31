# OPEN GAPS

## 门状态

```text
offline_work_gate=closed
offline_plan_gate=closed
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
remaining_blockers=S01,S02,S03
```

## 已关闭的离线工作

- 10.1.4/230/ARM64 package、ELF、metadata 与 cache index 身份。
- 673 个渲染相关 managed 方法、32 个布局、19 个枚举及独立 ARM64 字节切片。
- 57 个当前缓存 `ingameskin/*` bundle 的 Sprite/Texture2D/Material/NGUI atlas 结构与 RGBA hash。
- 100 个当前 APK Note/HUD resource、8 组 HUD profile、Skill/Note clip/controller 及 current ScoreUp route。
- H01–H28、D01–D18 和 PR01–PR40 的离线状态分类、portable preflight/rejection/ownership 草案。
- 所有仍可在不进入 Live、不请求游戏资源服务的条件下完成的工作；`unknown_static_work=[]`。
- 55个current hook target、2个natural-Live R1场景、13个实体frame anchor，以及trace/frame/runtime-oracle fail-closed verifier；缺失输入时验证入口已确认拒绝。

## 必须连接游戏服务器

### S01 当前 HABAHIRO bundle

当前 `AssetBundleInfo` 的 11,026 条记录中没有 HABAHIRO bundle。需要通过游戏资源服务或已证明的当前缓存取得 `ingameskin/noteskin/habahiro` 字节，锁定 logical key、长度、SHA-256、atlas rows、texture/material/clip 与分发边界。

### S02 自然 Live R1

需要自然进入 ordinary 与 HABAHIRO Live，observation-only 捕获 selected resource、Sprite bind、pool identity/reuse、transform/geometry/line/mask、Animator phase、engine→renderer caller 顺序及 pause/reset/fault/dispose lifecycle。无 natural Live 的 synthetic invocation 不可晋升。

### S03 实体 frame anchors

需要在锁定 viewport、skin、chart、event 与帧时点下取得隐私最小化的 10.1.4 ordinary/HABAHIRO 实体 frame；用于关闭 scene/command/raster oracle，不导出账户、room、member/card/Skill身份、display string 或 raw pointer。

S01–S03 关闭前，`rendering_gate`保持 open，RP03–RP14 production、Pixi backend、阶段 package scripts 与资源二进制均禁止加入。
