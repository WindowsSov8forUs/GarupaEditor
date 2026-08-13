# GarupaEditor Simulator

`src/simulator`当前处于**全模块证据重验隔离期**。旧任务书、旧acceptance、旧closure字段、绿色聚合测试、Recording backend或源码标记都不再证明当前production能力。Reverse仍是唯一行为依据，但旧Reverse事实必须由本轮逐claim verifier重新核验后才能恢复消费。

## 当前全局门

所有先前的portable正向能力均为`reopened-audit`。唯一public入口`launchSimulatorModule(...)`固定返回：

- code：`evidence-required`；
- capability：`simulator.audit.total-revalidation-open`；
- boundary：installed launcher、chart parsing、static-resource selection、backend preparation、scheduler start和scene/domain owner mutation之前。

`runtime/moduleEntryBinding.ts`与production platform engine builder保留内部防绕过门。深层模块只可被隔离测试重新审查；不能据此宣称production launch可用。

机器账本：

- [`audit/current-capability-matrix.json`](./audit/current-capability-matrix.json)
- [`audit/current-claim-ledger.json`](./audit/current-claim-ledger.json)
- [`audit/current-production-integrity-review.json`](./audit/current-production-integrity-review.json)

| 门 | 状态 | 当前边界 |
| --- | --- | --- |
| Public/autonomous、chart、zero-seek runtime | `reopened-audit` | 等待当前源码逐claim和production-path重验 |
| Ordinary Pixi command/scene | `reopened-audit` | 不继承旧PR结论；Score HUD等字段需重新消费验证 |
| Audio、Particle | `reopened-audit` | 旧semantic/PCM/simulation结果只作待核验事实 |
| HAB external/original | `open-evidence-required` | external Note animation与原作runtime/frame未授权 |
| Non-zero initial seek | `open-evidence-required` | 缺少10.1.4逐claim MoveTime闭环 |
| Button 07 | `open-evidence-required` | scene/manual/render/particle mapping未知 |
| WebView2 decode/glyph/raster | `open-evidence-required` | Node synthetic `TextureSource`不证明Tauri WebView2输出 |
| Fixed-device physical exact | `open-device-exact` | cadence、GPU/framebuffer、speaker output保持开放 |
| Character/card/deck skill、Fever、multiplayer | `excluded` | public和production依赖图不得引入 |
| Main-program integration | `unauthorized-stage-9` | 不修改App/window/editor/Tauri/mobile入口 |

状态词：`closed-portable`只保留为未来逐门重新闭合后的合同词；`reopened-audit`表示候选实现被全局隔离，不能作为正向production能力；`degraded-explicit`不等于原作parity；其余开放和排除状态按表中边界解释。

## Public合同

唯一业务入口仍是：

```ts
import { launchSimulatorModule } from "src/simulator";
```

当前无request能够越过全局重验门，因此不会产生成功的`closed` receipt。合同不接受member/card/deck、角色效果、Fever或多人数据，也不暴露engine、step、backend、provider、scene、replay factory或dispose。

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

- `actual-pixi-command-scene-routing`：只在当前production raw observation由独立verifier核验后逐门恢复；旧656-batch observation不自动持续有效。
- `webview2-decode-raster`：真实`createImageBitmap`、`FontFace` glyph及Pixi Canvas/WebGL raster本轮不执行，保持开放。
- `framebuffer/device-exact`：没有锁定设备当前oracle时保持开放。

Synthetic decoder、资源hash或typed command都不能升级为真实WebView2 raster证明。

当前Score HUD候选实现已修正NineSlice轴序、已知depth、master派生marker校验和SS持久owner，并由direct actual-Pixi raw Score矩阵重新观察。但Reverse `score-hud-portable-revalidation-10-1-4@a53f8a27`确认`highRankEffectPanel.rightAnchor.absolute`缺少完整anchor target、clip range与parent portable mapping；`indicatorLocalX`尚无可见Pixi mask consumer。因此Score HUD Pixi子门及全局production门继续开放。

## Evidence workflow

流程见[`evidence-workflow.md`](./evidence-workflow.md)。只消费已verify、commit、push的Reverse证据。10.1.3或其他来源必须先建立逐claim等价证明、适用域和反例检查。旧调查包可提供待重新核验的原始事实，但其`closed`、`productionAuthorization`或总体closure字段不是本轮授权。

全局隔离只会在当前production源码、逐occurrence/field/mutation账本、各分域raw observation和一次已推送detached验收全部满足完成门后解除。任一必需门仍有unknown时，保持`evidence-required`是合法最终结果。

最终去重入口为`npm.cmd run simulator:test:total-revalidation`。它按唯一leaf DAG执行isolated tsc、chart/clock/input/state、render raw+independent verifier、audio、particle及host/runtime gate；不运行Vite/Tauri，也不声称WebView2门通过。

`mainProgramIntegrationAuthorization=false`。
