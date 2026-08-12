# GarupaEditor Simulator

`src/simulator`是按Reverse证据重建的自治portable谱面模拟器。当前产品范围保留完整单人谱面玩法与独立的Skill音符表现；只删除角色/卡组技能效果系统和多人玩法。

## 当前状态

2026-08-13已完成普通可见渲染证据化还原：Reverse `f94947d9` portable pack由production消费，actual Pixi以真实PNG/TTF/profile完成带Score/Life的`poppin_shuffle_special`全谱，RP矩阵改为Reverse closure与动态observation三列验证。验收见`tmp/simulator-ordinary-visible-rendering-acceptance.md`。

已完成并保持有效的子门：

- BMS构造、时钟与调度；
- Auto Live、手动输入与判定；
- 通用UInt32 score、combo、判定计数、Life、Miss/Bad伤害、Game Over与clear status领域状态机；
- 逐谱C/B/A/S/SS master驱动的普通单人Score Rank/Gauge、8位最小零填充BMFont、Rank marker与SS曲线动画；
- ordinary及HABAHIRO谱面、Skill音符atlas/SE/判定粒子；
- 逐谱BGM、14项固定玩法SE及WebAudio transport；
- deterministic particle、Pixi particle与whole-engine ReturnTime；
- single public launch、shared resource selection、unified scene/manual geometry、autonomous runtime及natural completion。

ordinary Flick/Directional/Long Flash独立owner与current曲线，以及Combo/AP、AddScore、Result/JudgeTiming、Life warning/Game Over资源链均已关闭portable子门；character skill与多人机制仍排除。

已从production删除：

- character/card/deck业务模型；
- `skillNoteIndex → member/card`、技能队列/持续时间与加分、回血、判定强化、护盾、不死等角色技能效果；
- character cut-in、audience、clear voice及其独立voice gain/category；
- collaboration、team-live-festival、Fever point/state/command/member adapter及活动倍率；
- 对应public字段、replay journal和HUD动画。

**Skill音符不是角色技能效果。** `GameNoteAdditionalType.Skill`、ordinary/HAB专用外观、`SE_RHYTHM_TAP_SKILL`和Good/Great/Perfect Skill粒子继续保留。Fever谱面命名仍可解析，但不再产生多人Fever状态。

当前门状态：

```text
ordinary_rendering_portable_gate=closed-current-evidence-consumed
score_rank_gauge_portable_subgate=closed
particle_audio_semantic_portable_subgates=closed
original_device_exact_gate=open-not-claimed-fixed-device-limit
```

## Public边界

唯一业务入口：

```ts
import { launchSimulatorModule } from "src/simulator";
```

调用方提交：

- BMS与显式逐谱BGM bytes/metadata；
- 中立gameplay数据：score level、generic total parameter、Auto Live combo coefficient，以及逐谱/难度`musicId+difficulty+scoreC/B/A/S/SS`原始master字段；
- 通用Life初值/上限与Miss/Bad伤害；
- play/practice/audio/visual用户配置。

Public不接收card、deck、character skill、team、festival、Fever或member数据。成功后只得到`closed` Promise；close result报告adjusted music position、score、life、combo与clear status，终态为`completed`、`game-over`、`user-closed`或`terminal-fault`。

Public barrel不导出engine、step、backend、provider、profile、scene、replay factory或dispose。启动后scheduler、input、pause、checkpoint/ReturnTime、BGM自然结束、Game Over、fault、mount及dispose全部归simulator内部owner。

## 架构

```text
src/simulator/
├─ public/      # 唯一chart/gameplay/config/launch/close合同
├─ runtime/     # 自治scheduler/input/session生命周期
├─ assembly/    # frozen recipe与原子resource assembly
├─ platform/    # 中立production capability composition
├─ scene/       # ordinary/particle/manual/HAB统一layout owner
├─ host/        # 内部engine host与whole-engine replay
├─ engine/      # 谱面、score/life、判定、note、音画producer
├─ backends/    # Recording/Pixi/WebAudio/particle/resource adapters
├─ resources/   # immutable shared store、fixed selector及store adapters
└─ testing/     # 隔离测试与登记fixture
```

`engine/`不依赖React、Pixi、Tauri、DOM、编辑器谱面类型或窗口协议。

## Shared static resources

Production只内置manifest/metadata，不读取testing fixture。部署的中立shared store需预置：

- ordinary：8 keys / 1,479,352 bytes；
- fixed gameplay SE：14 keys / 222,934 bytes；
- particle：9 keys / 2,254,580 bytes；
- HABAHIRO：11 keys / 3,815,563 bytes；
- Score HUD：8 keys / 5,085,771 bytes（7项font/PNG资源及1项SS animation profile）。

ordinary visible新增5 keys / 747,461 bytes（strict profile + 4 PNG）；当前库存共55 keys / 13,605,661 bytes，另加每session动态BGM。Skill音符SE、Skill粒子和`RhythmGameSprites5.png`保留。

缺项、长度/SHA、PNG/MP3 metadata、cue或关系不符全部失败关闭；自治launch不隐式联网、不使用默认资源或fallback。

## Unified scene

当前scene基线来自Reverse `30788a2ab30cd5ab61b84148f0d596776d47b3a1`：1600×720 orthographic、360 PPU、ordinary 7 lane、15个particle anchors、bottom-left manual geometry、Slide local-Y/1/60 list及HAB lane-change geometry。

`Button_07_BMS_1P_07`没有current scene mapping，被请求时返回`evidence-required`。

## Evidence workflow

完整流程见[`evidence-workflow.md`](./evidence-workflow.md)。只消费已verify、commit、push的Reverse证据；production不读取Reverse工作树、`tmp/`或testing fixture。历史fixture中的角色/多人字段保持原字节，不代表production可达。

关键Reverse提交：

- particle closure：`9fb544b281d25fe0cefb4b2d6e692bb38df66a81`；
- per-chart BGM：`55bdde635526d2a94a48c760f18ae7f90cd96631`；
- ordinary portable pack：`6f49ebbce86c162f0d86ea9a612618b4c573d45c`；
- autonomous scene/manual：`30788a2ab30cd5ab61b84148f0d596776d47b3a1`；
- Score HUD/Rank/Gauge基础合同：`6892bcc972434082913502527f9f10735b098f7d`；
- `ScoreGaugeSS`曲线、Rank marker及sgm字体补充：`2fd90fa7`、`d5f5bc0e`、`95e629d9`；
- ordinary visible portable pack：`80a173a2`、`3ca922cc`、`ee76bd29`、`bd21127c`、`f94947d9`。

## 验收

```powershell
npx.cmd tsc -p src/simulator/tsconfig.json
npm.cmd run simulator:test:score-life-state
npm.cmd run simulator:test:device-closure
```

通用score/life测试显式覆盖UInt32累分、C/B/A/S/SS全部阈值前/等于/后、Float32 ratio bits、同Rank/越级/SS/超`scoreMax`、事务discard/commit、扣血、上限、Game Over及Skill音符不触发角色效果；Score专项render测试锁定BMFont溢出不截断、Rank资源与SS 56-curve采样。

`simulator:test:render-production`读取Reverse closure/case matrix，并要求测试运行产生的actual Pixi observation；Recording replay、源码marker或synthetic 4×4 profile不能关闭正向case。

## 显式开放项

- HAB external atlas上的ordinary Note动画及HAB original parity；
- 非零initial practice seek；
- `Button_07_BMS_1P_07` scene mapping；
- 固定设备120/adaptive cadence、GPU/framebuffer、visible/audio physical exact；
- stage-9主程序集成。

`mainProgramIntegrationAuthorization=false`。不得修改主程序入口或用兼容壳恢复已删除结构。
