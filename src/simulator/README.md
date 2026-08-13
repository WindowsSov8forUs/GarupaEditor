# GarupaEditor Simulator

`src/simulator`是按已提交Reverse证据重建的**证据有界单人核心子集**，不是完整原作Live。证据不足的输入在最早可知边界返回`evidence-required`；角色/card/deck效果、Fever和多人机制明确排除。

## 当前分门状态

可提交状态由以下机器可校验账本限定：

- [`audit/current-capability-matrix.json`](./audit/current-capability-matrix.json)
- [`audit/current-claim-ledger.json`](./audit/current-claim-ledger.json)
- [`audit/current-production-integrity-review.json`](./audit/current-production-integrity-review.json)

| 门 | 状态 | 精确范围 |
| --- | --- | --- |
| Public/autonomous core | `closed-portable` | 单一launch、内部scheduler/input/session、自然结束/Game Over/fault/cleanup、closed-only receipt |
| BMS/chart | `closed-portable` | 已登记production chart bytes的构造、图、批次和command data |
| Zero-seek runtime | `closed-portable` | manual、Auto Live、pause/resume、opaque checkpoint ReturnTime、score/life |
| Ordinary Pixi | `closed-portable` | hash资源身份、typed命令、owner、Float32和Pixi command/scene routing |
| Audio | `closed-portable` | semantic command、PCM与WebAudio graph；不含CRI/Android mixer/物理输出 |
| Particle | `closed-portable` | deterministic semantic simulation与Pixi handoff；不含Unity GPU/framebuffer |
| HAB external preview | `open-evidence-required` | 类型只允许显式`degraded-explicit`，但当前锁定HAB谱因external Note animation无授权而在资源读取前拒绝 |
| HAB original parity | `open-evidence-required` | 原作resource/runtime/frame未关闭 |
| Non-zero initial seek | `open-evidence-required` | 10.1.3 MoveTime没有逐claim 10.1.4等价闭环 |
| Button 07 | `open-evidence-required` | current scene/manual/render/particle mapping未知 |
| Browser decode/raster | `open-evidence-required` | Node synthetic decoder不证明`createImageBitmap`、FontFace glyph或raster |
| Fixed-device physical exact | `open-device-exact` | 120/adaptive cadence、GPU/framebuffer、speaker output保持开放 |
| Character skill/Fever/multiplayer | `excluded` | 不属于当前产品范围 |
| Main-program integration | `unauthorized-stage-9` | 本分支未安装到App/window/editor/Tauri/mobile |

不得用一个总体“完成”状态覆盖这些不同门。

## Public合同

唯一业务入口：

```ts
import { launchSimulatorModule } from "src/simulator";
```

调用方提交BMS、逐谱BGM bytes/metadata、中立score/life master，以及play/practice/audio/visual配置。成功结果只暴露`closed` Promise，不暴露engine、step、backend、provider、scene、replay factory或dispose。

`SimulatorModuleCloseReport.capabilities`逐门发布：

- selected rendering fidelity及`selectedRenderingGate`；
- ordinary command/scene、HAB preview/parity、non-zero seek、Button 07；
- browser decode/raster、fixed-device exact；
- excluded character/Fever/multiplayer；
- unauthorized stage-9。

若已有primary failure，cleanup仍尝试所有owner，secondary failures写入`failure.cleanupFailures`，不会覆盖primary identity。

## 支持范围说明

当前`closed-portable`子集包括：

- BMS构造与登记生产谱样本；
- 零initial seek时的clock/scheduling、Auto Live、manual input/judgement；
- 不含角色效果的UInt32 score、combo、判定计数、Life、Game Over、clear status；
- 逐谱C/B/A/S/SS master驱动的Rank/Gauge portable状态与资源命令；
- ordinary Note/HUD typed命令与Pixi command/scene routing；
- 逐谱BGM、固定玩法SE、portable PCM/WebAudio graph；
- deterministic particle与whole-engine checkpoint ReturnTime；
- single public launch、shared resource selection和autonomous lifecycle。

**Skill音符不等于角色技能效果。** `GameNoteAdditionalType.Skill`的chart-owned外观、命中SE和判定粒子仍在范围内，但不会查询member/card或触发角色加分、Heal、Guard、NeverDie或判定强化。

## 架构与resource边界

```text
src/simulator/
├─ public/      # chart/gameplay/config/launch/close合同
├─ runtime/     # scheduler/input/session生命周期
├─ assembly/    # frozen recipe与原子resource assembly
├─ platform/    # 中立production capability composition
├─ scene/       # ordinary/particle/manual/HAB scene owner
├─ host/        # engine host与whole-engine replay
├─ engine/      # chart、score/life、judgement、Note及command producers
├─ backends/    # Recording/Pixi/WebAudio/particle/resource adapters
├─ resources/   # immutable shared store与selector
├─ audit/       # committed capability/claim/integrity ledgers
└─ testing/     # 隔离测试与manifested fixture
```

`engine/`不依赖React、Pixi、Tauri、DOM、编辑器谱面类型或窗口协议。Production不读取testing fixture、Reverse工作树或本地忽略目录，不隐式联网、不选择默认资源、不自动fallback。缺少长度/SHA、metadata、cue、logical ID/exact key、typed state或backend capability时失败关闭。

## Rendering验收分层

### `actual-pixi-command-scene-routing`

真实fixture bytes经过长度/SHA/profile检查；production run只输出raw resource/owner/Float32/scene/cleanup observation。Verifier从Reverse `simulator-dynamic-acceptance-oracle-10-1-4@11b37f4a`的具体expected values独立计算PR08/09/11/22/23/24/26/27/29/30/39。测试自写`status=closed`不能影响结论。

当前全谱portable observation：656 batches、3900 frames、positive score、`add-score|combo|life|result|score` routes、dispose后owner 0/stage children 0。`373000`是当前配置的observed value，不声明原作全谱exact score。

### `browser-decode-integration`

现有Node adapter创建synthetic `TextureSource`并返回test font family，只证明command/scene routing。真实`createImageBitmap`、FontFace glyph和browser raster未执行，保持开放。

### `framebuffer/device-exact`

没有真实GPU/device oracle时不关闭。Reverse历史physical frame只能说明原作证据，不等于当前browser framebuffer parity。

## HABAHIRO边界

合同类型只保留`habahiro-external-degraded-preview`，要求caller显式opt-in、可见`Approximate HABAHIRO`及machine-readable fidelity，禁止ordinary animation substitution和automatic fallback。当前锁定HAB谱触及未授权external Note animation，因此chart capability scan后、shared-store read/backend prepare前返回`render.habahiro.external-note-animation-evidence-required`。这不是可运行preview或original parity声明。

## Evidence workflow

流程见[`evidence-workflow.md`](./evidence-workflow.md)。只消费已verify、commit、push的Reverse证据。10.1.3或其他来源只有在Reverse建立逐claim跨版本/跨来源等价证明、适用域、反例检查和committed-only verifier后，才可用于10.1.4 production。

本轮审计基线：

- 全量source/claim/constant账本：Reverse `be017d83`；
- 非自证动态expected values及晋升chart/PCM快照：Reverse `11b37f4a`；
- ordinary visible授权：Reverse `f94947d9`；
- particle portable closure：Reverse `9fb544b2`；
- ordinary resources：Reverse `6f49ebbc`；
- Score Rank/Gauge：Reverse `95e629d9`。

## 验证

```powershell
npm.cmd run simulator:test:fixtures
npx.cmd tsc -p src/simulator/tsconfig.json
npm.cmd run simulator:test:evidence-integrity
npm.cmd run simulator:test:device-closure
```

`simulator:test:evidence-integrity`执行fixture provenance、static integrity、raw Pixi independent verifier、ordinary/HAB early gate、manual、Auto、score/life、audio和particle动态矩阵。每个入口只证明其命名范围。

`mainProgramIntegrationAuthorization=false`。不得修改主程序入口或用兼容壳恢复已删除结构。
