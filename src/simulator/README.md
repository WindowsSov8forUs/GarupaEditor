# GarupaEditor Simulator

`src/simulator`是按Reverse证据重建的自治portable谱面模拟器。当前产品范围只包含谱面播放、输入判定、combo/result、音频、粒子、ordinary/HABAHIRO渲染与自治生命周期；不实现角色、卡组、技能或多人玩法。

## 当前状态

已完成并隔离验收：

- BMS构造、时钟与调度；
- Auto Live、手动输入与判定；
- combo、判定计数、fast/slow、all-perfect与clear status；
- ordinary与HABAHIRO resource/Pixi rendering；
- 逐谱BGM、13项固定非角色SE及WebAudio transport；
- 98-system/14-root deterministic particle与Pixi particle；
- single public launch、shared resource selection、unified scene/manual geometry、autonomous runtime、natural completion及whole-engine ReturnTime。

已从production删除：character/card/deck/skill、score/life/game-over/continue、collaboration/team/festival/fever/member，以及它们专用的manager、public字段、HUD、SE、particle route和HAB atlas。官方BMS中的`skill`/`fever`资源名称仍可解析，但只归一为基础note行为，不触发已删除机制。

Portable functional gate已关闭。原作物理设备exact保持：

```text
open-not-claimed-fixed-device-limit
```

不声明Unity/CRI/Android/GPU/driver/framebuffer/扬声器exact等价。

## Public边界

唯一业务入口：

```ts
import { launchSimulatorModule } from "src/simulator";
```

调用方只提交：

- BMS；
- 显式逐谱BGM bytes及metadata；
- play/practice/audio/visual用户配置。

成功后只得到`closed` Promise。Public barrel不导出engine、step、backend、provider、profile、scene、replay factory或dispose。Close result只报告adjusted music position、combo与clear status；终态为`completed`、`user-closed`或`terminal-fault`。

启动成功后，scheduler、input、pause、checkpoint/ReturnTime、BGM自然结束、clear、fault、mount及dispose全部归simulator内部owner。

## 架构

```text
src/simulator/
├─ public/      # 唯一chart/config/launch/close合同
├─ runtime/     # 自治scheduler/input/session生命周期
├─ assembly/    # frozen recipe与原子resource assembly
├─ platform/    # 中立production capability composition
├─ scene/       # ordinary/particle/manual/HAB统一layout owner
├─ host/        # 内部engine host与whole-engine replay
├─ engine/      # 谱面、判定、note、render/audio/particle producer
├─ backends/    # Recording/Pixi/WebAudio/particle/resource adapters
├─ resources/   # immutable shared store、fixed selector及store adapters
└─ testing/     # 隔离测试与登记fixture
```

`engine/`不依赖React、Pixi、Tauri、DOM、编辑器谱面类型或窗口协议。

## Shared static resources

Production只内置manifest/metadata，不读取testing fixture。部署的中立shared store需预置：

- ordinary：8 keys / 1,479,352 bytes；
- fixed SE：13 keys / 210,888 bytes；
- particle：9 keys / 2,254,580 bytes；
- HABAHIRO：10 keys / 3,371,599 bytes。

共40 keys / 7,316,419 bytes，另加每session动态BGM。

Simulator内部决定manifest、resource key、route、profile、binding与prepare顺序。缺项、长度/SHA、PNG/MP3 metadata、cue或关系不符全部失败关闭；自治launch route不隐式联网、不使用默认资源或fallback。

## Unified scene

当前scene基线来自Reverse `30788a2ab30cd5ab61b84148f0d596776d47b3a1`：

- 1600×720 orthographic、360 PPU；
- ordinary 7 lane motion；
- 15个supported GamePlayButton particle world anchors；
- bottom-left manual ScreenToWorld、collision及distance normalization；
- Slide local-Y、1/60 position list与JudgeOffsetFrame VirtualPerfectLine；
- HAB lane-change后的manual ButtonType切换；
- 已授权portable HAB field/judge/mask与0.25秒flash policy。

`Button_07_BMS_1P_07`没有current scene mapping，被请求时返回`evidence-required`。

## Evidence workflow

完整流程见[`evidence-workflow.md`](./evidence-workflow.md)。只消费已verify、commit、push的Reverse证据；production不读取Reverse工作树、`tmp/`或testing fixture。历史fixture即使含已删除角色/多人字段也保持原字节，不代表production可达。

关键Reverse提交：

- particle closure：`9fb544b281d25fe0cefb4b2d6e692bb38df66a81`；
- per-chart BGM：`55bdde635526d2a94a48c760f18ae7f90cd96631`；
- ordinary portable pack：`6f49ebbce86c162f0d86ea9a612618b4c573d45c`；
- autonomous scene/manual：`30788a2ab30cd5ab61b84148f0d596776d47b3a1`。

## 验收

```powershell
npx.cmd tsc -p src/simulator/tsconfig.json
npm.cmd run simulator:test:device-closure
```

当前固定结果包括：ordinary particle 656 batches / 7200 frames / 1251 commands，digest `9B65E8D022E2407AECABCD09D0EE152B8CE0C27EB85C6BAB68AA46DCC6F71FC6`；resource/Pixi 14 stages；device closure 4 stages。

任务记录：

- `tmp/simulator-character-multiplayer-cleanup-task.md`；
- `tmp/simulator-character-multiplayer-cleanup-acceptance.md`；
- `tmp/simulator-external-resource-audit.md`。

## 显式开放项

- 非零initial practice seek：缺少whole-engine pre-roll cadence证据，资源读取前失败关闭；
- `Button_07_BMS_1P_07` scene mapping；
- 固定设备120/adaptive cadence、GPU/framebuffer、visible/audio physical exact；
- stage-9主程序集成。

`mainProgramIntegrationAuthorization=false`。不得修改主程序入口或用兼容壳恢复已删除结构。
