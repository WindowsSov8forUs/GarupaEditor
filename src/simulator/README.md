# GarupaEditor Simulator

`src/simulator`已进入**证据限定的portable release transition**。旧任务书、旧acceptance、旧closure字段、Recording backend或源码标记仍不证明production能力；本轮只恢复逐claim Reverse证据、当前raw observation及独立detached DAG共同闭合的普通单人portable子集。

## 当前全局门

总重验全局隔离已条件解除。唯一public入口`launchSimulatorModule(...)`委托给已安装的内部自治launcher；未安装platform时返回`platform-unavailable / simulator.entry.platform-not-installed`。它不自动安装主程序入口，也不绕过每个仍开放能力的最早失败边界。

`runtime/moduleEntryBinding.ts`与production platform engine builder保留同一门函数作为防绕过结构；当前门值为关闭。HABAHIRO、non-zero seek、Button 07、browser raster及其他开放路径继续在各自resource/backend/owner mutation之前失败关闭。

机器账本：

- [`audit/current-capability-matrix.json`](./audit/current-capability-matrix.json)
- [`audit/current-claim-ledger.json`](./audit/current-claim-ledger.json)
- [`audit/current-production-integrity-review.json`](./audit/current-production-integrity-review.json)

| 门 | 状态 | 当前边界 |
| --- | --- | --- |
| Public/autonomous、chart、zero-seek runtime | `closed-portable` | 当前10.1.4证据、raw production-path与detached DAG限定范围 |
| Ordinary Pixi command/scene | `closed-portable` | 含656-batch actual-Pixi routing及20行Score panel mask raw；不含browser/device raster |
| Audio、Particle | `closed-portable` | semantic/PCM/WebAudio graph及deterministic simulation/Pixi routing；不含物理输出/framebuffer |
| HAB external/original | `open-evidence-required` | external Note animation与原作runtime/frame未授权 |
| Non-zero initial seek | `open-evidence-required` | 缺少10.1.4逐claim MoveTime闭环 |
| Button 07 | `open-evidence-required` | scene/manual/render/particle mapping未知 |
| WebView2 decode/glyph/raster | `open-evidence-required` | Node synthetic `TextureSource`不证明Tauri WebView2输出 |
| Fixed-device physical exact | `open-device-exact` | cadence、GPU/framebuffer、speaker output保持开放 |
| Character/card/deck skill、Fever、multiplayer | `excluded` | public和production依赖图不得引入 |
| Main-program integration | `unauthorized-stage-9` | 不修改App/window/editor/Tauri/mobile入口 |

状态词：`closed-portable`只表示当前证据和raw验收明确覆盖的portable合同；`reopened-audit`保留为历史隔离状态词，不是当前正向能力；`degraded-explicit`不等于原作parity；其余开放和排除状态按表中边界解释。

## Public合同

唯一业务入口仍是：

```ts
import { launchSimulatorModule } from "src/simulator";
```

安装中立platform后，证据覆盖的普通zero-seek request可获得仅含`closed` Promise的成功receipt；未安装时失败为`simulator.entry.platform-not-installed`。合同不接受member/card/deck、角色效果、Fever或多人数据，也不暴露engine、step、backend、provider、scene、replay factory或dispose。

**Skill音符不等于角色技能效果。** `GameNoteAdditionalType.Skill`只能在重新核验后表示chart-owned外观、命中SE和判定粒子，不得查询member/card或触发角色加分、Heal、Guard、NeverDie或判定强化。

## 架构与资源边界

```text
src/simulator/
├─ public/      # chart/gameplay/config/launch/close合同与全局隔离
├─ runtime/     # scheduler/input/session生命周期
├─ assembly/    # frozen recipe与原子resource assembly
├─ platform/    # 中立production capability composition
├─ scene/       # scene owner
├─ host/        # engine host与whole-engine replay
├─ engine/      # chart、state、judgement、Note及command producers
├─ backends/    # Recording/Pixi/WebAudio/particle/resource adapters
├─ resources/   # immutable shared store与selector
├─ audit/       # committed capability/claim/integrity ledgers
└─ testing/     # 隔离测试与manifested fixture
```

`engine/`不依赖React、Pixi、Tauri、DOM、编辑器谱面类型或窗口协议。Production不得读取testing fixture、Reverse工作树或本地忽略目录，不得隐式联网、选择默认资源、自动fallback、使用ambient random/wall clock或吞掉故障。缺少master、资源身份、长度/SHA、logical ID/exact key、typed state或证据时必须在最早可知点失败关闭。

## Rendering验收分层

- `actual-pixi-command-scene-routing`：当前production raw observation已由独立verifier核验，普通单人portable子门为`closed-portable`；它不包含browser raster或device framebuffer。
- `webview2-decode-raster`：真实`createImageBitmap`、`FontFace` glyph及Pixi Canvas/WebGL raster本轮不执行，保持开放。
- `framebuffer/device-exact`：没有锁定设备当前oracle时保持开放。

Synthetic decoder、资源hash或typed command都不能升级为真实WebView2 raster证明。

当前Score HUD候选实现已修正NineSlice轴序、已知depth、master派生marker校验和SS持久owner。Reverse `score-hud-panel-clip-portable-10-1-4@1abae506`又从当前10.1.4 APK直接确认Score UIPanel path 1451、Background_Cover anchor target、四anchor、SoftClip range/softness/offset及父级坐标，并排除AllPerfect path 1450身份混淆。`indicatorLocalX`现驱动挂在ScoreGaugeSS animation layer上的持久Pixi mask consumer；20行阈值±1/scoreMax/over-max raw矩阵由独立verifier重算。Score panel子门已随普通command/scene portable范围闭合；该结论不升级WebView2 decode/glyph/raster、GPU framebuffer或fixed-device exact。

## Evidence workflow

流程见[`evidence-workflow.md`](./evidence-workflow.md)。只消费已verify、commit、push的Reverse证据。10.1.3或其他来源必须先建立逐claim等价证明、适用域和反例检查。旧调查包可提供待重新核验的原始事实，但其`closed`、`productionAuthorization`或总体closure字段不是本轮授权。

全局隔离的条件转换仅覆盖机器账本中六个`closed-portable`行；任何单独开放、排除、device-exact或stage-9行均未随之放行。发布提交`0d0e4459f295f2d6cbbe7f4a1f93d07a1c9980fa`已push，并在detached worktree通过23-leaf完整去重DAG；该attestation只授权机器账本中的portable范围，失败关闭边界不变。

最终去重入口为`npm.cmd run simulator:test:total-revalidation`。它按唯一leaf DAG执行isolated tsc、chart/clock/input/state、render raw+independent verifier、audio、particle及host/runtime/public release path；不运行Vite/Tauri，也不声称WebView2门通过。

`mainProgramIntegrationAuthorization=false`。
