# GarupaEditor Simulator

`src/simulator`是按Reverse证据重建的**证据有界单人核心子集**。本目录不代表完整原作Live：角色/card/deck技能效果、角色Heal/Guard/NeverDie、Fever与多人机制明确排除；证据不足的输入必须在owner mutation前失败关闭。

## 当前反审状态

2026-08-13重新开启全模块证据完整性反审。可提交的能力分类与声明边界见：

- [`audit/current-capability-matrix.json`](./audit/current-capability-matrix.json)
- [`audit/current-claim-ledger.json`](./audit/current-claim-ledger.json)

Reverse中的`productionAuthorization=true`只授权实现，不证明Garupa已消费。Recording backend、源码marker、合成texture decoder或测试自行写入的`status=closed`都不能关闭production正向门。

当前可以分别陈述的已验收范围：

- BMS构造及已登记生产谱样本；
- 零初始seek下的时钟/调度、Auto Live、手动输入与判定；
- 不含角色技能效果的UInt32 score、combo、判定计数、Life、Game Over和clear status领域链；
- 逐谱C/B/A/S/SS master驱动的Score Rank/Gauge portable状态与资源命令；
- ordinary Note/HUD的hash资源身份、typed命令、owner生命周期及Pixi scene routing；
- 逐谱BGM、固定玩法SE的portable语义和WebAudio图映射；
- deterministic particle语义、Pixi particle routing与whole-engine checkpoint ReturnTime；
- single public launch、shared resource selection、autonomous runtime及natural completion。

这些是分门portable结论，不是browser raster、固定设备framebuffer、CRI/Android音频或原作整体exact声明。

## 已排除机制

Production不接受也不恢复：

- character/card/deck业务模型和技能效果；
- 角色加分、回血、判定强化、Guard/NeverDie；
- character cut-in、audience、clear voice；
- collaboration、team-live-festival、Fever及多人HUD/倍率。

**Skill音符不等于角色技能效果。** `GameNoteAdditionalType.Skill`的chart-owned外观、命中SE和判定粒子仍在当前单人核心子集内，但不会查询member/card或触发角色效果。

## Public边界

唯一业务入口：

```ts
import { launchSimulatorModule } from "src/simulator";
```

调用方提交BMS、显式逐谱BGM bytes/metadata、中立score/life master数据，以及play/practice/audio/visual配置。成功receipt只暴露`closed` Promise，不暴露engine、step、backend、provider、scene、replay factory或dispose。

启动后scheduler、input、pause、checkpoint/ReturnTime、BGM自然结束、Game Over、fault、mount与dispose均为simulator内部owner。当前分支没有把该入口安装进主程序。

## 架构

```text
src/simulator/
├─ public/      # chart/gameplay/config/launch/close合同
├─ runtime/     # scheduler/input/session生命周期
├─ assembly/    # frozen recipe与原子resource assembly
├─ platform/    # 中立production capability composition
├─ scene/       # ordinary/particle/manual/HAB scene owner
├─ host/        # engine host与whole-engine replay
├─ engine/      # chart、score/life、judgement、note及命令producer
├─ backends/    # Recording/Pixi/WebAudio/particle/resource adapters
├─ resources/   # immutable shared store与selector
├─ audit/       # 可提交能力矩阵与声明账本
└─ testing/     # 隔离测试与登记fixture
```

`engine/`不依赖React、Pixi、Tauri、DOM、编辑器谱面类型或窗口协议。

## Resource边界

Production只内置manifest/metadata，不读取testing fixture、Reverse工作树或本地忽略工作目录。当前shared store inventory为55 keys / 13,605,661 bytes，另加每session显式BGM；该数字只表示已装配库存，不表示所有原作资源或能力均可达。

缺项、长度/SHA、PNG/MP3 metadata、cue或关系不符均失败关闭。Production不得隐式联网、选择默认资源或fallback。

## Rendering门分层

### Ordinary

当前关闭的是`actual-pixi-command-scene-routing`：真实fixture bytes经过长度/SHA/profile检查后，验证typed命令、资源key、owner生命周期和Pixi scene对象。现有Node测试decoder创建空`TextureSource`，因此**不**证明真实browser PNG/FontFace decode、字形raster或framebuffer像素。

### HABAHIRO

Reverse只授权external portable asset的**显式degraded preview**，并要求可见`Approximate HABAHIRO`标签与machine-readable fidelity。原作HAB runtime/frame parity保持开放；external atlas上的ordinary Note动画未获授权。反审完成前不得把`current-external`路线称作complete/exact，也不得由ordinary RP结果关闭HAB门。

## Evidence workflow

流程见[`evidence-workflow.md`](./evidence-workflow.md)。只消费已verify、commit、push的Reverse证据。10.1.3或其他来源只有在Reverse建立逐claim跨版本/跨来源等价证明、适用域、反例检查和committed-only verifier后，才可用于10.1.4 production。

关键10.1.4证据包括：

- particle portable closure：`9fb544b2`；
- per-chart BGM：`55bdde63`；
- ordinary portable resources：`6f49ebbc`；
- scene/manual：`30788a2a`；
- Score Rank/Gauge：`82c7facb`、`2fd90fa7`、`d5f5bc0e`、`95e629d9`；
- ordinary visible authorization：`80a173a2`、`3ca922cc`、`ee76bd29`、`bd21127c`、`f94947d9`。

## 验证

```powershell
npm.cmd run simulator:test:fixtures
npx.cmd tsc -p src/simulator/tsconfig.json
npm.cmd run simulator:test:device-closure
```

每个测试入口只证明其命名范围。`simulator:test:render-production`必须使用动态observation；后续反审将使verifier从原始observation独立计算结论，不再信任测试自报closed状态。

## 显式开放项

- HAB external atlas ordinary Note动画与HAB original parity；
- 非零initial practice seek的10.1.4 whole-engine pre-roll；
- `Button_07_BMS_1P_07` scene/manual/render/particle mapping；
- browser真实PNG/FontFace decode integration与framebuffer raster；
- 固定设备120/adaptive cadence、GPU/driver framebuffer、visible/audio physical exact；
- stage-9主程序集成。

`mainProgramIntegrationAuthorization=false`。不得修改主程序入口或用兼容壳恢复已删除结构。
