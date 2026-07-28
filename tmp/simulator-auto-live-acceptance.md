# 模拟器 Auto Live 阶段验收记录

> **2026-07-28 关闭后复审修订：最终通过。** 复审发现的普通生产 Slide `afterNoteType=None` 拒绝、Slide 回池 child Reset、Directional terminal note type 和 AL19/AL20 绕过问题，已由重开提交 `23ac2f2`、实现修复提交 `a7ce464` 及本文件所在重验收提交闭合。本文以下内容已按修复后结果重建，不再沿用被撤销的旧结论。

## 1. 验收身份

- 目标分支：`codex/refactor-simulator-implementation`
- 阶段任务书：`tmp/simulator-auto-live-task.md`
- 锁定原作样本：`jp.co.craftegg.band` 10.1.3（version code 229），`arm64-v8a`
- Auto Live Reverse 最终证据提交：`a3f28d77e71c5e7a62cab0de81f0cf668a5b745b`
- GarupaEditor 证据冻结提交：`e003f0e`
- 模式与运行子图提交：`ac7b3d0`
- Single/Flick Force Perfect 提交：`00cc5f6`
- Long/Slide 状态机提交：`f5cc3d1`
- OneFrame 聚合提交：`24c58a6`
- 外层调度与生命周期提交：`848d245`
- A10 测试与验收提交：`1fc5b7b`；冻结 oracle 直接对照增强提交：`67c4e06`
- 关闭后复审重开提交：`23ac2f2`
- 生产 Slide 与回池修复提交：`a7ce464`
- 最终 production/lifecycle 重验收：本文件所在提交
- 验收日期：2026-07-28
- 验收结论：**通过。复审发现项已闭合，A00–A10 完成，Auto Live 阶段重新关闭；下一阶段如进入手动输入与判定，必须先建立独立设备证据硬门。**

## 2. 证据硬门与冻结包

Reverse 最终 `closure.json` 记录：

```text
overall_status = confirmed
auto_live_gate = closed
blocking_findings = []
```

G01–G10 已全部关闭：

1. Auto Live 判别消费正式设置身份，不消费历史陈旧 profile。
2. `JudgementAdjustValueB` 使用最终持久值和既有 tempo-aware ±1/60 路径。
3. Slide `forcePerfectOnUpdate` 每次函数调用最多处理一个 selected current node。
4. 普通 Flick 合成 X 为 Float32 `-100`；Directional source type 10/11 分别为 `-500/+500`，且只产生一次判定。
5. Long/Slide family 状态、失活、cursor、linked/selected child 路由已由最小函数切片与固定轨迹闭合。
6. result transform 只开放 `identity-no-active-situation-skill`；其他 Skill context 失败关闭。
7. OneFrame 固定五槽、first-unused、Setup 占用和池序 Reflect 已闭合。
8. 固定 Auto-only 事件轨迹明确排除分数、生命、技能、音频和表现字段。
9. adaptive 子步位于 NoteManager 内部，Reflect 由同一外层帧 owner 调用一次。
10. Long/Slide 直接消费生产构造图的父拥有、源序共享身份；不重新解析 BMS。

GarupaEditor 冻结包位于 `tmp/simulator-reverse-evidence/auto-live/`，包含：

- 30 个候选基线条目；
- 43 个最终 evidence/contract/最小切片条目；
- `auto-live-fixed-event-trace.json`；
- `auto-live-failure-cases.json`；
- `closure.json`、`OPEN_GAPS.md`、manifest 与源/副本/Git index 三方校验器。

最终校验结果：

```text
auto-live evidence verified: candidates=30, final=43, gate=closed, index=checked
```

测试只读取 GarupaEditor 已冻结的 JSON 和生产 BMS，不访问 Reverse 工作树，不执行 Python，不联网。

## 3. A00–A10 逐项结论

| 任务 | 结论 | 验收要点 |
| --- | --- | --- |
| A00 阶段任务书 | 通过 | 范围、硬门、证据候选、22 项测试矩阵、提交和完成定义完整 |
| A01 静态证据晋升 | 通过 | Reverse `a3f28d77` 晋升 43 个最终条目并修复 E02/E05/E30 陈旧 source profile |
| A02 固定事件 oracle | 通过 | G01–G10 closed，双次离线生成一致，失败矩阵和持续边界冻结 |
| A03 模式与上下文 | 通过 | 宿主强制显式 `manual`/`auto-live`；mode14/debug/未知 transform 拒绝 |
| A04 Long/Slide 运行图 | 通过 | 普通/特殊 terminal 联合验证；root 父拥有共享 child；缺 terminal、重复身份、非递增源序拒绝；父回池清 graph/current |
| A05 Single/Flick | 通过 | Normal `>=`；Flick Began→synthetic Moved→一次结果；Directional 参数和类型精确 |
| A06 Long | 通过 | head `>=`、tail `>`、Move→Wait、linked finish→tail、最终 Deactive 匹配 |
| A07 Slide | 通过 | source-order current、invisible、terminal 8/5/6/7、Stop intermediate、Deactive Reset 和一次调用粒度匹配 |
| A08 OneFrame | 通过 | 固定 5 槽、first-unused、原子 Setup、部分投影、池序 Reflect、清除、空帧和第六条失败匹配 |
| A09 调度生命周期 | 通过 | 反向 root、父子 AfterUpdate、adaptive 外层一次 Reflect、active Slide/slot 暂停冻结、复用和 dispose 清理匹配 |
| A10 生产 oracle | 通过 | AL01–AL22、普通 93/HABAHIRO 51 个 production Slide root、失败矩阵、全部隔离回归和依赖边界通过 |

## 4. 已落地的生产边界

### 4.1 显式模式

`SimulatorEngineInput.runtime.playMode` 是必填判别联合：

```ts
type SimulatorPlayMode =
  | { kind: "manual" }
  | {
      kind: "auto-live";
      resultTransform: "identity-no-active-situation-skill";
    };
```

- 不存在隐式默认模式。
- `InGameCalculatedData.isAutoPlay` 只在显式 Auto Live 分支为 true。
- mode 14、debug Force Perfect、任意 `forcePerfect: boolean` 捷径和未知 result transform 均返回 `evidence-required`。
- manual crossing 不进入 Auto Force Perfect；真实触摸、手动窗口和普通 timeout Miss 仍失败关闭/后置。

### 4.2 Single、Flick 与 Directional

- `NoteSingleBase.MoveState` 每次从 NoteManager 获取 adjusted music position，不缓存整帧值。
- Normal 在 `adjusted < root` 保持 Move，在 `adjusted >= root` 的同次 Update 提交一个 head Perfect 并 Deactive。
- Perfect raw/adjusted 枚举固定为 4，addCombo 为 1，JudgeTiming None 为 0。
- 普通 Flick 顺序为 synthetic Began、Float32 `-100` Moved、一个 note type 3 判定、Deactive。
- Directional source type 10/11 的 synthetic X 分别为 `0xC3FA0000`（-500）和 `0x43FA0000`（+500），判定 note type 为 9；其他 source type 在 Setup 前失败关闭。

### 4.3 Long 与 Slide 父拥有子图

- Long terminal runtime 只由 Long root 持有；激活要求 Long after family 且 terminal position 严格大于 root。
- Long head 比较为 `>=`，状态切 Wait；tail 比较为严格 `>`，顺序为 linked child Update/finish、tail Perfect、父 Deactive。
- Slide child runtime 直接引用生产 `slideNoteList` 的共享 `NoteInformation`，按源序持有；child 不进入 NoteManager 根 active list。
- Slide 激活联合验证 root after type 和最后共享 child game-note type：普通 `None + SlideEndA/B`、Flick、Directional、Multiple Directional；同时验证非空列表、对象身份唯一和严格递增 position。
- head 使用 `>=`；pending visible 使用 `>=`。`forcePerfectOnUpdate` 不使用 while，每次只推进一个 current。
- invisible support 每次只推进一个 cursor，不产生 OneFrame；intermediate、terminal 和 Stop selected 路由分离。
- AfterUpdate 顺序为父 base 在先，再转发 Long linked 或 Slide current child。
- terminal Deactive/父回池时按 R02 遍历 reset child 并清 graph/current；dispose 幂等执行同一清理，下一次激活从生产共享身份重建，不泄漏 judged/cursor。
- terminal judgement note type 精确为普通 8、Flick 5、Directional 6、Multiple Directional 7；Stop selected 固定走 intermediate note type 8，不冒充 terminal tail。

### 4.4 OneFrame 判定投影

生产容量不再由宿主或测试配置。控制器固定建立 5 个槽：

- `GetUsableOneFrameData` 按槽 0→4 返回首个 `IsUse=false`，获取本身不占用。
- Auto Live Setup 先完整验证已闭合字段，再一次提交不可变 payload 与 `IsUse`。
- foreign handle、duplicate Setup、非法 payload 不修改槽位。
- 第六条 simultaneous entry 返回 `one-frame.pool-exhausted`，保留前五条，不扩容、不覆盖、不 clamp。
- Reflect 只在 exists 时执行，按池序生成 `OneFrameJudgementBatch` 后统一清槽。
- 空帧返回 null，不生成伪 batch，也不递增 batch index。

投影只包含：note index、button types、note type、phase、raw/adjusted Perfect、addCombo、absolute position、JudgeTiming、slot/container identity。它不叫原作完整 `OneFrameTotalData`，也不包含分数、Power、生命、Skill/Fever/Crescendo、音频、粒子、渲染、HUD 或 record 数值占位。

### 4.5 外层调度、暂停和失败

- 沿用已验收的时钟→BPM→root 反序 Update→survivor AfterUpdate→单批激活顺序。
- Long/Slide child 更新不改变根 active list Count。
- adaptive 1–4 子步全部在 NoteManager 内完成；同一外层帧产生的判定共享五槽池，InGameManager 成功返回后只 Reflect 一次。
- 任一子步失败立即停止，不继续子步、不 Reflect；第六条边界留下已提交五槽供审计。
- PauseSound 在 NoteManager 前返回，冻结时钟、root/child state、cursor、slots 和 trace；resume 不补跑暂停时间。
- dispose 失活并解绑 root/BPM、清 child runtime 和 pool cursor、关闭 Slide manager、清未 Reflect payload，不产生判定或后端副作用。

## 5. AL01–AL22 验收摘要

| ID | 结果 | 核心断言 |
| --- | --- | --- |
| AL01 | 通过 | manual/Auto 判别明确，同 crossing 只有 Auto Force Perfect |
| AL02 | 通过 | B=-5/0/+5 复用 tempo-aware 路径，关系为 rewind/identity/advance |
| AL03 | 通过 | Normal before/equal、Float32 bits、同次 Deactive、后续不重复 |
| AL04 | 通过 | 同批五 root 反序 Update，payload identity 为 204→200，slot 为 0→4 |
| AL05 | 通过 | Flick Began→-100 Moved→一次 note type 3 判定 |
| AL06 | 通过 | Directional 10/11、±500 bits、note type 9 精确 |
| AL07 | 通过 | Long head equal、Wait、独立 head payload |
| AL08 | 通过 | Long tail equal 不判，下一大于值 linked finish→tail→Deactive |
| AL09 | 通过 | Slide head equal、Wait、current=0 |
| AL10 | 通过 | intermediate 源序 cursor +1；invisible 不占槽 |
| AL11 | 通过 | terminal 8/5/6/7、tail/Deactive cleanup、Long/Slide 复用与 Stop intermediate 路由分离 |
| AL12 | 通过 | adjusted 大步时每次 OnUpdate 最多推进一个 current |
| AL13 | 通过 | Long base→linked、Slide base→current AfterUpdate 顺序 |
| AL14 | 通过 | 3 adaptive 子步产生 3 entry，外层只有一次 Reflect |
| AL15 | 通过 | 固定五槽、池序、清除和 slot 0 复用 |
| AL16 | 通过 | 第六条失败，前五槽逐字节状态不变并可池序 Reflect |
| AL17 | 通过 | 空 Reflect 为 null，首次非空 batch index 仍为 0 |
| AL18 | 通过 | active Slide graph/cursor/trace 与 occupied slot 暂停冻结；恢复单步；active dispose 清 graph/slot且无新事件 |
| AL19 | 通过 | 两个 production BMS 分别覆盖四 family；全部 93/51 个 Slide root 激活；各完整跑通普通 Slide 并清 graph |
| AL20 | 通过 | HABAHIRO 普通 Slide production graph 共享身份可静态消费，并检查持续 runtime 证据披露 |
| AL21 | 通过 | 阶段外字段在类型/对象上 absent，业务 consumer 失败关闭；重复投影字节一致 |
| AL22 | 通过 | 冻结 failure matrix、非法模式/图/位置/family/handle/Setup/触摸全部拒绝且关键状态原子 |

## 6. 验证命令与结果

以下 A10 隔离命令全部通过：

```powershell
npx.cmd tsc -p src/simulator/tsconfig.json
npm.cmd run simulator:test:first-slice
npm.cmd run simulator:test:chart-boundary
npm.cmd run simulator:test:chart-parsing
npm.cmd run simulator:test:chart-batches
npm.cmd run simulator:test:chart-graphs
npm.cmd run simulator:test:chart-multi-range
npm.cmd run simulator:test:chart-command-data
npm.cmd run simulator:test:chart-finalize
npm.cmd run simulator:test:chart-production
npm.cmd run simulator:test:clock-scheduling
npm.cmd run simulator:test:auto-live
node tmp/simulator-reverse-evidence/auto-live/verify.mjs
node tmp/simulator-reverse-evidence/auto-live/verify.mjs --index
```

结果摘要：

- 模拟器隔离 TypeScript：通过。
- 第一切片：17 项通过。
- 谱面构造 boundary/parsing/batches/graphs/multi-range/command/finalize：全部通过。
- production chart acceptance：普通 825 roots；HABAHIRO 598 roots。
- 时钟与调度：15 组通过。
- Auto Live：AL01–AL22 共 22 组通过。
- 依赖边界：每个隔离测试入口后通过。
- Auto Live 证据包：`candidates=30, final=43, gate=closed, index=checked`。
- 未运行 Vite、Tauri 或 GarupaEditor 整体构建，符合任务书限制。

## 7. 持续非阻断边界

1. **手动输入与普通 timeout Miss 未恢复。** manual 只保证不走 Auto Force Perfect；触摸仲裁、判定窗口、释放、Hold 音效和普通 Miss 属于下一阶段。
2. **分数与状态消费未恢复。** Score、Power、Combo 的完整消费、Life、Skill、Fever、Crescendo、record 与 HUD 均不在本阶段；不得把当前 judgement projection 外推为完整原作结果。
3. **表现层未恢复。** 音频、粒子、渲染、资源、GPU、Unity PlayerLoop 呈现和设备输出相位无实现、无声明。
4. **HABAHIRO 无实体 Auto Live 运行样本。** 当前只确认 production 静态构造图可被相同父子 runtime 消费，不宣称已有实体运行证据或百分百保真。
5. **结果变换范围有限。** 只确认没有 active situation Skill 的 identity transform；其他技能上下文必须继续 `evidence-required`。
6. **完整主程序仍未接入。** 本阶段未修改 `App.tsx`、编辑器控制器、窗口协议、Tauri 路由、渲染或音频后端。

## 8. 下一阶段硬门

下一阶段只允许按整体计划进入“手动输入与判定”。开始生产实现前必须：

1. 在 GirlsBandParty-Reverse 建立手动 touch ownership、lane/button arbitration、判定窗口、Flick/Long/Slide 手动状态、timeout Miss 和 release 的独立证据任务书。
2. 对任务书开放缺口建立实体设备采证硬门；不能沿用 Auto Live 的 Perfect 常量绕过输入与 timing 证据。
3. 先提交 Reverse 证据、冻结 GarupaEditor 证据包并关闭门，再实现代码。

在该硬门关闭前，真实输入和手动判定继续失败关闭；仍禁止主程序入口、Pixi/WebAudio、窗口协议和编辑器控制器接入。
