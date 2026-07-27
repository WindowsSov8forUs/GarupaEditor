# 模拟器时钟与调度阶段验收记录

## 1. 验收身份

- 目标分支：`codex/refactor-simulator-implementation`
- 阶段任务书：`tmp/simulator-clock-scheduling-task.md`
- 静态证据基线：GirlsBandParty-Reverse `74ab76f6838847d98aae1a15741a5f024e3774ff`
- 最终运行证据：GirlsBandParty-Reverse `2ba3bdbbab9be2de6fedb9b22f623bd80611c023`
- 锁定原作样本：`jp.co.craftegg.band` 10.1.4 / 230，`arm64-v8a`
- GarupaEditor 证据关闭提交：`57ce528`
- 核心实现提交：`e354c31`
- 验收日期：2026-07-27
- 验收结论：**通过。S01–S10 完成，时钟与调度阶段关闭，可以开启下一阶段 Auto Live。**

## 2. 证据硬门关闭

最终 Reverse `closure.json` 记录：

- `overall_status = confirmed-with-explicit-nonblocking-boundaries`
- `s02_gate = closed`
- `blocking_findings = []`
- 锁定门控矩阵：`version_10_1_4.sample_matrix`

低 bucket 历史回退已经完整动态闭合：

- 既有 pass-2 runs：`counter[3]` 5→6，候选 4 子步回退为 1。
- runs 081/083：`counter[2]` 20→21，候选 3 子步回退为 1。
- runs 086/087：`counter[1]` 100→101，候选 2 子步回退为 1。
- `counter[0]` 只记录 `<0.0179999992` bucket，不参与回退比较。

GarupaEditor 冻结包包含 122 个 runtime-oracle 文件，共 44,838,972 bytes；`SHA256SUMS` 含 121 行，SHA-256 为 `B6A69C72FC45D594A65CAD886DBAAB4E884E60EC3539732DEEC01A673EA14F2F`。最终 Reverse 离线校验器与 GarupaEditor 源提交/冻结副本/Git index 校验均通过。

## 3. S01–S10 逐项结论

| 任务 | 结论 | 验收要点 |
| --- | --- | --- |
| S01 静态证据冻结 | 通过 | E01–E26、F01–F04、manifest、开放边界和三方哈希校验保留完整 |
| S02 实体设备证据闭环 | 通过 | `101/21/6` 动态边界关闭；最终 closure 无 blocking finding |
| S03 谱面运行接入 | 通过 | `createSimulatorEngine` 直接接收已登记 `ChartConstructionResult`；不解析 BMS、不接收派生时钟值 |
| S04 60/120 请求 | 通过 | `InGameDirector.Awake` 幂等请求一次 60 或 120；无定时循环和物理 cadence 声明 |
| S05 双音乐时钟 | 通过 | start/current/next 数值与字符串、0.8 秒 launcher lead、192 刻度、Float32、单次 carry、callback 计数匹配 |
| S06 BPM command | 通过 | 每批源序首个 CC03/CC08、next 预告、30 槽池、正序更新、current/string 提交、inactive、即时移除匹配 |
| S07 判定偏移 | 通过 | 仅接受 `[-5,5]` 整数；Fast 每步重查 tempo，Slow 负向借位保持调用点 BPM |
| S08 自适应子步 | 通过 | 进程累积门、四 `uint` 计数器、严格阈值、`counter[1]/[2]/[3]` 回退、delta/ExecuteFrame 守恒匹配 |
| S09 两阶段调度 | 通过 | 时钟→BPM→Note 反序 Update→survivor AfterUpdate→单批激活；新组延迟到下一子步 |
| S10 生产与实体 oracle | 通过 | 普通/HABAHIRO、CC03/CC08、60/120、offset、暂停、自适应、列表顺序和失败关闭全部覆盖 |

## 4. 已落地的运行边界

### 4.1 宿主输入

生产宿主输入现在由以下三部分组成：

1. 已完成构造的 `ChartConstructionResult`。
2. `highFrequencyMode` 与 `judgeOffsetFrames` 两个已确认原作设置输入。
3. 第一切片保留的证据绑定 `OneFrameDataPoolProfile`。

构造阶段以 `WeakMap` 旁路登记原对象身份、当前 chart command 数和原作进程累积 BPM count，不向 `ChartConstructionResult` 或 `NoteInformation` 添加 fixture ID、证据 ID、测试回调或合成顺序字段。调用者克隆、手工合成或传入 `isCommand` 构造结果时，运行时返回 `evidence-required`。

### 4.2 时钟与 BPM

- 主时钟以 `CurrentBPM` 推进，launcher 以 `NextBPM` 推进。
- 起始 bar/beat 为 0；launcher lead 为 0.8 秒换算后的 Float32 位置。99.5 BPM 对应 `79.5999984741211`（`0x429F3333`）。
- 每次推进达到 192 时只减一次并增加一个 bar，不用循环修正大 delta。
- CC03/CC08 不进入 playable Note 池；每个批次只选择源序首个命令。
- BPM 专用池固定 30 槽，按游标循环扫描 inactive 对象；活跃命令在主 Note 前正序更新。
- 到点顺序为 current BPM/string 写入、`isActive = false`、callback 从活跃列表即时移除。

### 4.3 自适应与调度

- `ExecuteFrame = min(Float32(delta * 60), 1)`。
- 进程累积 BPM count 为 0 时固定单步且四计数器不更新。
- 非零时四个严格 bucket 初选 1/2/3/4 子步；当前 bucket 先 `uint` wrap 递增，再检查 `counter[1] > 100`、`counter[2] > 20`、`counter[3] > 5`。
- 最终子步数同时平分 delta 与 ExecuteFrame。
- 主 active Note 使用实时列表和固定递减索引；Update 后仍存活的对象按反向收集顺序执行 AfterUpdate。
- 每子步只检查一个 `NoteGroupIndex`；新组在激活子步不更新。

### 4.4 失败关闭

以下情况均通过 `evidence-required` 验收：

- 非有限、负数或 Float32 溢出的 frame delta。
- 无构造身份的克隆/合成 chart，以及 command-mode chart。
- 非布尔 High Frequency 或 `[-5,5]` 之外/非整数 judge offset。
- 非法 BPM 数值、空原始字符串、非法命令 denominator 或未映射 playable root。
- 具体生产 Note 的 Move/Wait/Stop/OnUpdate/AfterUpdate 行为。
- 真实触摸、完整判定业务和未恢复 OneFrame 数据填充。

## 5. 生产与实体样本结果

### 5.1 零 BPM-change 生产谱面

- F01 普通谱面：start/current/next = 220/`"220"`，change count = 0。
- F03 HABAHIRO 静态生产谱面：start/current/next = 180/`"180"`，change count = 0。
- 两者冷进程固定单步、四计数器不更新，构造批次和共享节点身份继续通过谱面阶段全部回归。

### 5.2 非零实体源

- `087_thesis_easy.bms.txt`：CC03，bar 7，absolutePos 1344，85/`"85"` → 140/`"140"`。
- `653_ikuoku_easy.bms.txt`：CC08，bar 16，absolutePos 3072，99.5/`"99.5"` → 95.5/`"95.5"`。
- 两条均验证 launcher 预告、BPM pool cursor 0→1、活跃驻留、到点提交、inactive 和 callback 同步移除。
- CC08 实体 trace frame 2267 的 Float32 子步从 beat `109.47891998291016` 精确推进到 `110.79721069335938`。
- Fast +5 在 bar 15→16 后改用 95.5；Slow -5 在 bar 16→15 借位的五步中保持已提交 95.5。

## 6. 验证命令与结果

以下命令全部通过：

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
node tmp/simulator-reverse-evidence/clock-scheduling/verify.mjs
node tmp/simulator-reverse-evidence/clock-scheduling/verify.mjs --index
```

结果摘要：

- 第一切片：17 项通过。
- 谱面构造 boundary/parsing/batches/graphs/multi-range/command/finalize 全部通过。
- 两个生产谱面验收通过：普通 roots 825，HABAHIRO roots 598。
- 时钟与调度：15 组通过。
- 依赖边界校验在每个隔离入口后通过。
- 未运行 Vite、Tauri 或 GarupaEditor 整体构建，符合阶段任务书规定。

## 7. 必须持续披露的非阻断边界

1. **HABAHIRO 实体运行样本不可得。** `786 miracle_april SPECIAL` 是限时活动谱面，当前账号不可选择；本阶段只根据冻结静态生产证据还原，不依赖实体证据，不确保百分百还原。
2. **30 槽 BPM pool 第 31 次 acquire 不可得。** 完整缓存扫描覆盖 81 个 bundle、4,176 个 BMS，单谱最大 16 个 BPM command；游标回绕按静态证据实现，不依赖实体第 31 次 acquire，不确保百分百还原。
3. 2/3/4 子步由采集器诱发慢帧观察；分支和守恒关系成立，但不得外推未插桩客户端的 delta 分布。
4. High Frequency 的 read site、持久字段和 UI owner 已闭合；radio 到持久字段的具体 callback 未端到端观察。
5. 60/120 只表示原作请求，不证明浏览器、Surface、合成器或显示器物理 cadence。

## 8. 下一阶段边界

下一阶段可按 `tmp/simulator-reconstruction-plan.md` 开启 **Auto Live**。仍然禁止在下一阶段提前实施或接入：

- 手动输入与完整判定窗口。
- 分数、Combo、生命、Skill/Fever 消费。
- Pixi 渲染、真实音频和资源加载。
- move-time、快照、`ReturnTime` 与 16 秒无输入回放。
- `App.tsx`、编辑器控制器、窗口协议、Tauri 路由和主程序入口。

Auto Live 阶段继续遵守同一证据纪律：新行为先在 Reverse 提交并冻结证据，未确认分支返回 `evidence-required`，不得以测试 RecordingNote 或 no-op 生产 Note 冒充已恢复的具体 Note 行为。
