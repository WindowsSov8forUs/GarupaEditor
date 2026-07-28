# 模拟器 Auto Live 阶段实施任务书

## 1. 文档身份

- 阶段：模拟器彻底重构实施块 3——Auto Live。
- 创建日期：2026-07-27。
- 目标分支：`codex/refactor-simulator-implementation`。
- 唯一行为依据：`HOST________\VSCode\GirlsBandParty-Reverse`。
- 静态候选基线：GirlsBandParty-Reverse `74ab76f6838847d98aae1a15741a5f024e3774ff`。
- 锁定原作样本：`jp.co.craftegg.band` 10.1.3（version code 229，`arm64-v8a`）。
- 上游已验收阶段：第一切片、谱面构造、时钟与调度。
- 上游时钟调度验收提交：GarupaEditor `78414bc`，关闭记录修订提交 `ca84258`。
- 当前状态：**第十一次审计的三项生产修复已实现并通过定向TypeScript、第一切片、时钟与Auto Live回归，但A08/A09/A10继续保持打开，阶段未完成。OneFrame handle现按controller对象身份校验，judgement source与Multiple exact count由NoteManager owner绑定；Long/Slide/Multiple图在host接受chart及NoteManager setup mutation前按既有R04/U01约束preflight。根据新增验收纪律，修复批不得同批宣布结束；下一批必须从A00–A10逐项重新建立“任务要求→原作证据→生产路径→独立观察”映射并继续审计，任何未明确项都要继续修复。**
- 最终验收记录：`tmp/simulator-auto-live-acceptance.md`。
- 已冻结证据包：`tmp/simulator-reverse-evidence/auto-live/`。

### 1.1 阶段目标

本阶段只恢复已确认的 Auto Live 托管层行为：

1. `InGameCalculatedData.get_IsAutoPlay` 对 Auto Live 的路由边界。
2. Normal、Flick、Directional Flick 的 adjusted-position Force Perfect。
3. Long 头、尾分阶段完成以及父/After Note 的更新所有权。
4. Slide 头、中间节点、终端节点的分阶段完成和一次调用粒度。
5. Auto Live 产生的 Perfect 判定进入 `OneFrameData` 容器、同一外层帧统一收集并回收。
6. 以 Reverse 中 Python 原型生成的**已提交固定事件轨迹**作为离线 oracle；TypeScript 生产代码和测试运行时不得调用 Python。

“完成 Auto Live”不表示已经恢复手动输入、完整判定窗口、分数、生命、技能、Fever、判定音、粒子、渲染或主程序接入。

### 1.2 已锁定决策

1. 沿用现有 `createSimulatorEngine`、`initialize`、`step`、`pause`、`resume`、`snapshot`、`dispose` 宿主边界，不新增第二套运行入口。
2. Auto Live 模式由宿主显式选择；不得把 `false`、`true` 或原作 `IsAutoPlay` 的任一来源设为隐式默认值。
3. 不把原作内部的 mode `14` Force Perfect 路由伪装成 Auto Live；本阶段只消费 `IsAutoLive` 使 `get_IsAutoPlay` 成立的路径。
4. 继续使用时钟阶段已恢复的 `NoteManager.GetAdjustMusicPos`。Auto Live 不建立第二套 offset、tempo map 或 60 Hz 推进算法。
5. Long/Slide 子节点是父 Note 拥有的运行对象，不加入 `NoteManager` 根 active list；其 Update/AfterUpdate 只能由父 Note 驱动。
6. `OneFrameData` 本阶段只填充能够在 Auto Live 判定链中静态闭合的字段。分数、Power、生命、Fever、Skill、Crescendo 与 HUD 字段必须以“未恢复”表示，禁止填 `0`、`1` 或方便测试的默认值。
7. 本阶段可公开一个 GarupaEditor 测试侧的“判定批次投影”，但不得把不完整投影命名或宣称为原作完整 `OneFrameTotalData`。
8. Python 原型是离线 oracle 生成器，不是原作行为证据本身；所有被 oracle 固化的分支必须先由反编译、ARM64 或只读运行证据闭合。
9. 可视粒子、判定音和 Flick 手指特效属于后续渲染/音频阶段。本阶段只恢复它们之前的 Flick 判定路由和可记录调用边界。
10. A02 前发现的任何不一致均失败关闭；不得选择“更像正确”的一个 JSON、沿用 Python 原型默认值或以生产谱面恰好未触发来绕过硬门。
11. E15 的 current-child position gate 位于 intermediate/terminal 处理之前；portable Slide runtime 必须对 invisible 与 visible current child 同样先执行有限值检查和 `adjusted < child.absolutePos` 返回。invisible 只表示到点后不提交 OneFrame 并单次推进 cursor，不表示可绕过 crossing。
12. 宿主校验成功后的 `playMode` 必须由引擎持有规范化不可变副本；不得保存调用者对象引用，也不得通过 `InGameCalculatedData.playMode` 暴露可修改的内部状态。调用者在 `createSimulatorEngine` 返回后修改原对象不能改变 manual/Auto Live、mode14/debug 或 result-transform 路由。
13. **修复批与验收批必须分离。** 任何生产修改及其定向测试通过后，只能标记“实现完成，待独立验收”；不得在同一批或紧随其后的同视角检查中恢复阶段完成。
14. 每次验收必须重新遍历A00–A10与第12节全部完成项，为每项明确记录“任务要求→已提交原作证据ID/portable边界依据→生产调用路径→独立实际观察”；不得引用上一轮“保持有效”代替本轮确认。
15. 验收必须枚举`producer × owner × consumer × lifecycle × failure point × mutation`组合；类别样例、结构类型检查、代表性production root或全量测试绿色均不能外推为整个类别闭合。
16. 只有所有纳入范围均有明确证据和实际生产路径观察、所有失败路径均有证据允许的原子状态、且无开放required-before-close项时才能停止；否则必须保持阶段打开并继续修复。

### 1.3 执行进度

| 任务 | 状态 | 完成标准 |
| --- | --- | --- |
| A00 建立阶段任务书 | 已完成 | 范围、证据候选、硬门、实现批次和验收矩阵写入本文档 |
| A01 晋升 Auto Live 静态证据 | 补充完成 | Reverse `cd84d2ce` 补齐 Multiple/visual ARM64，`7a0540dc` 补齐 committed offset cursor identity；冻结 R09–R16 |
| A02 生成固定事件 oracle 并关闭缺口 | 第五次补充完成，代码门解除 | Reverse `c2dc5c7f` 以 G22 增加 committed exact delta/BMS replay与 adaptive full outer-frame identity |
| A03 接入 Auto Live 模式与判定上下文 | **修复完成** | 校验返回规范化冻结值，owner再持有冻结副本；调用者与getter别名突变回归通过 |
| A04 建立 Long/Slide 运行子图 | 修复完成 | 普通生产 Slide 由 terminal child + root after type 联合识别；父 Deactive 时按 R02 清 child graph/current，复用重建共享身份 |
| A05 恢复 Single/Flick Force Perfect | 已完成 | Multiple owner 遍历完整 playable source order；其他 family/equal button 断组，method fixture 精确通过 |
| A06 恢复 Long 分阶段完成 | 已完成 | head/tail 第六槽保留 native Wait/linked order，并由 manager terminal fault 阻止重试 |
| A07 恢复 Slide 分阶段完成 | **修复完成** | invisible 与 visible current 统一先过 E15 adjusted-position/finite gate；synthetic 与 production 首 invisible child before/equal 回归通过 |
| A08 恢复 Auto Live OneFrame 填充与聚合 | **实现修复，待独立验收** | handle对象身份、chart source owner与Multiple exact group-count已绑定；定向AL22通过，不据此关闭 |
| A09 接入调度、暂停与生命周期 | **实现修复，待独立验收** | host与manager均在BPM/root mutation前preflight已确认图约束；定向组合回归通过，不据此关闭 |
| A10 生产 oracle 与阶段验收 | **重新验收待执行** | 必须按新纪律重新确认A00–A10全部任务与证据/生产观察，不能只重跑AL01–AL22 |

### 1.4 批次记录

#### 2026-07-27 第一批：A00 任务书建立

- 读取整体计划、前三阶段任务书/验收记录、现有 `src/simulator` 边界和 Reverse 静态候选。
- 确认现有证据已经覆盖 Single、Long、Slide、Flick 和 OneFrame 主调用链，但 Auto Live 汇总 JSON 存在内部源哈希陈旧，不能直接作为实施锁。
- 将 A01/A02 设为代码硬门：先在 Reverse 晋升最小反编译切片并生成固定事件 oracle，再冻结到 GarupaEditor，最后实施 A03–A10。
- 明确分数、生命、技能、Fever、音频、粒子和渲染继续后置；本阶段不使用零值或 no-op 冒充这些链路。

#### 2026-07-28 第二批：A01/A02 证据晋升与硬门关闭

- Reverse 新增 `artifacts/investigations/auto-live-runtime-contract/`，提交 `a3f28d77e71c5e7a62cab0de81f0cf668a5b745b` 并推送 main。
- 最小证据覆盖 `get_IsAutoPlay`、Single/Flick/Directional、Long/Slide Force Perfect、OneFrame 5 槽与 `updatePlayState` outer Reflect owner。
- Directional Flick 原始 ARM64 确认 source type 10→`-500.0f`、11→`+500.0f`；普通 Flick 为 `-100.0f`，Began→Moved 只产生一次判定。
- Long 根 `>=`、尾严格 `>`；Slide 每次 `forcePerfectOnUpdate` 只处理一个 selected current after，均进入固定事件 oracle。
- E02/E05/E30 陈旧内嵌 profile 通过最终 contract 的实际 Git blob profile 与修订链关闭；正式样本继续锁定 persisted B=0，不设全局默认。
- Python 固定轨迹生成器两次输出一致；oracle 明确排除 score/life/skill/audio/particle/rendering，GarupaEditor 只冻结 JSON。
- GarupaEditor 证据包冻结 30 个候选条目、43 个最终条目、2 个 fixture alias 与 2 个上游 manifest；工作树校验通过，暂存后执行 index 校验。
- `OPEN_GAPS.md` 记录无阻断项和四类持续非阻断边界；A03–A10 代码硬门解除。

#### 2026-07-28 第三批：A03/A04 模式与运行子图

- 宿主 runtime settings 新增必填 `playMode`：只接受 `manual` 或带 `identity-no-active-situation-skill` 的 `auto-live`；mode14、debug Force Perfect、缺失模式和未知结果变换失败关闭。
- 新增最小 `InGameCalculatedData` owner；`isAutoPlay` 只由显式 Auto Live 模式成立，未把宿主判别联合直接散布到 Note 类型。
- Long 激活前验证 terminal 类型与严格后置位置，建立父拥有的 `LongAfterRuntime`；Slide 从冻结 `slideNoteList` 共享对象按源序建立 after runtime 列表并拒绝缺失/重复身份。
- 子节点当前只建立所有权与判定状态载体，不加入根 active list，不提前实现 Force Perfect 或手动判定。
- 全部现有宿主 fixture 显式选择 manual；模拟器 TypeScript、第一切片 17 项和时钟调度 15 组回归通过。

#### 2026-07-28 第四批：A05 Single/Flick Force Perfect

- `NoteSingleBase.MoveState` 在每个原作调用点读取既有 adjusted music position；`adjusted < root` 保持 Move，crossing 后仅 Auto Live 进入 Force Perfect，manual 按 R02 保持 Move 且不提交。
- Normal 使用 judge note type 0，成功提交一次 head 请求后 Deactive；`NoteBase.ExecuteUpdate` 在状态阶段失活后不再调用 OnUpdate，匹配原作二次状态检查。
- Flick 按 R02 记录 Began→synthetic Moved，普通值为 Float32 `-100`、judge note type 3；Directional source type 10/11 分别为 `-500/+500`、judge note type 9，其他类型失败关闭。
- 新增 Note 级共享 Auto Live runtime callback；SetupNotes 统一安装 `isAutoPlay`、adjusted position 与判定提交边界，不让 Note 持有 manager/controller。
- A08 前生产 OneFrame Auto Setup 继续在明确的 `one-frame.auto-live-setup-pending` 门停止；本批只恢复到已确认提交边界，不以测试 staging 冒充业务数据。
- 模拟器 TypeScript 与第一切片 17 项回归通过。

#### 2026-07-28 第五批：A06/A07 Long 与 Slide

- Long root 激活前清除旧子图并验证 terminal 仅属于 Long after family 且位置严格后置；head 使用 `adjusted >= root` 切 Wait 并提交一次 Perfect。
- Long 父 OnUpdate 先驱动 linked after Update；tail 只在 `adjusted > terminal` 时依序执行 linked finish→tail Perfect→父 Deactive，等于 terminal 保持 Wait；AfterUpdate 保持 base→linked 顺序。
- Slide root 激活前清除旧 cursor/trace，并验证 Slide terminal family、共享身份唯一和严格递增源序；子节点仍不加入 NoteManager 根 active list。
- Slide head 使用 `>=` 切 Wait；每次 OnUpdate 只选择 current pending after，不使用 while。invisible support 单次跳过且不提交 OneFrame；visible intermediate/terminal 每调用最多推进一项，terminal 后 Deactive。
- Slide OnUpdate/AfterUpdate 的父、after-list、selected child 顺序形成生产可审计轨迹；Wait/Stop 均只从共同 OnUpdate 进入一次 pending-node 路径，不重复推进。
- 普通 Wait/Stop Miss、手动释放、Hold 音效和视觉移动继续不实现；非有限 adjusted position在状态变化与判定提交前失败关闭。
- 模拟器隔离 TypeScript、第一切片 17 项与时钟调度 15 组回归通过。

#### 2026-07-28 第六批：A08 OneFrame 填充与聚合

- 删除生产 `OneFrameDataPoolProfile` 和宿主容量输入；控制器初始化固定创建 5 槽，`GetUsableOneFrameData` 每次按 0→4 返回首个 `IsUse=false`，获取本身不占用。
- Auto Live Setup 在任何写入前验证 note identity、button types、phase、note type 与有限 absolute position；成功后一次提交已闭合 payload 与 `IsUse`，foreign handle 和 duplicate Setup 保持池不变。
- payload 只包含 note identity/button types/note type/phase、raw/adjusted Perfect 4、addCombo 1、absolute position 与 JudgeTiming None 0；分数、Power、生命、Skill、Fever、音频、粒子、渲染和 HUD 字段在类型上缺席。
- Reflect 只在 exists 成立时按固定池序建立 `OneFrameJudgementBatch` 投影并统一清槽；空帧返回 null 且不递增 batch index，第六条返回 `evidence-required` 并保留前五条。
- 删除生产 `stageFixture`；第一切片容器测试改为走正式 Auto Live Setup，覆盖 5 槽占用、耗尽、池序收集与回收。
- 模拟器隔离 TypeScript、第一切片 17 项与时钟调度 15 组回归通过。

#### 2026-07-28 第七批：A09 调度、暂停与生命周期

- 保持既有 NoteManager 的 BPM-before-root、根 active list 反序 Update、survivor AfterUpdate 和全部 adaptive 子步；父拥有 Long/Slide child 更新未进入根列表、未改变根 Count。
- `InGameManager` 只在 NoteManager 整个子步循环成功返回且 OneFrame exists 时执行一次 Reflect；空外层帧不调用/不伪造 batch，多子步判定共享同一个 5 槽池。
- 任一子步失败立即返回，不进入剩余子步或 Reflect；OneFrame 第六条失败时已提交的五条保持占用，供调用方审计原生边界。
- PauseSound 继续在输入分派后、NoteManager 前返回，因此 music clock、Auto cursor、child 状态、OneFrame slots 和事件轨迹全部冻结；resume 不进行补步。
- pool cursor 改为仅在 Note 激活成功后提交；Long/Slide 图验证失败不会消耗 cursor 或激活 root。
- dispose 统一使 root/BPM 对象失活、清除绑定 Note/child runtime、归零 pool cursor、关闭 Slide manager 并清空未 Reflect 的 OneFrame payload，不产生判定或后端副作用；重复 dispose 仍幂等。
- manager snapshot 增加最小 calculated-data 投影，可审计 manual/Auto Live 与 identity transform，但不暴露 mode14/debug flag。
- 模拟器隔离 TypeScript、第一切片 17 项与时钟调度 15 组回归通过。

#### 2026-07-28 第八批：A10 固定轨迹与阶段验收

- 新增 `runAutoLiveTests.mjs` 与 `simulator:test:auto-live`；测试只读取冻结 JSON/BMS，编译 TypeScript 后调用生产类，不访问 Reverse、不执行 Python、不联网。
- AL01–AL22 按第 9 节 ID 逐项通过：模式/offset/Float32 crossing、反向同批、Flick/Directional、Long、Slide current/invisible/terminal/Stop、AfterUpdate、adaptive outer Reflect、5 槽/第六条/空帧、暂停、production graph、HABAHIRO 披露、阶段外字段和失败矩阵。
- 普通与 HABAHIRO production BMS 的真实 `NoteInformation`/共享 child identity 直接进入 Auto Live payload；HABAHIRO 只声明静态构造图可消费，未扩张为实体 runtime 结论。
- 失败矩阵覆盖非法/缺失模式、mode14、未知 transform、Directional source、Long/Slide 坏图、重复 child、foreign/duplicate OneFrame、sixth entry、非有限位置、未知 family、手动 touch 与业务 consumer；关键状态保持任务书约定原子性。
- 建立 `tmp/simulator-auto-live-acceptance.md`，README 更新为 Auto Live 已关闭，并把下一阶段限定为必须先建独立设备证据硬门的手动输入与判定。
- 完整 A10 隔离命令通过：TypeScript；第一切片 17 项；全部谱面构造套件；production roots 825/598；时钟调度 15 组；Auto Live 22 组；依赖边界；证据包源/副本/index 校验。
- 最终审计进一步把冻结 oracle 的 11 个 case ID、Flick/Directional Float32 bits、Long 事件、Slide cursor、同批 slot/note order 和 adaptive outer Reflect 直接作为测试期望消费，禁止测试仅靠重复硬编码结论通过。
- 未运行 Vite、Tauri 或整体 GarupaEditor 构建；未修改主程序入口、编辑器控制器、窗口协议、渲染或音频实现。

#### 2026-07-28 第九批：关闭后复审与阶段重开

- 复审确认 chart construction 对普通 `SlideEndA/B` 生产 root 写入 `afterNoteType=None`，而 `NoteSlide.activate` 错误要求 `afterNoteType>=SlideEnd`：普通谱面 93/93 个 Slide root、HABAHIRO 48/51 个普通 Slide root 因而返回 `auto-live.invalid-slide-after-graph`。
- AL01–AL18 的 synthetic `slideInfo` 人工写入生产构造不会产生的 `AfterNoteType.SlideEnd`；AL19 又以相同阈值过滤普通 Slide 并从合并的 HABAHIRO chart 选取特殊 terminal，违反第 8 节停止条件；AL20 只消费 HABAHIRO Normal，未消费 Slide graph。
- R02 冻结的 `NoteSlide.deactivate @ 0x321EF80` 会遍历 child、执行 deactivate/reset 并清 current pointer；现实现仅在 dispose 或下一次 activate 清 graph，父进入 Deactive/回池时未恢复该职责，也没有 Note pool reuse 测试。
- `NoteSlide.afterNoteJudge @ 0x321F874` 还确认 terminal note type 映射为普通 8、Flick 5、Directional 6、Multiple Directional 7；现实现把 Directional 错写为 7，须一并修正。
- 旧 Auto Live 22 组与全部上游隔离测试仍通过，说明测试存在盲区而非问题不存在；阶段完成勾选和验收结论现已撤销。
- 本轮只纠正文档完成度，不改生产代码；下一批先修 A04/A07，再补 A09/A10 production/reuse/pause/dispose oracle。

#### 2026-07-28 第十批：A04/A07 生产 Slide 与回池修复

- `NoteSlide.activate` 不再把普通 terminal 的合法 `afterNoteType=None` 当成缺图；改为联合验证 root after type 与最后共享 child 的 `gameNoteType`：普通 A/B→note type 8、Flick A/B→5、Directional 左右→6、Multiple Directional 左右→7，非法组合继续失败关闭。
- 普通 `SlideEndA/B`、Flick、Directional 和 Multiple Directional synthetic contract 均覆盖精确 terminal note type；修正了旧实现把 Directional terminal 错写为 7 的问题。
- `NoteBase` 增加 derived deactivation hook；Long/Slide 父进入 Deactive/回池时先从根 active list 移除，再按 R02 清 linked/list child、judged 状态、current pointer 与 terminal mapping。dispose 仍执行同一清理且幂等。
- Long/Slide snapshot 增加最小 child graph 投影，用于审计 parent ownership、shared source identity、current、terminal mapping、judged 与 Deactive cleanup；未加入 fixture/evidence/case ID。
- Stop Force Perfect 按 `forcePerfectStopState` 的 intermediate judge 虚槽固定提交 phase intermediate、note type 8，不再把 selected terminal 错走 after-note tail route或提前使父失活。
- 生产图审计确认普通谱面 93/93、HABAHIRO 51/51 个 Slide root 均可直接激活；两个 production chart 的普通 Slide 可逐 current 完成并在 terminal 后清 graph。
- 模拟器隔离 TypeScript 与修订后的 Auto Live 22 组通过；A09/A10 仍需完成全部上游回归、证据 index 校验和最终文档重建。

#### 2026-07-28 第十一批：A09/A10 生产与生命周期重验收

- synthetic `slideInfo` 改为生产普通 terminal 真实形状：root `afterNoteType=None`、最后共享 child `gameNoteType=SlideEndA/B`，不再测试侧写入生产构造不会产生的 `AfterNoteType.SlideEnd`。
- AL11 精确覆盖普通/Flick/Directional/Multiple terminal note type 8/5/6/7、terminal Deactive 后 child graph/current 清除、同一 Long/Slide pool object 复用和 Stop intermediate route。
- AL18 改用 active Slide：暂停前完成 head 并额外占用 OneFrame slot，暂停帧逐字节比较 NoteManager child graph/cursor/trace 与 OneFrame slots；resume 只推进一个 current；active dispose 清 root/child/slot 且不追加判定/Reflect trace。
- AL19 不再合并两个 chart 后挑特殊 terminal：分别要求普通与 HABAHIRO chart 各自提供 Normal/Flick/Long/Slide；逐一验证两个 production chart 的全部 Slide root（93/51）可激活、child source identity 逐对象共享，并各完整跑通一个普通 Slide 的 invisible/intermediate/terminal/Deactive/cleanup 路径。
- AL20 改为直接消费 HABAHIRO `afterNoteType=None` 的普通 Slide graph，不再用 Normal 代替；继续检查 HABAHIRO runtime static-only 披露。
- AL22 duplicate/missing Slide failure fixture 同步改为生产 terminal 形状，确保失败来自缺图/重复身份本身而非错误 after type。
- 完整 A10 隔离验证重新通过：TypeScript、第一切片 17 项、全部谱面构造套件、production roots 825/598、时钟调度 15 组、Auto Live 22 组、依赖边界，以及 Auto Live 证据 source/copy/index 校验。
- 最终复审未发现新的 required-before-code 或 blocking finding；A04/A07/A09/A10 和阶段完成勾选重新关闭，下一阶段仍须建立独立手动输入设备证据硬门。

#### 2026-07-28 第十二批：第二次关闭后独立审计

- 审计不以 AL01–AL22 通过代替任务书覆盖核验：冻结 R03 的 11 个 case 不含 Slide Stop、pause/resume 或 BPM change boundary；B=-5/0/+5 case 的 `adjusted_position` 三项均为 120/`0x42F00000`，只保留文字 relation，不能承担精确 offset crossing oracle。
- AL11 Stop 通过测试侧直接 `changeState(Stop)` 和硬编码期望；AL18 只用 synthetic active Slide，未消费 frozen pause case，也未覆盖 A06 要求的 active Long pause；因此旧 A02/A06/A07/A09/A10 关闭结论无效。
- AL19 的 production family 列表只有 Normal/Flick/Long/Slide，过滤了 standalone Directional 与 Multiple Directional；create engine 后也未执行到真实 crossing，违反 AL19“各家族真实 root/graph 路径与 fixed trace 一致”的完成定义。
- 当前生产构造审计：普通谱面有 standalone Directional 38、核心 Multiple Directional 195；HABAHIRO 有 standalone Directional 12、核心 Multiple Directional 220，另有 1 个 AddSlide Multiple Directional visual。现 `NoteMultipleDirectionalFlick extends NoteFrontBase {}` 使 415/415 个核心 production root 首次 Move 全部返回 `note.state.move`。
- 证据包 source/copy/index 校验和 Reverse `a3f28d77` 提交本身仍有效，但现有 closure 的覆盖范围不足以满足本文任务；在新 Reverse closure 提交前，任务书层面的 Auto Live 代码硬门恢复为 blocked。

#### 2026-07-28 第十三批：Multiple Directional 原作阶段归属复核

- 只读核对 Reverse 已提交 `a3f28d77` 的 method index、`artifacts/rhythm/decompiled_bundles/note.c` 与锁定 SHA-256 二进制；未消费 Reverse 未提交工作树。
- `NoteMultipleDirectionalFlick..ctor @ 0x30EE62C` 直接分支到 `NoteDirectionalFlick..ctor @ 0x30E7F10`，后者进入 `NoteFlickBase..ctor @ 0x3A777F4`；原作职责链明确为 Single→FlickBase→Directional→Multiple，而非当前 TypeScript 的直接 `NoteFrontBase`。
- `NoteMultipleDirectionalFlick.MoveState @ 0x30ED1B4` 先调用 `NoteSingleBase.MoveState @ 0x30E1698`；后者在 adjusted crossing 且 `get_IsAutoPlay` 成立时虚调用 inherited `NoteFlickBase.forcePerfect @ 0x3A77768`。Multiple 没有自有 forcePerfect/get-X override，故 Auto synthetic route 继承 Directional ±500。
- inherited Force Perfect 通过虚槽进入 Multiple 自有 `ExecTouchBegan @ 0x30ED578` / `ExecTouchMoved @ 0x30ED6DC`；成功分支以 judge note type 10 调 `NoteFrontBase.judgeFrontNote`，随后 `changeSideNoteUsed` 与 finish/deactivate。`getMultipleDirectionalFlickNoteCount @ 0x30ED910` 为 left+right+1。
- 阶段归属据此锁定：synthetic Began/Moved、±500、note type 10、group count/side state/finish 属于 Auto Live；真实 touch、方向距离阈值与手指所有权属于下一阶段；BackLine/Sprite/Z/动画和 count 的音频/粒子消费属于表现阶段。
- `NoteAddLongMultipleDirectionalFlickVisual.forcePerfect @ 0x30E6F5C` 与 `NoteAddSlideMultipleDirectionalFlickVisual.forcePerfect @ 0x30E8870` 均为 ARM64 `RET`，它们是 visual/connect 实体，不能与核心 `FrontNoteType.MultipleDirectionalFlick` 共用一个 judgement class。该新分析须先在 Reverse 晋升、提交、冻结并关闭新 gap，才能修改生产代码。

#### 2026-07-28 第十四批：A01/A02 补充证据硬门关闭

- Reverse 新建 `artifacts/investigations/auto-live-runtime-contract-supplement/`，从锁定 ELF 的 PT_LOAD 虚拟地址映射直接导出 9 份 ARM64 TSV，并校验样本完整 SHA-256；未把 RVA 当文件 offset，也未消费未提交反编译工作树。
- verifier 锁定首版 Auto contract、method index、已提交 `note.c` 与时钟 pass-2 runtime oracle 的 Git blob profile；断言 Multiple ctor thunk、Move→Single、note type 10→judgeFrontNote→changeSide、left+right+1、两个 visual forcePerfect RET 和无 Multiple 自有 forcePerfect override。
- 新 supplement fixed trace 8 case：Multiple 左/右 synthetic group、Slide Stop、active Long pause、active Slide+occupied slot pause、B=+5 cross-BPM exact、B=-5 cross-bar exact、B=0 identity；生成两次对象一致。
- `closure.json` 先以 G11–G15 关闭复审缺口；实现前再复核分组来源，新增 G16 并由 `isMultipleDirectionalFlickSameGroupNotes/isAdjacentTwoNotes`、core connect 和递归 ChangeLeft/Right ARM64 关闭：两节点仅在 front type 6、相同 game type、button 相邻时连接，judged root 递归标记 side used 并清 link。
- Reverse 最终补充提交 `cd84d2ce84243e8b864d08d7fe0fbeeb041eb79a` 已推送并确认 main 远端 `0 0`。GarupaEditor 字节保持冻结最终 24 个补充文件与一个 fixture alias；manifest 最终条目由 43 增至 67，verifier 同时校验 G01–G10 与 G11–G16。A05–A10 代码门现解除。

#### 2026-07-28 第十五批：A05/A08 Multiple Directional 核心实现

- `NoteMultipleDirectionalFlick` 改为继承 `NoteDirectionalFlick` 职责，激活只接受 core front type 6 与 source game type 10/11；未安装 NoteManager group resolver 时失败关闭。
- NoteManager 按每个 production batch 的原序建立 group：只连接连续的 front type 6、相同 game type、button 差绝对值 1 的节点；重复 button 或方向变化开启新 group，不把 HABAHIRO visual helper 混入。
- group 由运行时 owner 持有，不修改 chart construction 深冻结 `NoteInformation`；反向 active Update 中第一个 crossing root 继承 ±500、提交唯一 note type 10 与 `left+right+1` count，成功后原子标记 group used，其余 side root 只失活。
- `AutoLiveJudgementRequest` 增加 confirmed callback count；OneFrame payload 继续严格保持原八个阶段字段，不把 count 冒充原作 OneFrameData 字段，仅在 Setup trace 记录供 onJudge callback 边界审计。
- Front type 7/8/9 改映射到独立 `multiple-directional-visual` family；其 Move 明确返回 presentation `evidence-required`，不再错误构造核心 judgement class，也不使用无证据 no-op。
- production group 快照包含最小 count/used/trace；dispose 与 side-used 后全部 core root Deactive。隔离 TypeScript、第一切片 17 项、时钟 15 组和修订中的 Auto Live 22 组通过；完整 A10 回归与最终文档仍待下一批。

#### 2026-07-28 第十六批：A06/A07/A09/A10 补充轨迹与 production 重验收

- Auto Live 测试同时读取首版 11 case 和补充 8 case；AL02 用生产 `advancePosition` 从冻结 cursor 跨 99.5→95.5 BPM 五步并逐 bits 对照 `0x45401EF9`，B=-5 cross-bar `0x446E7494` 与 B=0 identity 也直接消费冻结值。
- AL06 墑补 standalone Directional 与三成员 Multiple group：反向 active Update 只让最后 root 提交一次 note type 10、count 3，另外两个 side root 失活；OneFrame payload 不出现 count，Setup callback trace 保留 count。
- AL11 不再硬编码 Stop：直接消费 frozen before `0x4333FFFF`、equal `0x43340000`、intermediate note type 8 和 current 0→1。
- AL18 同时覆盖 active Slide+occupied slot、active Long equal/strict-greater、active Multiple group 的 pause/resume 无补步，以及 Slide/Multiple active dispose 无新增判定事件。
- AL19 每个 production chart 分别消费 Normal/Flick/Long/standalone Directional/Slide；按生产分组函数完整执行普通 195、HABAHIRO 220 个 core Multiple root，所有 group 各仅一个 judgement。普通谱面另通过正式 host `initialize + 8000×step(1/60)` 完成全部 656 batch 且 active root 归零。
- AL20 对 HABAHIRO 的唯一 front type 8 visual helper 验证独立 `multiple-directional-visual` family 和 presentation `evidence-required`；不把该静态/视觉边界冒充 core Auto judgement，也不扩张 HABAHIRO 实体 runtime 声明。
- 完整隔离验收通过：TypeScript、第一切片 17 项、全部 chart suites、production roots 825/598、时钟 15 组、Auto Live 22 组、依赖边界和证据 source/copy/index。阶段重新关闭，但真实 touch 与 visual/audio 消费仍后置。

#### 2026-07-28 第十七批：关闭后独立 production 计数复核

- 独立复核发现 AL19 虽已由普通 production 全谱间接执行普通谱的 standalone Directional，且两个 fixture 都检查了 representative root，但“50 个 standalone Directional 全部直接消费”的验收表述还缺 HABAHIRO 其余 root 的逐实体断言。
- AL19 现从未经筛改的两个 production `NoteInformation` root 集合分别取得 38/12 个 front type 5，逐 root 激活 `NoteDirectionalFlick`，核对唯一 OneFrame entry、source index、note type 9 与最终 Deactive；不以 representative 结果外推整族。
- 该补强不改变生产代码、证据门或阶段边界；隔离 TypeScript 与 Auto Live 22 组重跑通过，最终提交后再次确认远端 `0 0`。

#### 2026-07-28 第十八批：canonical 全轨迹与 exact cursor G17

- 独立复核继续执行任务书 A10 第 3 项时确认：此前测试对 frozen trace 仍是分散字段断言，不足以证明整条状态/事件/slot/Reflect 轨迹；另外 positive offset fixture 只保留 rounded Float32 absolute projection，无法唯一还原原作内部 `bar + beatProgress`，直接以 absolute 拆分会产生 `0x45401EFA` 而非设备 `0x45401EF9`。A02/A10 在补证期间再次失败关闭。
- Reverse 从锁定提交 `a3f28d77` 的 committed pass-2 runtime oracle 提取 `music_bar=15`、`music_beat=187.35589599609375 / 0x433B5B1C` 及负向 `bar=5`、`beat=0.454833984375 / 0x3EE8E000`，在 `7a0540dc867a759db929842ebe95ca9665a61b65` 增加 G17 与 `entry_music_cursor`；生成器双次一致、verifier 直接对 committed source 字段，未消费 Reverse 未提交工作树。
- GarupaEditor 字节保持替换 R09/R10/R11/R12/R14/R15 与 supplement fixture alias，manifest 的 67 个 final entry 数量不变，source/copy/index 三方哈希现校验 G11–G17。
- 测试新增独立 canonical recorder：首版 11 case 与补充 8 case 的全部 `steps`/offset projection 由实际 Note 状态、Flick/Long/Slide/Multiple trace、OneFrame slots/payload/Reflect、manager pause cursor 与生产 Float32 advance/rewind 生成后直接 `assert.deepEqual`；不从 expected 填缺失字段、不排序事件、不使用 epsilon。
- canonical runner 同时暴露并修正测试覆盖问题：Slide terminal deactivation 后生产 Reset 会把公开 cursor 清零，因此判定前后 cursor 由本次实际 selected-node transition 记录，而不是拿回池快照冒充判定瞬间。生产行为未改；仅将 Long 已有 Auto trace纳入快照并公开既有纯函数 `rewindPosition` 供相同算法双向 bits 审计。
- Auto Live 22 组末尾额外输出 `fixed oracle canonical traces deep-equal actual runtime projections`；A02/A10 在 G17 冻结与完整 deep-equal 通过后重新关闭。

#### 2026-07-29 第十九批：第三次独立审计与阶段重开

- 冻结 supplement contract 明确要求“相同 game type、相邻 button 建边后每个 connected component 一个 runtime owner”；当前 `groupMultipleDirectionalInformationList` 却按筛选后的 source order 只比较前一项。普通 production 位置 1424 的 `[1,2,0]` 被拆为 `[1,2] + [0]`，同帧实际产生两条 note type 10，而证据图应为 `[0,1,2]` 一组。
- 全谱只读审计：普通 195 个 core Multiple 当前形成 108 个 judgement group，按 connected component 应为 89，13 个 batch 分组不一致并多出 19 个 judgement；HABAHIRO 220 个 root 的当前 84 组恰与 component 规则一致。AL19 使用待测分组函数生成 expected group，再注入测试 owner，因此无法发现普通谱面错误。
- 五槽满时直接驱动真实 Note：Long/Slide head 均先 `Move→Wait` 再因 `one-frame.pool-exhausted` 返回，head payload 缺失且无法重试；Long tail 还会在提交失败前追加 `long-linked-after-finish`，但 linked judged 仍为 false。现 failure matrix 只验证控制器前五槽保留，未关闭 Note/step 后续状态。
- canonical runner 的 simultaneous/adaptive case 直接调用独立 Note 并由测试传入 `substep=[0,1,2]`；真实 AL14 只比较 note index 和 Reflect 次数。offset case又把 `expected.step_bpms` 作为 `advancePosition/rewindPosition` 输入。故“19 case 全部 actual canonical、无 expected-side 输入”表述不成立。
- A02/A05/A08/A09/A10 与阶段完成勾选撤销；A06/A07 仅保留成功路径。计划新增 G18（connected-component production topology）、G19（OneFrame exhaustion 后 portable terminal failure boundary）、G20（actual scheduler/tempo-query canonical trace）。G18–G20 Reverse 提交、冻结与 verifier 关闭前不改生产代码。

#### 2026-07-29 第二十批：G18–G20 补充证据硬门关闭

- Reverse supplement 新增 6 个 case，总数由 8 增至 14：非 source-order `[1,2,0]` 且夹有其他 playable root 的 Multiple component；Long head、Slide head、Long tail 三个 sixth-slot terminal fault；actual adaptive observation requirements；actual offset tempo-query requirements。
- G18 直接绑定既有 S11/S12：相同 game type、相邻 button 建边后求 connected component，source list adjacency 与其他 family 插入不得拆组；fixture 固定 component `[0,1,2]`、reverse playable order `[0,5,2,1]`、judged button 0、唯一 judgement/count 3。
- G19 verifier 从锁定 `a3f28d77` 的 Long/Slide head 和 Long tail C 切片直接断言 ChangeState/linked finish 在 judgement 前；结合首版 failure matrix 的“five IsUse 后异常”，锁定 portable host policy：原作异常后 continuation 无证据，故 manager 锁存 terminal `evidence-required` fault，后续只允许 snapshot/dispose，不重试、不继续子步/Reflect。该 fault 是失败关闭宿主边界，不冒充原作 API。
- G20 明确 canonical 验收字段必须来自 production runtime：outer/substep、adjusted bits、state、slot、Reflect，以及 entry cursor/per-step BPM/result bits；禁止把 expected substep/event order/step BPM 注入实际结果。
- Reverse `24706edcb02155fca575c6fde6aa9c7f0fe131ba` 已推送并确认 main `0 0`；GarupaEditor 字节保持替换 R09/R10/R11/R12/R14/R15 与 fixture alias，final entry 数仍为 67。A05/A08/A09/A10 代码门解除，阶段仍保持未完成。

#### 2026-07-29 第二十一批：G21 修正 G18 过度解释

- 实施前用 HABAHIRO 发现同 button 重复 core Multiple：位置 3768 为 `[0,0,1]`。connected-component 算法会把三者合并，但 native Note 每侧只有单链接，原 G18 未覆盖 duplicate/source caller，故立即撤销未提交生产改动并重新失败关闭。
- 锁定 IDB 与 committed binary 复核 `activateNoteAndConnectSyncLine @ 0x37793F8`：每个 playable source 依次 activate，随后只对 previous/current 的 NoteInformation 调 `isMultipleDirectionalFlickSameGroupNotes`，命中才调用 connector；循环末尾 current 成为下一 previous。其他 playable root 与 equal-button Multiple 均断开 run。
- Reverse 新增 focused ARM64 `0x37795C4..0x3779A48`（R16.D17），G21 明确 supersede G18 的 connected-component 结论。新 method fixture 为 `[M4,M5,Other0,M6] → [[4,5],[6]]`、reverse order `[6,0,5,4]`、两条 judgement/count `[1,2]`。
- 重新审计 production：普通当前“先过滤 Multiple”得到 108 组，证据 source-order run 为 117，9 个 interleaved batch 被错误桥接并少 9 条 judgement；HABAHIRO 当前/证据均为 84。此前“普通多 19 条”是 G18 过度解释产生的错误审计结论，不再作为修复依据。
- Reverse `57c1e03be474eeb1006ff56c8fc3d5a9a117d573` 已推送 main `0 0`；GarupaEditor 冻结 final entry 由 67 增至 68。G19/G20 不变，A05/A08/A09/A10 继续未完成但代码门重新解除。

#### 2026-07-29 第二十二批：G21/G19/G20 生产修复与独立 oracle

- `groupMultipleDirectionalInformationList` 不再预过滤 Multiple；它遍历完整 `informationList`，跳过非 playable command，但让任意其他 playable root 与 equal button 结束当前 run。冻结 method case `[M4,M5,Other0,M6]` 精确得到 `[[4,5],[6]]`。
- 新增独立离线生成器 `generateAutoLiveProductionMultipleOracle.mjs` 与固定 JSON；生成器按 G21 自行扫描 source order，不调用待测分组函数。AL19 对两个锁定 BMS 的 source SHA-256、batch index/position、每个 group 的 source slot/index/button/game type 全对象比较：普通 117 组/195 member，HABAHIRO 84 组/220 member。
- production family 覆盖扩展为全部 87 个 Long（普通 29、HABAHIRO 58，其中 5 个 Flick terminal）、144 个 Slide、50 个 standalone Directional 与 415 个 core Multiple member；不再只抽一个代表 Long。
- `InGameManager` 新增 portable terminal fault latch：Note/Reflect 首次 `evidence-required` 后进入 `faulted`，保留前五槽和 native Note 状态；后续 step/pause/resume/adjusted query 返回同一锁存对象，snapshot/dispose 保持允许。测试用 Long 作为第六个 reverse-update root，并分别锁定 Long head、Long tail、Slide head 的 native failure state/trace。
- `NoteManager.schedulerTrace` 现在直接记录 outer-frame index、实际 substep、每次 Note Update 的 adjusted position 与 state before/after；music score snapshot 记录正 offset 的每步 tempo query。adaptive canonical projection 从实际 scheduler/OneFrame trace构造，offset 另有真实 `getAdjustedMusicPosition(+5)` 跨 BPM observation；不再把 expected substep/BPM 作为生产调用输入。
- 模拟器隔离 TypeScript、第一切片 17 项、时钟 15 组、Auto Live AL01–AL22、全部 chart construction/production suites、依赖边界与 evidence worktree verifier 均通过；未运行 Vite/Tauri/整体构建。最终阶段结论留给提交后独立复核与验收文档恢复。

#### 2026-07-29 第二十三批：提交后只读性复核

- 对已推送实现提交 `d5ca9dd` 复核时发现：新增 tempo-query observation 使原有 host `snapshot()` 间接调用带记录副作用的 adjusted-position 路径；同时 scheduler 为记录 adjusted position 在真实 Note 回调前额外查询一次，非零 offset 会产生重复 tempo observation。该问题不改变判定数值，但违反 snapshot 只读和 G20“观察真实调用”要求，因此最终验收继续保持撤销直至修复。
- music score 将读路径拆为带记录的 `getAdjustedMusicPosition` 与无记录的 `peekAdjustedMusicPosition`；host snapshot 只使用 peek。NoteManager 不再预查询 adjusted position，而由每个池对象已安装的真实 Auto Live callback 把本次读取写入 WeakMap，Update trace 在调用后读取该实际值；未读取 adjusted position 的状态记录为 null。
- AL02 新增非零 offset 的 controller peek 与连续 host snapshot 全对象相等断言，确认 snapshot 不追加 tempo trace；actual `getAdjustedMusicPosition(+5)` 跨 BPM case 仍精确记录五次生产查询。TypeScript、Auto Live 22 组、第一切片 17 项与时钟 15 组再次通过。

#### 2026-07-29 第二十四批：第五次独立审计与阶段重开

- 全部 A10 隔离命令、Auto Live 22 组与 evidence source/copy/index verifier 仍为绿色，但任务书逐项审计确认第四次关闭结论不成立。
- 公共 `SimulatorEngineHost.resume()` 在调用 manager 前先检查 `snapshot().paused`；faulted manager 保持 `PlayingSound`，因此该 shortcut 返回 `ok`。隔离复现结果为：fault/step/pause/getAdjusted 均返回锁存 `one-frame.pool-exhausted`，唯独 `resume-after-fault -> ok`。现 AL16 只验证 direct manager resume，host case未覆盖 pause/resume。
- G20 fixture 明确禁止 `expected-step-bpms` 并指定 exact 三例 owner 为 `InGameMusicScoreController.getAdjustedMusicPosition`；AL02 仍执行 `for (const bpm of plusFive.step_bpms)`，canonical exact block也只从 expected cursor 手工调用 private `bpmAtPosition` + `advancePosition/rewindPosition`，没有让 production owner 执行 exact B±5/0。另一个 actual +5 case只验证“跨过 BPM”，未对 exact device cursor/result bits。
- adaptive actual projection虽读取 scheduler trace，却在 deep-equal 前从 actual/expected 同时删除 `outer_frame`，再测试侧硬编码实际值 1；因此“事件 case 全对象比较”仍为过度声明。须由已提交证据明确完整生命周期 index 或 case-relative projection，不得继续忽略字段。
- A09/A10 与阶段完成勾选撤销；A00–A08、G19/G20/G21 证据本身、117/84 topology、87 Long/144 Slide/50 Directional/415 Multiple coverage保持有效。若 committed pass2 只有 entry cursor/steps 而无可重放的生产输入序列，则新增 G22：冻结 exact controller replay 输入与 adaptive outer-frame identity，Reverse 提交并冻结前禁止用 private 字段 seed 或测试 hook 绕过。

#### 2026-07-29 第二十五批：A09 公共宿主 fault 修复

- `SimulatorEngineHost.pause/resume` 在任何 paused idempotent shortcut 前先读取 manager fault；faulted 时直接返回锁存失败，不记录 paused/running backend lifecycle 事件。
- AL16 的真实 host 第六槽场景新增全部公开边界：`initialize/step/pause/resume/getAdjustedMusicPosition` 均与首次 fault 全对象相等；连续 snapshot 全对象相等且 backend trace 不变；dispose仍成功。该修复直接消费 G19，不需要新增原作行为证据。

#### 2026-07-29 第二十六批：G22 exact production replay 证据硬门关闭

- 复核已提交 pass2 原始来源确认并非只有输出：run-025/run-026 normalized adaptive trace逐 frame保存 `delta_time_bits`，同目录还提交了原始 `653_ikuoku_easy.bms.txt`。只读实验用 frame 1–991 bits驱动当前 production engine，精确到达 `bar=15, beat=0x433B5B1C`，随后真实 `getAdjustedMusicPosition(+5)` 返回 `0x45401EF9` 与五步 `99.5×4→95.5`；因此无需 private seed或新设备采集。
- Reverse supplement新增 `auto_live_actual_replay.json`、生成器与字节保持 BMS；G22锁定 +5 frame991、-5/0 frame317 的完整 Float32 delta序列，禁止 expected BPM、private cursor write/private BPM call。adaptive method fixture锁定一个 setup outer frame后 judgement full manager index为1，禁止删除 outer字段。
- Reverse `97e31b77` 冻结主体，`c2dc5c7f37718a170c9e9b93d5a86b42e9d1a2ab` 将 substep 禁令精确限定为 adaptive case；最终提交已推送 main `0 0`。GarupaEditor冻结新增 R17–R20 与两个 fixture alias，final entry由68增至72。A10代码门解除。

#### 2026-07-29 第二十七批：A10 actual owner 与完整 adaptive projection

- AL02删除 `plusFive.step_bpms` 算术输入；canonical exact 三例现在读取 G22 delta bits与冻结 CC08 BMS，逐 frame调用正式 `engine.step`，从 production snapshot观察 entry bar/beat bits，再调用公共 `engine.getAdjustedMusicPosition`。+5 精确得到 `0x433B5B1C → [99.5,99.5,99.5,99.5,95.5] → 0x45401EF9`；-5精确得到 `0x3EE8E000 → 99.5×5 → 0x446E7494`；0返回identity且无step trace。
- music score observation补充负 offset每步 committed BPM与cursor记录；该记录不改变 SlowAbsolutePos算术，peek仍不记录。测试不再调用 private `bpmAtPosition`，不再直接调用 `advancePosition/rewindPosition` 重放 exact expected。
- adaptive canonical由 G22输入 delta/position驱动，substep来自 manager trace；frozen原轨迹只由 G22补充 full lifecycle `outer_frame=1`，actual/expected直接全对象 deep-equal，不再删除字段。

#### 2026-07-29 第二十八批：第五次最终独立重验收

- 提交后重新静态搜索确认 Auto Live 测试中不存在 `for (... expected.step_bpms)`、private `bpmAtPosition`、直接 exact `advancePosition/rewindPosition` 或删除 `outer_frame` 的 projection；host fault case覆盖 `initialize/step/pause/resume/getAdjusted/snapshot/dispose`。
- 完整A10命令重新通过：隔离TypeScript；第一切片17项；全部chart boundary/parsing/batches/graphs/multi-range/command/finalize/production；production roots 825/598；时钟15组；Auto Live AL01–AL22；依赖边界；evidence worktree/index。
- G22实际重放每次从冻结BMS重新构造已登记chart，不读取Reverse/Python/网络；+5/-5/0分别经991/317/317个committed Float32 delta驱动公共engine，actual entry/step BPM/result projection与device oracle直接deepEqual。
- 第五次复核未发现新的required-before-close缺口。A09/A10及阶段完成勾选恢复；手动输入、分数/状态消费、表现层与主程序集成边界不变。

#### 2026-07-29 第二十九批：第六次独立审计与阶段重开

- 不依赖AL01–AL22绿色结论，按G19重新枚举公共host所有调用路径。`SimulatorEngineHost.step`直接进入`InGameDirector.update`；director在manager之前验证delta，因此terminal fault后`step(NaN)`、`step(-1)`返回新的`director.invalid-delta-time`，而合法`step(1/60)`才返回锁存`one-frame.pool-exhausted`。
- 临时编译产物已复现：fault后valid step/pause/resume返回锁存失败，NaN与负delta返回不同失败。冻结G19三例均明确`subsequent_step=same-latched-failure`且仅允许snapshot/dispose，故这不是一般输入验证顺序，而是required-before-close公共边界缺口。
- 现有AL16只覆盖fault后`step(1/60)`，未覆盖NaN、正负Infinity和负delta；A09/A10及阶段关闭结论撤销。G01–G22证据门、A00–A08、exact owner、adaptive outer-frame、117/84 topology和production family coverage不受影响，无需新增Reverse补证。
- 文档同时发现历史残留：验收摘要仍写“待全量复核”，`OPEN_GAPS.md`末行仍写“须直接消费fixed trace”，最终证据冻结身份仍停在G21提交。状态文档先行纠正，生产修复与新AL16下一批实施。

#### 2026-07-29 第三十批：公共 step terminal-fault优先级修复

- `SimulatorEngineHost.step`现与pause/resume/getAdjusted一致，在进入director和任何delta验证前读取manager fault；无fault时NaN/Infinity/负delta仍沿用既有`director.invalid-delta-time`失败关闭，不改变正常调度输入边界。
- AL16在真实host六root第五槽耗尽后，除合法`1/60`外新增NaN、正Infinity、负Infinity与有限负delta，全部要求与首次`one-frame.pool-exhausted`全对象相等。后续连续snapshot仍与fault瞬间全对象相等，因而同时锁定backend、scheduler、tempo trace与五槽状态不变；dispose继续允许。
- 本修复直接消费G19，不增加Reverse证据、生产设置或测试hook。定向TypeScript/Auto Live/第一切片/时钟回归通过后提交；A10最终结论留给提交后的完整独立重验收。

#### 2026-07-29 第三十一批：第六次最终独立重验收

- 在已推送修复提交后使用临时编译产物独立复现公共host：fault前`step(NaN)`仍返回`director.invalid-delta-time`；制造五槽terminal fault后，`step(1/60)`、NaN、正负Infinity、负1、initialize、pause、resume和getAdjusted全部与首次`one-frame.pool-exhausted`全对象相等，snapshot全对象不变，dispose成功。
- 完整A10重新通过：隔离TypeScript；第一切片17项；全部chart boundary/parsing/batches/graphs/multi-range/command/finalize/production；普通/HABAHIRO roots 825/598；时钟15组；Auto Live AL01–AL22；依赖边界；evidence worktree/index。
- Reverse首版与supplement verifier重新通过`G11–G22, cases=14, replay=4`；独立production Multiple generator重新生成后与固定JSON逐字节一致。静态搜索仍不存在expected BPM输入、private BPM lookup、exact纯函数重放或outer-frame删除。
- 第六次复核未发现新的required-before-close缺口。A09/A10与阶段完成勾选恢复；手动输入、分数/状态消费、表现层和主程序接入继续保持后置硬门。

#### 2026-07-29 第三十二批：第七次独立审计与 Slide invisible 重开

- 完整 A10、AL01–AL22、Reverse verifier、证据 source/copy/index 与独立 Multiple topology 再生成仍全部绿色，但逐调用点对照冻结 E15 发现生产 `NoteSlide.forcePerfectPendingAfter` 在读取 adjusted position 前先处理 `current.source.isInvisible`。
- E15 `NoteSlide.forcePerfectOnUpdate @ 0x321BD94` 明确先取得 current child，调用 `NoteManager.GetAdjustMusicPos`，并在 `adjusted - child.absolutePos < 0` 时返回；该位置门位于后续 intermediate/terminal 路由之前。R02 的 invisible 结论只确认不产生 OneFrame、到点后选择推进，不支持提前跳过。
- 临时编译产物复现：root=120、invisible child=170 时，adjusted 为 0/119/120/160/169 均错误把 `currentAfterIndex` 从 0 推到 1；root 未 crossing 时也会提前标记 child。现有 AL10 正以 adjusted=160、child=170 期待 cursor=1，而冻结 canonical positive case 使用 adjusted=180，因此 before 边界被测试盲区掩盖。
- production 图直接复现：普通谱面 89 个、HABAHIRO 27 个 Slide root 的首 child 为 invisible；首例分别在 root=848/456、child=849/459 时，于 root equal 即提前推进。旧 AL19 只验证最终完成，不能证明 cursor timing。
- 本轮只纠正文档完成度，不改生产代码。A07/A10 与阶段关闭结论撤销；G01–G22、A00–A06、A08/A09、G19 fault、G21 topology 和 G22 replay 不受影响。下一批按 E15 调整 position gate 顺序并补 synthetic/production crossing 回归。

#### 2026-07-29 第三十三批：A07 Slide invisible position gate 修复

- `NoteSlide.forcePerfectPendingAfter` 现对所有未 judged current child 先调用生产 adjusted-position owner，检查有限值并执行 `adjusted < child.absolutePos` 返回；到点后才区分 invisible skip 或 visible intermediate/terminal judgement，恢复 E15 的调用与比较顺序。
- AL10 不再测试侧直接切 Wait 后以 160<170 期待 skip；现从真实 Move 开始覆盖 root 前一 Float32、root equal、invisible child 前一 Float32和child equal。前三个位置保持 cursor/judged/slot，child equal才单次推进且不产生 OneFrame。
- AL19 对两个已冻结 production BMS 的全部首 child invisible Slide root逐对象验证：普通89个、HABAHIRO 27个，root equal和child before均保持cursor 0，child equal后只推进到1且无OneFrame；不再从最终Deactive外推中间时序。
- AL22 增加 active Wait invisible child 的非有限adjusted失败原子性：返回既有`auto-live.non-finite-adjusted-position`，cursor/judged/slot/skip trace均不变。
- 定向隔离TypeScript与Auto Live AL01–AL22（含canonical full-object trace、依赖边界）通过。A07实现缺口关闭；A10保持重验收中，完整上游套件、证据index和提交后复核留给下一批。

#### 2026-07-29 第三十四批：第七次最终独立重验收

- 在已推送生产修复 `c6bc9c6` 后重新执行完整 A10：隔离TypeScript、第一切片17项、全部chart boundary/parsing/batches/graphs/multi-range/command/finalize/production、普通/HABAHIRO roots 825/598、时钟15组、Auto Live AL01–AL22、依赖边界及证据source/copy/index全部通过。
- Reverse首版与supplement verifier重新通过`G11–G22, cases=14, replay=4`；独立Multiple topology generator再生成与固定JSON逐字节一致。禁止模式静态搜索仍无expected BPM输入、private BPM lookup、exact纯函数重放或outer-frame删除。
- 提交后临时编译产物独立驱动production `NoteSlide`：root=120、invisible child=170时，adjusted 0/119保持Move+cursor0，120/160/169保持Wait+cursor0，170才cursor 0→1/judged/单次skip；fresh Move→OnUpdate 调用同时恢复 root 与 current child 两个原作 adjusted 调用点。
- AL19对普通89个、HABAHIRO 27个首child为invisible的production Slide逐对象验证root equal、child前一Float32、child equal；AL22锁定non-finite invisible原子失败。旧“最终全部Deactive”不再代替中间cursor时序。
- 第七次复核未发现新的required-before-close缺口。A07/A10与阶段完成勾选恢复；手动输入、分数/状态消费、表现层和主程序接入继续保持后置硬门。

#### 2026-07-29 第三十五批：第八次独立审计与模式所有权重开

- 完整 A10、AL01–AL22、Reverse verifier、证据 source/copy/index 与独立 Multiple topology 再生成仍全部绿色，但公共宿主输入所有权审计发现：`validatePlayMode` 成功后把原 `input.runtime.playMode` 对象直接传入 `InGameCalculatedData`，后者长期保存并读取同一引用。
- 临时编译产物通过正式 `createSimulatorEngine` 复现：以合法 `{kind:"auto-live", resultTransform:"identity-no-active-situation-skill"}` 创建后，把原对象改为 `resultTransform="skill"`；snapshot 随即报告 `isAutoPlay=true/resultTransform="skill"`，`initialize` 与两次 `step(1/60)` 均成功，Normal crossing 仍产生 Auto Perfect OneFrame。
- 该路径违反 A03 第4/5项和 G06：unknown Skill transform 应失败关闭，不得在一次性校验后通过可变别名进入生产owner。相同根因还允许 manual→auto、auto→manual、mode14/未知 kind 在创建后改变路由。
- AL22 当前只把初始非法对象传给 `createSimulatorEngine`，没有在合法创建后修改原对象；TypeScript `readonly` 与 `private readonly` 只固定类型/引用，不冻结对象内容，因此旧绿色结论无法承担生命周期模式身份。
- 本轮只纠正文档完成度，不改生产代码。A03/A10 与阶段关闭结论撤销；G01–G22、A04–A09及既有 exact/topology/fault/Slide 结论不受影响。下一批在校验时生成规范化不可变模式值，并补公共host别名突变回归。

#### 2026-07-29 第三十六批：A03 模式所有权修复

- `validatePlayMode` 不再只返回 `void`；它读取并验证调用者输入后返回新建且冻结的规范化 `SimulatorPlayMode`，`createSimulatorEngine` 只把该值交给 `InGameCalculatedData`，不再传递原对象引用。
- `InGameCalculatedData` 构造时再次浅复制并冻结平坦判别联合；`playMode` getter返回的内部值不可修改。该双层所有权同时保护公共host和直接owner构造，不依赖调用者遵守TypeScript `readonly`。
- AL01 通过正式公共host覆盖：合法Auto对象创建后先改`resultTransform="skill"`、再改`kind="mode14"`，snapshot仍保持identity Auto且真实Normal crossing只产生一条Auto Perfect；合法manual对象创建后改为Auto，snapshot仍保持manual/none。
- AL01同时对直接owner getter执行`Reflect.set`，冻结值拒绝修改且snapshot不变；AL22原有创建时undefined/mode14/Skill拒绝继续保留，形成创建前验证与创建后所有权双边界。
- 定向隔离TypeScript与Auto Live AL01–AL22（含canonical、production、依赖边界）通过。A03实现缺口关闭；A10保持重验收中，完整上游套件、证据index和提交后独立复核留给下一批。

#### 2026-07-29 第三十七批：第八次最终独立重验收

- 在已推送生产修复 `628f7b6` 后重新执行完整 A10：隔离TypeScript、第一切片17项、全部chart boundary/parsing/batches/graphs/multi-range/command/finalize/production、普通/HABAHIRO roots 825/598、时钟15组、Auto Live AL01–AL22、依赖边界及证据source/copy/index全部通过。
- Reverse首版与supplement verifier重新通过`G11–G22, cases=14, replay=4`；独立Multiple topology generator再生成与固定JSON逐字节一致。禁止模式静态搜索仍无expected BPM输入、private BPM lookup、exact纯函数重放或outer-frame删除。
- 提交后临时编译产物独立驱动公共host：合法Auto原对象改为`skill`和`mode14`后，owner仍为identity Auto并产生恰好一条Normal判定；合法manual原对象改为Auto后，owner仍为manual/none；直接owner getter已冻结。
- 模式稳定性actual来自正式`createSimulatorEngine`、snapshot、initialize与step，不通过测试私有字段写入；创建时AL22非法输入拒绝与创建后AL01别名隔离共同闭合A03生命周期边界。
- 第八次复核未发现新的required-before-close缺口。A03/A10与阶段完成勾选恢复；手动输入、分数/状态消费、表现层和主程序接入继续保持后置硬门。

#### 2026-07-29 第三十八批：第九次独立审计与阶段重开

- 完整A10、AL01–AL22、Reverse verifier、证据source/copy/index及独立Multiple topology再生成仍全部绿色，但逐项对照A08/A09与失败关闭总则发现两个未覆盖的公共生产边界。
- `validateAutoLiveJudgementRequest`只要求note type/button/count为整数且position有限；临时编译产物以`phase="tail"`、`noteType=999`、`absolutePosition=999`、`multipleDirectionalFlickNoteCount=999`调用正式Setup，返回`ok`并把未闭合值写入slot，违反R02的`validate closed Auto payload`与本文第3节第10项。
- AL22只覆盖foreign handle、duplicate Setup和sixth entry，没有覆盖未知note type、phase/type不匹配、count规则或来源/位置一致性；完成定义中的Setup和Multiple note type/count边界因此不能继续勾选。
- 公共host dispose后，`resume()`因未暂停shortcut返回`ok`，`getAdjustedMusicPosition()`也返回`ok(0)`；若未initialize即dispose，再调用initialize会先执行Awake并记录60 FPS后端请求，随后才返回`host.initialize-after-dispose`。这违反A09的dispose确定性和portable host失败关闭边界。
- 本轮只纠正文档完成度，不改生产代码。A08/A09/A10与阶段关闭结论撤销；A00–A07及既有exact/topology/fault/Slide/mode结论不受影响。下一批补闭合payload owner校验、disposed公共API优先级与AL18/AL22回归。

#### 2026-07-29 第三十九批：A08/A09闭合payload与disposed生命周期修复

- OneFrame Setup在结构检查之外，按生产owner语义验证请求：head由root family固定note type与source position；intermediate只接受可见Slide A/B child、note type 8与child position；tail按Long after type或Slide terminal game type固定note type与position。
- button identity限制为非空且属于已确认playable button范围；Multiple Directional只允许head note type 10、source game type 10/11和正callback count，其他family必须count=0。未知note type、phase/type错配、空button、不一致position与count错配均在GetUsable/slot写入前返回同一`one-frame.invalid-auto-live-payload`。
- `InGameManager`公开只读生命周期状态并拥有adjusted-position生命周期门；host initialize在faulted/disposed时不先Awake，step在非initialized时不先做director参数处理，resume在shortcut前检查生命周期，getAdjusted直接服从manager owner。
- AL18新增dispose-before-initialize公共host矩阵：initialize、合法/NaN step、pause、resume、getAdjusted均失败关闭，snapshot与幂等dispose允许，backend trace保持空。AL22新增六类非法payload并逐次全对象比较controller snapshot零变化。
- 第一切片槽测试改为source/absolute position一致的闭合请求，不再以测试侧不一致输入绕过生产门。隔离TypeScript、第一切片17项、时钟15组与Auto Live AL01–AL22通过；A10完整提交后重验收留给下一批。

#### 2026-07-29 第四十批：第十次最终独立重验收

- 在已推送生产修复`fc8a4c4`后重新执行完整A10：隔离TypeScript、第一切片17项、全部chart suites、普通/HABAHIRO roots 825/598、时钟15组、Auto Live AL01–AL22、依赖边界及证据source/copy/index全部通过。
- Reverse首版与supplement verifier重新通过`G11–G22, cases=14, replay=4`；独立Multiple topology generator再生成与固定JSON逐字节一致。既有exact owner、adaptive full outer-frame、117/84 topology、Slide E15与模式所有权结论保持。
- 提交后临时编译产物独立验证六类非法payload：unknown note type、tail错配、position错配、普通count非零、Multiple count为零与空button均返回同一`one-frame.invalid-auto-live-payload`，controller snapshot逐次零变化；合法Normal head仍占用一个slot。
- 同一临时产物从created直接dispose，随后initialize、合法/NaN step、pause、resume、getAdjusted全部返回生命周期失败；连续snapshot全对象不变、backend trace为空、重复dispose成功。
- 第十次复核未发现新的required-before-close缺口。A08/A09/A10与阶段完成勾选恢复；手动输入、分数/状态消费、表现层和主程序接入继续保持后置硬门。

#### 2026-07-29 第四十一批：第十一次独立审计与阶段重开

- 完整A10、Auto Live AL01–AL22、证据source/copy/index、Reverse首版/supplement verifier和独立Multiple topology再生成仍全部绿色；本轮不把这些结果直接等同于任务完成，而是重新枚举producer→owner→consumer capability及batch mutation点。
- OneFrame handle当前只有可预测`containerId`字符串。两个独立controller都会生成`one-frame:0`；把controller A取得的handle交给controller B，B按字符串命中自身slot并返回`ok`，pool由空变为占用且B没有GetUsable trace。冻结`foreign-one-frame-handle`要求`evidence-required`与pool unchanged，因此A08未关闭。
- Multiple证据固定callback count为`left-side count + right-side count + 1`，生产Note也从runtime group owner读取精确count；但Setup只要求note type 10时count大于零。合法Multiple source配`count=999`会返回`ok`并写入Setup trace，不能证明request由对应owner生成。A08的“闭合Multiple count”表述过度。
- 公共host同批`Normal + missing-after Long`在第3次`step(1/60)`返回`auto-live.invalid-long-after-graph`并进入faulted，但`nextBatchIndex`仍为0且`normal:0`已active Move；若批内含BPM command，同一循环还会先提交BPM owner。G19只确认OneFrame第六槽前的native mutation，不为portable坏图验证后的部分batch activation背书。A09第7项原子边界未关闭。
- AL22只用不可匹配的`containerId="foreign"`、只测Multiple count 0、并直接调用单个坏Long/Slide的`activate()`；没有覆盖跨controller同ID、与owner不一致的正count或公共step批内后继失败。A10停止条件和“覆盖全部失败关闭case”不满足。
- 本批只纠正文档完成度，不改生产代码。A08/A09/A10及阶段完成勾选撤销；A00–A07与上述既有证据结论保持。下一批必须先设计不可伪造owner capability、精确group-count绑定与整批preflight/有证据的失败状态，再补AL22/public-host回归。

#### 2026-07-29 第四十二批：所有权与批preflight生产修复

- `OneFrameDataHandle`不再按`containerId`反查；每个controller为五槽建立冻结handle对象并以私有WeakMap校验对象身份。直接伪造同ID及另一controller的同ID handle均在payload/slot mutation前返回`one-frame.foreign-container`。
- OneFrame新增唯一NoteManager judgement owner。生产NoteManager在setup时登记全部playable root及Slide共享child身份；未登记source即使字段结构合法也拒绝。Multiple source同时从G21 runtime group owner取得精确count，`0`、`999`和任意非owner正数均拒绝，实际owner count正常提交。
- 把Long/Slide/Multiple激活图验证提取为同一R04/U01绑定纯函数；host在创建任何manager/backend副作用前验证，NoteManager在setup创建pool、group、BPM/root mutation前再次验证，Note自身activate仍复用同一函数。`Normal + CC08 + missing-after Long`组合在host和direct manager入口均零active root、零active BPM、零scheduler trace。
- AL22新增未注册judgement source、exact Multiple owner count、伪造同ID/cross-controller handle、host与direct manager批preflight全对象断言；AL18/canonical暂停占槽改用已登记但尚未激活的未来source，不再由测试向生产Setup注入无owner NoteInformation。
- 定向隔离TypeScript、Auto Live AL01–AL22、第一切片17项与时钟15组通过。按第1.2节新纪律，本批只标记A08/A09实现修复，A10保持打开；提交后另起验收批从A00–A10逐项确认。

#### 2026-07-29 第四十三批：验收触发的失败关闭补修

- 按新验收矩阵审查A03–A08时发现，`NoteLong.bindAfterNote`与`NoteSlide.bindAfterNotes`允许绕过已验证父子图；Long未知after type默认note type 1，Slide terminal映射缺失时默认8。上述均无R02/R04依据，属于“理论不可达”被默认值掩盖。
- 删除两个生产重绑入口；`NoteSingleBase`改为abstract且base Force Perfect明确`evidence-required`。Long terminal note type改为闭合集合`1|3|9|null`并在null时失败；Slide terminal必须与父验证映射全等，否则在Setup前失败，不再使用`?? 8`。
- 图preflight补充root/after Int32位置与invisible terminal拒绝。继续审查A09时又确认direct manager坏图虽然零root/BPM，但旧顺序会先初始化OneFrame和Slide manager；现`InGameManager.initialize`与`NoteManager.execAwakeEnd`均在这些mutation前调用同一纯`validateSetup`。
- AL22新增无效judgement owner、non-finite Long root、invisible Slide terminal，并把direct manager坏图快照扩展为lifecycle created、OneFrame未初始化、Slide manager未初始化、零active/trace。定向TypeScript、AL01–AL22、第一切片17项和时钟15组通过。
- 本批由独立验收检查触发，证明验收流程仍在继续而非修复后直接结束。A08/A09保持“实现修复，待独立验收”，A10继续打开；下一步继续审计A09/A10及A00–A07证据映射。

#### 2026-07-29 第四十四批：root shape与command preflight补修

- 重新枚举A04/A05所有生产root的`FrontNoteType/GameNoteType/AfterNoteType`组合，并从两个冻结BMS观察普通`0/0`、Long`1/1`、Flick`2/2`、SlideA`3/4`、SlideB`4/5`、Directional/Multiple`10/11`及visual helper`24/25`。此前除Long/Slide terminal与Directional外，其余错配shape可通过activation owner。
- `validateAutoLiveActivationGraph`现先验证U01/R02/R10闭合family shape；`NoteSingleBase`与visual helper direct activate同样复用。playable button identity同时要求primary为0–15、array非空/含primary/去重/全成员可玩；Slide所有child也在父图preflight中验证，controller Setup保留第二道检查。
- NoteManager `validateSetup`补齐`noteFamily`与CC03/CC08规则；unknown family、invalid BPM command、非法Directional source、family错配与button错配均在OneFrame/Slide/pool/group/BPM/root/scheduler mutation前失败。AL22加入对应direct Note/manager完整快照。
- 两个冻结production BMS额外离线枚举确认全部playable root的primary均在button array内、无空/越界/重复，`buttonTypes`与`buttonTypesArray`一致；定向TypeScript、AL01–AL22、时钟15组与production roots 825/598通过。
- 本批继续属于验收触发修复，不恢复A08/A09/A10或完成勾选。下一步从A00证据门开始逐项重新验收，并继续搜索组合/生命周期遗漏。

## 2. 固定范围

### 2.1 纳入范围

- 显式 Auto Live 模式输入及 `get_IsAutoPlay` 的 Auto Live 分支。
- `JudgementAdjustValueB` 调整后位置在 Auto Live Force Perfect 中的消费。
- Normal/Single Note 的 adjusted-position crossing 与 `Perfect (4)` 提交。
- `NoteFlickBase.forcePerfect` 的 base-first 路由及专用合成移动回调边界。
- Long 的根节点 Perfect、终端 Perfect、状态转换和父/After 更新所有权。
- Slide 的根节点、当前待处理 after 节点、中间/终端区分、Stop Force Perfect 和子节点推进。
- `NoteBase.ExecuteUpdate` 状态分派之后的派生 `OnUpdate`，以及父 Note 驱动的 AfterUpdate。
- Auto Live 所需的 `OneFrameData` 已确认字段、5 槽池、获取、Setup、池序收集、同帧聚合与统一清除。
- 同位置多个根 Note、同一外层帧跨多个 adaptive 子步事件的聚合边界。
- 暂停期间 Auto Live、子节点、OneFrame 池和事件轨迹冻结。
- 生产普通谱面和 HABAHIRO 谱面的 Auto Live 判定轨迹；HABAHIRO 只消费已确认静态谱面结构。
- 仅面向 `src/simulator` 的类型检查、依赖边界和隔离测试。

### 2.2 排除范围

- 真实触点、手指所有权、lane 仲裁、触摸移动/抬起和判定窗口。
- 普通模式的 Wait/Stop 超时 Miss、伤害与 release 判定。
- Slide 手动释放时 `JudgementAdjustValueB >= 1` 强制 Perfect 的次级消费者。
- `getNoteResultType` 的完整 Situation Skill 变换；A02 必须证明本阶段允许的无变换上下文中 raw Perfect 保持 adjusted Perfect。
- 基础分、Combo rate、Auto Live coefficient、Power、Life、Never Die、Skill、Fever、Crescendo、Stage Effect 和记录写入。
- `InGameManager.onJudgeNote` 的 Tap SE、Flick SE、静音窗口和外部 UI 回调副作用。
- 粒子、动画、Flick finger effect、Sprite、Mesh、同步线和任何 Pixi 表现。
- BGM、判定音、Hold 音效、CRIWARE 或 Web Audio。
- move-time、`ReturnTime`、`RefreshAfterMoveTime`、快照回退和 16 秒无输入回放。
- Unity PlayerLoop 外围相位、GPU 呈现、随机流和视频/音频物理对齐。
- `App.tsx`、编辑器控制器、窗口路由、Tauri、移动端入口与启动载荷。
- GarupaEditor 整体构建和 Vite/Tauri 联调。

## 3. 强制执行规则

1. A01/A02 完成前禁止修改 A03–A10 的生产实现；任务书、Reverse 证据与冻结包可以先行。
2. 只消费 Reverse 已提交对象；当前 Reverse 未提交工作树和 `runtime/tools/` 永久排除。
3. 每个比较符号（`>=`、`>`）、每次状态变化、当前节点选择、列表推进和容器清除都必须指向第 5 节证据 ID。
4. 汇总 JSON 不能覆盖其直接反编译源；汇总与源冲突时先修 Reverse，禁止在 GarupaEditor 侧择一。
5. Python 原型的 `inference` 条目不得进入生产代码；必须由 R 系列闭合证据晋升为 confirmed。
6. TypeScript 测试只读取冻结 JSON/TSV/BMS，不执行 Python、不读取 Reverse 工作树、不联网。
7. `engine/` 不得依赖 React、Pixi、DOM、Tauri、编辑器谱面类型、窗口协议或测试 fixture 身份。
8. 原作运行字段与测试观察分离：测试序号、oracle case ID、证据 ID 和期望事件不得写入生产 Note/OneFrame 类型。
9. 未恢复的 OneFrame 字段使用类型上的 absent/deferred 状态，不得以数值默认值占位。
10. 遇到非有限位置、非法模式、未识别 Note family、缺失 after 图、池耗尽、重复 Setup 或未闭合分支时返回 `evidence-required`。
11. 一次 `step` 失败后不得留下半占用容器、半推进 after cursor 或已经提交但未记录的判定；A02 必须给出可实现的原子边界。
12. 不用旧模拟器、通用音游经验、Python 原型默认配置、画面观感或“Auto Live 应该如此”补齐行为。
13. 每批先更新本文档的进度、证据状态和验证结果，再提交。
14. 证据、核心状态机、测试/验收与未来后端表现分开提交。

## 4. 证据包规划

### 4.1 目录结构

```text
tmp/simulator-reverse-evidence/auto-live/
├── manifest.json
├── OPEN_GAPS.md
├── README.md
├── verify.mjs
├── artifacts/
│   ├── auto-live-runtime-contract/
│   │   ├── README.md
│   │   ├── closure.json
│   │   ├── targets.tsv
│   │   └── decompiled/
│   ├── auto-live-perfect-phase-adjustment/
│   ├── formal-play-live-core-settings/
│   ├── timeout-flick-paths/
│   └── judgement-result-pipeline/
├── fixtures/
│   ├── auto-live-fixed-event-trace.json
│   ├── auto-live-production-cases.json
│   └── auto-live-failure-cases.json
└── upstream/
    ├── chart-construction.json
    └── clock-scheduling.json
```

约束：

- `auto-live-runtime-contract/` 必须先在 Reverse 中提交，再字节保持复制。
- `fixtures/auto-live-fixed-event-trace.json` 必须由 Reverse 的离线 Python 生成器产生并提交；GarupaEditor 只读冻结结果。
- `verify.mjs` 必须验证：Reverse 源提交、冻结副本、manifest 字节数/SHA-256、Git index 和 upstream manifest 锁。
- 运行时代码不得读取本目录。

### 4.2 上游依赖

| ID | 已验收来源 | 本阶段用途 |
| --- | --- | --- |
| U01 | `tmp/simulator-chart-construction-acceptance.md` | `ChartConstructionResult`、根 Note 顺序、Long/Slide 共享图身份和生产 BMS |
| U02 | `tmp/simulator-reverse-evidence/chart-construction/manifest.json` | 普通/HABAHIRO 冻结谱面与构造 oracle 哈希 |
| U03 | `tmp/simulator-clock-scheduling-acceptance.md` | 双时钟、adjusted position、BPM 切换、自适应子步和两阶段调度 |
| U04 | `tmp/simulator-reverse-evidence/clock-scheduling/manifest.json` | `GetAdjustMusicPos`、Fast/Slow、Note Update/AfterUpdate 顺序与运行证据 |
| U05 | `tmp/simulator-first-slice-acceptance.md` | Note 四态、对象池、活跃列表回调和 OneFrame 控制器所有权 |

上游结论只能按原验收边界消费。本阶段不得重解释时钟阈值、谱面构造顺序或暂停门。

## 5. Reverse 原作证据候选

以下 SHA-256 均对 `74ab76f6838847d98aae1a15741a5f024e3774ff:<path>` 的 Git blob 内容计算。表中“候选”表示路径和字节已锁定，但在 A01 晋升提交与新 closure 完成前不能直接驱动代码。

| ID | Reverse 路径 | 字节 | SHA-256 | 用途/状态 |
| --- | --- | ---: | --- | --- |
| E01 | `artifacts/investigations/auto-live-perfect-phase-adjustment/README.md` | 1,959 | `16A9059F2267B851B49EB1DD3561EA8B307523239720563F2D82618F8CA6385B` | Single adjusted crossing 摘要；候选 |
| E02 | `artifacts/investigations/auto-live-perfect-phase-adjustment/auto_live_perfect_phase_adjustment.json` | 11,950 | `DCDCD6AD1D83827BFCD9C6B99ABAA313FF937ADB36B4E47DFB62415370C0B8F6` | Single/IsAutoPlay/offset 机器可读结论；**内部源 profile 陈旧，A01 必修** |
| E03 | `artifacts/investigations/auto-live-perfect-phase-adjustment/targets.tsv` | 1,035 | `326675CCD372DDD75B6EA4A3DC000EB47CC91DF226DE9B45E1104610D6EB18FE` | RVA 路由；候选 |
| E04 | `artifacts/investigations/formal-play-live-core-settings/README.md` | 1,376 | `DBC13CF59656E926D7EF31C679EF16BFFEFDB4A608FBDCFA19CFF3363CC72C64` | 正式样本 persisted B=0 修订 |
| E05 | `artifacts/investigations/formal-play-live-core-settings/formal_play_live_core_settings.json` | 5,004 | `5125360FB5B1E44FF7582408F54FE8D9E03E6E3809AF017EE1A521ED555C0222` | B=4 假说被否定；样本绑定 |
| E06 | `artifacts/investigations/runtime-integration-prototype/auto_live_force_perfect_state_paths.json` | 4,639 | `B360DFBC9BD09DC2AA739B8FFCBEBB5D6B3D9228716983E5202682995A9DF697` | Normal/Flick/Long/Slide 路由摘要；含 inference，A02 前不可直接实现 |
| E07 | `artifacts/investigations/timeout-flick-paths/README.md` | 7,898 | `0305AD889AE001148302C68E620B2168FED6E32236FD52067964BBFEA7E0C575` | Long/Slide/Flick 状态摘要 |
| E08 | `artifacts/investigations/timeout-flick-paths/targets.tsv` | 3,616 | `DC94290C88B0C4476BC1E12E2886C310F1F96384A22F9EF07E5D23BA1FC9284C` | 29 个状态方法边界 |
| E09 | `artifacts/investigations/timeout-flick-paths/decompiled/030eb680__NoteLong__ExecuteAfterUpdate.c` | 527 | `C16D13ED3104EB1FE92D9DA2F21D75BB0A6C160AD5C282DC2C63796E4F212262` | Long base AfterUpdate 后驱动 linked after |
| E10 | `artifacts/investigations/timeout-flick-paths/decompiled/030eb6b0__NoteLong__OnUpdate.c` | 2,006 | `E29064C6303C725F72049F17A2BE8ECF4D65345736E6FCE2982B298043E734F0` | linked after Update 后 Force Perfect 路由 |
| E11 | `artifacts/investigations/timeout-flick-paths/decompiled/030eb7a0__NoteLong__forcePerfectOnUpdate.c` | 2,188 | `95944BDCEC2DE63B300FDAC8E2AE88431192B1D00D0E23A566D60090E823B718` | Long 尾 crossing 与双提交链 |
| E12 | `artifacts/investigations/timeout-flick-paths/decompiled/030eb8fc__NoteLong__MoveState.c` | 878 | `1BF5E843954BD38817AA84B40ED8A9A4BB2A23D8D3E2BBA9E0F5E7A8A0206005` | Auto/ForcePerfect Move 路由 |
| E13 | `artifacts/investigations/timeout-flick-paths/decompiled/030eb97c__NoteLong__forcePerfectMoveState.c` | 1,126 | `18F64A4F7F52C46EF62E657AD0670B48B45D5F034CA884F9390F7B99AABF0A26` | Long 根 `>=`、Wait 转换和 Perfect |
| E14 | `artifacts/investigations/timeout-flick-paths/decompiled/0321ba18__NoteSlide__OnUpdate.c` | 1,436 | `2437B7D472C0161499F1EE734E352FCDD53F370698681128CB345A57424B1E04` | Slide motion、全 after Update、Force Perfect 顺序 |
| E15 | `artifacts/investigations/timeout-flick-paths/decompiled/0321bd94__NoteSlide__forcePerfectOnUpdate.c` | 3,562 | `585CF068BD0F4AB83EDA14922B9D5571324AB21514987D400DAE4A9D8B91FE15` | 当前 after、中间/终端分支 |
| E16 | `artifacts/investigations/timeout-flick-paths/decompiled/0321bfd4__NoteSlide__MoveState.c` | 4,578 | `39BF3110E717411AFCE3978D31771E65F42AA352D0028421EA591F4D50F6257A` | Slide Auto Move 路由 |
| E17 | `artifacts/investigations/timeout-flick-paths/decompiled/0321c1cc__NoteSlide__forcePerfectMoveState.c` | 2,100 | `3AC65DB508F03FFEB7EEAA91F9E4BE537C6094DB546B0C30895E1FD5A22C120C` | Slide 根 `>=`、Wait、front Perfect |
| E18 | `artifacts/investigations/timeout-flick-paths/decompiled/0321c558__NoteSlide__StopState.c` | 4,496 | `F3157A8F778E0F7A630FFCD301E07FBFC7C2FFD6825C62A36B17DA5790B03CF5` | 首个 pending visible after 与 Auto Stop 路由 |
| E19 | `artifacts/investigations/timeout-flick-paths/decompiled/0321c810__NoteSlide__forcePerfectStopState.c` | 2,166 | `76293C600769158802A247AED40DA80A4EF18C73FEB9FD32A9A80E29B7BA7365` | selected stopped after 的 Perfect |
| E20 | `artifacts/investigations/timeout-flick-paths/decompiled/0321fdbc__NoteSlide__ExecuteAfterUpdate.c` | 693 | `DE6A849B66283F1190CAF6E73C709E53D7FF8A4722D8481989F489EF0AF00883` | Slide base 后只转发当前 after 的 AfterUpdate |
| E21 | `artifacts/investigations/judgement-result-pipeline/README.md` | 6,706 | `150A105CD75CFBB62D39F54CD57BC0D3A8A2ACDCD7BA3510350FE6C5CBC47DC7` | 判定构造、OneFrame 字段和聚合摘要 |
| E22 | `artifacts/investigations/judgement-result-pipeline/pipeline.pseudocode.cs` | 3,635 | `D01198AB6BEB98DC34BC253D9707FC0DE9B0363DFC007F2A992B68EE081A1CDA` | 实现导向摘要；不覆盖直接 C 源 |
| E23 | `artifacts/investigations/judgement-result-pipeline/decompiled/030e0fec__NoteFrontBase__judgeFrontNote.c` | 7,878 | `27751F90D463CDFB074A38F1607FCBA3F0E94891F1F474074D571D600E10048A` | raw→adjusted、addCombo、Setup 与 finish 顺序 |
| E24 | `artifacts/investigations/judgement-result-pipeline/decompiled/032f3888__OneFrameData__Setup.c` | 1,194 | `7D49B592BB71CFD65ED29B9CE95B46D52DC211A2055E1E585E8DAD2585606F9A` | `IsUse` 与 0x14–0x58 字段写入 |
| E25 | `artifacts/investigations/judgement-result-pipeline/decompiled/032fcb28__InGameManager__onJudgeNote.c` | 2,773 | `8A3D8CCC5EBC51162CC1569D117049FB48CCB9F4FBB4D702BADAB2E1DE7A808B` | OneFrame 后续 SE/外部 callback 边界；本阶段不实现副作用 |
| E26 | `artifacts/investigations/judgement-result-pipeline/decompiled/03304eac__InGameOneFrameJudgementController__ReflectOneFrameData.c` | 10,305 | `BC2F6A9035A1086630AC2849234DD30E07BEA8104F8816BBB9A4282CE04256AF` | 池序扫描、清 IsUse、聚合；分数/生命分支后置 |
| E27 | `artifacts/investigations/runtime-integration-prototype/runtime_integration.py` | 451,173 | `2BC7910954AAD17978EB466E8FE3A247360EEBC59214EA39D0344AE571B46D8F` | 离线 oracle 生成候选；**不是行为证明** |
| E28 | `artifacts/investigations/runtime-integration-prototype/test_runtime_integration.py` | 335,219 | `EA4F16CFB07F848771249031CD64F08AB327863AC24C0A91A1CB74911341FFA6` | 现有 Auto Live 场景候选；含原型假设 |
| E29 | `artifacts/investigations/runtime-integration-prototype/validation_results.json` | 76,449 | `37CE776650209BCD7ADBFB62F466FED48DBB4FFA472A9F0BBF9287ACB511D550` | 原型测试通过清单；不提供固定事件轨迹 |
| E30 | `artifacts/investigations/runtime-integration-prototype/judge_timing_adjustment_persistence_and_secondary_consumers.json` | 6,587 | `7CED568F056C39EEC70C7820446FDBB4685694A1A7F8FCAB05289BB756118707` | adjusted position 次级消费者与持久化修订 |

### 5.1 当前静态候选已经确认的事实

在 A01 一致性修订后，可晋升的事实包括：

1. E01–E03：`NoteSingleBase.MoveState @ 0x30E1698` 读取 adjusted music position；`adjusted - absolutePos >= 0` 后检查 `get_IsAutoPlay`，同次 MoveState 虚调用 `forcePerfect`。
2. E02/E03：`get_IsAutoPlay @ 0x32F1E68` 的规则是内部 auto-play 字段或 `IsAutoLive`；本阶段只开放后者。
3. E02/E03/U03：`JudgementAdjustValueB` 每单位使用一个 tempo-aware 1/60 秒位置步；Auto Live 必须复用既有 `GetAdjustMusicPos`。
4. E04/E05：正式 AVD 样本 persisted B 为 0；此前 B=4 只是扫描假说，已被否定。B=0 只用于该固定样本，不成为全局默认。
5. E06/E07/E10/E12/E14/E16：Long/Slide 在 Auto Live 或内部 mode 14 时进入各自 Force Perfect 路径，不继承 Single 的“一次完成全部节点”模型。
6. E13：Long 根比较为 `adjusted - root >= 0`，然后变为 Wait 并提交 front Perfect。
7. E11：Long 尾比较为 `adjusted - tail > 0`，严格大于后先调用 linked after，再提交 Long root 尾 Perfect。
8. E17：Slide 根比较为 `adjusted - root >= 0`，然后变为 Wait 并提交 front Perfect。
9. E15：Slide `forcePerfectOnUpdate` 只围绕当前 selected after 展开；中间与终端调用不同虚槽。
10. E18/E19：Stop 路径选择首个 pending visible after；到点后由 `forcePerfectStopState` 处理选中节点。
11. E09/E10/E14/E20：Long/Slide After 对象不进入根 active list；父 Note 在自身 OnUpdate/ExecuteAfterUpdate 内驱动子对象。
12. E21–E24：Perfect 枚举值为 4；Great/Perfect 的 addCombo 为 +1；Perfect 的 JudgeTiming 强制 None；`OneFrameData.Setup` 才设置 `IsUse = true`。
13. E26：Reflect 按控制器列表顺序扫描 used 容器，消费时立即清 `IsUse`，随后形成一帧聚合。
14. baseline `live.c#0x3304C40` 的直接切片显示 `InitOneFrameDataList` 循环常数为 5；该切片必须在 A01 晋升为最小独立证据，不能只引用 65 MB bundle。

### 5.2 当前不一致与开放缺口

以下任一项未关闭时，A02 必须保持 blocked：

| Gap | 问题 | 关闭要求 |
| --- | --- | --- |
| G01 | E02 内记录 `judgement_adjustment_chain` 为 6,423 bytes / `828B...`，但 baseline E30 实际为 6,587 bytes / `7CED...` | Reverse 重生成 E02 或新 closure，所有内部 source profile 与锁定 Git blob 一致 |
| G02 | E05 内引用 phase scan 为 12,260 bytes / `04D3...`，但 baseline E02 实际为 11,950 bytes / `DCDC...` | 建立最终修订链，明确 E04/E05 否定 B=4，verifier 拒绝陈旧引用 |
| G03 | E06 把“大步跨多个 Slide 节点时每次更新最多推进一个”列为 inference | 由精确调用图/ARM64 或只读轨迹晋升；否则该分支必须 `evidence-required` |
| G04 | E06 声明 Flick base-first + 合成移动，但没有固定合成 X、回调参数和是否产生第二个 OneFrame 事件的闭合轨迹 | 晋升 `NoteFlickBase.forcePerfect`、普通/Directional getter 与回调目标；固定一次判定/回调序列 |
| G05 | Long/Slide 的 judge 虚槽会改变哪些父/子状态、何时 Deactive/推进 current 指针尚未在汇总证据中逐字段闭合 | 晋升 finish/judge/current-node 方法和状态快照，生成逐调用前后轨迹 |
| G06 | raw Perfect 经 `getNoteResultType` 后是否在本阶段允许的上下文中恒为 adjusted Perfect 未单独闭合 | Reverse 锁定“无 active result-transform skill”上下文及 identity 结果；其他上下文失败关闭 |
| G07 | 5 槽初始化、first-unused 获取、池耗尽行为与空帧 Reflect 需要最小可校验证据 | 晋升 Init/Get/exists/GetReflect/Reflect 精确切片和调用顺序；禁止沿用第一切片调用者容量 |
| G08 | Python 原型现有 validation 只有通过项，没有不可变固定事件轨迹，且混有粒子、音频、分数默认值 | 生成 Auto-only JSON oracle，删除/标记超出本阶段字段，每个事件带静态证据路由 |
| G09 | 外层帧含多个 adaptive 子步时，多个子步产生的 OneFrameData 是否统一到一次 Reflect 需要精确 owner 顺序 | 晋升 `InGameManager.updatePlayState` 中 NoteManager→其余 manager→Reflect 的调用证据和 oracle case |
| G10 | 生产 Long/Slide 图中 invisible、terminal、directional after 的 Force Perfect 分支覆盖不完整 | 从已冻结生产 BMS 选择真实节点，缺少的实体类型回 Reverse 补静态或只读证据 |

## 6. A02 硬门：Reverse 必交产物

在 `GirlsBandParty-Reverse` 新建并提交：

```text
artifacts/investigations/auto-live-runtime-contract/
├── README.md
├── closure.json
├── targets.tsv
├── auto_live_runtime_contract.json
├── auto_live_fixed_event_trace.json
├── auto_live_failure_cases.json
├── generate_auto_live_fixed_event_trace.py
├── verify_auto_live_runtime_contract.py
└── decompiled/
```

### 6.1 最小反编译切片

至少包含并逐函数记录 entry/end、源二进制哈希、metadata 签名和调用目标：

- `InGameCalculatedData.get_IsAutoPlay @ 0x32F1E68`
- `NoteSingleBase.MoveState @ 0x30E1698`
- `NoteSingleBase.forcePerfect @ 0x30E1838`
- `NoteFlickBase.forcePerfect @ 0x3A77768`
- `NoteFlick.getForcePerfectFlickTouchPosX @ 0x30EAD54`
- `NoteDirectionalFlick.getForcePerfectFlickTouchPosX @ 0x30EA108`
- `NoteBase.onFinishJudgeFrontNote @ 0x3A76520` 及 Auto 路径实际派生 override
- E09–E20 的 Long/Slide 方法
- Long/Slide 当前 after 选择、judge、推进和失活的直接调用目标
- `NoteFrontBase.judgeFrontNote @ 0x30E0FEC`
- `OneFrameData.Setup @ 0x32F3888`
- `InGameOneFrameJudgementController.InitOneFrameDataList @ 0x3304C40`
- `GetUsableOneFrameData @ 0x3304D24`
- `existsOneFrameData @ 0x3304E04`
- `ReflectOneFrameData @ 0x3304EAC`
- `GetReflectOneFrameData @ 0x3304A68`
- `InGameManager.updatePlayState @ 0x32F9BB0` 的 NoteManager/Reflect owner 顺序。

### 6.2 固定事件轨迹 schema

每个 case 至少记录：

```json
{
  "case_id": "production-source-stable-id",
  "source_note": {
    "chart": "committed path",
    "note_index": 0,
    "family": "normal|flick|directional-flick|long|slide"
  },
  "settings": {
    "is_auto_live": true,
    "judgement_adjust_value_b": 0
  },
  "steps": [
    {
      "outer_frame": 0,
      "substep": 0,
      "adjusted_position_bits": "0x00000000",
      "event": "head-perfect|intermediate-perfect|tail-perfect|flick-route|reflect",
      "state_before": "Move",
      "state_after": "Wait",
      "one_frame_slot": 0
    }
  ]
}
```

规则：

- Float32 值同时保存十进制与原始 bits。
- 事件顺序必须来自原作调用链，不来自按位置排序的后处理。
- oracle 生成器可调用 Reverse Python 原型，但必须校验每个分支已在 `closure.json` 的 confirmed facts 中。
- 不把粒子、音频、分数、生命或渲染事件放入本阶段期望轨迹。
- 如果这些副作用出现在原型事件流中，生成器必须显式过滤并在 schema 中记录 `excluded_by_stage`，不能静默消失。

### 6.3 关闭条件

`closure.json` 必须满足：

```json
{
  "overall_status": "confirmed",
  "auto_live_gate": "closed",
  "blocking_findings": []
}
```

并至少确认：

1. G01–G10 全部 closed，或被证明与本阶段运行不可达且以明确失败关闭分支隔离。
2. fixed trace 至少两次独立生成完全一致。
3. verifier 在无设备、无 GarupaEditor、无网络环境通过。
4. Python 文件只在 Reverse 侧用于生成/复算；GarupaEditor 测试不调用它。
5. Reverse 提交完成后再创建 GarupaEditor manifest；不得先复制未提交文件。

### 6.4 最终 R 系列证据 ID

A01/A02 完成后，后续实现只引用以下最终晋升 ID；E01–E30 继续作为底层来源，不以候选汇总结论替代 R 系列 closure：

| ID | 最终产物 | 消费范围 |
| --- | --- | --- |
| R01 | `auto-live-runtime-contract/closure.json` | A02 总门、G01–G10 状态、confirmed/inferred/unresolved 分类 |
| R02 | `auto-live-runtime-contract/auto_live_runtime_contract.json` | 精确比较符、状态转换、父子所有权、Flick 参数、5 槽池与 Reflect owner 顺序 |
| R03 | `auto-live-runtime-contract/auto_live_fixed_event_trace.json` | A05–A10 的逐事件、Float32 bits、slot、cursor 与外层帧 oracle |
| R04 | `auto-live-runtime-contract/auto_live_failure_cases.json` | 非法模式、坏图、池耗尽、未知 skill/Note 分支的失败关闭矩阵 |
| R05 | `auto-live-runtime-contract/targets.tsv` 与 `decompiled/` | 每项 R02 结论到原始方法/ARM64/反编译切片的路由 |
| R06 | `auto-live-runtime-contract/verify_auto_live_runtime_contract.py` | Reverse 离线复算入口；不得被 TypeScript 或生产脚本调用 |

manifest 必须为 R01–R06 记录最终 Reverse 提交、源路径、冻结路径、字节数和完整大写 SHA-256。若最终晋升拆分出更多文件，可增加 R07 以后编号，但不得重定义 R01–R06 的职责。

## 7. 目标运行模型

### 7.1 宿主模式输入

计划把运行设置扩展为显式判别联合：

```ts
type SimulatorPlayMode =
  | { readonly kind: "manual" }
  | {
      readonly kind: "auto-live";
      readonly resultTransform: "identity-no-active-situation-skill";
    };
```

约束：

- 调用者必须提供 mode；不设默认 manual 或 auto-live。
- `manual` 只表示不走 Auto Force Perfect；真实输入仍为 `evidence-required`。
- 不暴露 mode 14、debug auto-play flag 或任意 `forcePerfect: boolean` 快捷开关。
- `resultTransform` 只在 G06 闭合后开放；任何其他技能变换上下文返回 `evidence-required`。
- judge offset 继续使用现有 `judgeOffsetFrames`，不得在 Auto 配置重复一份。

### 7.2 Note 运行图

根池仍由 `NoteManager` 拥有。A04 需要在池对象初始化时建立：

- Long root → 唯一 linked after runtime object。
- Slide root → 按 `slideNoteList` 原共享身份顺序建立 after runtime object 列表。
- current/next after 指针或索引必须来自 A01 晋升的原作字段职责。
- invisible、intermediate、terminal、flick/directional terminal 属性从构造结果读取，不重解析 BMS。
- 子对象不加入 `activeNotesValue`；父对象失活时按证据重置子图，以供池复用。
- 同一 chart `NoteInformation` 共享节点不得被深拷贝成多个逻辑节点。

### 7.3 Force Perfect 共通规则

- 每次 Note `ExecuteUpdate` 先执行当前 State phase，再执行派生 `OnUpdate`，沿用 U03/U05。
- crossing 使用 `NoteManager.getAdjustedMusicPosition()`，每个原作调用点单独采样；不得缓存为整帧一个值，除非 A01 证明调用点共享。
- Perfect raw 枚举固定为 4。
- 所有一次性提交必须有已判定/状态门，避免后续 Update 重复生成 OneFrameData。
- 比较符号逐类型保留，禁止统一写为 `>=` 或 epsilon 比较。

### 7.4 OneFrame 的阶段边界

本阶段计划将容器拆为：

```ts
interface AutoLiveJudgementData {
  readonly noteIndex: number;
  readonly buttonTypes: readonly number[];
  readonly noteType: number;
  readonly rawResult: 4;
  readonly adjustedResult: 4;
  readonly addCombo: 1;
  readonly absolutePosition: number;
  readonly judgeTiming: 0;
}
```

此结构只是本阶段已确认字段的内部载荷。以下字段不得出现数值占位：

- addScore / free-live addScore
- addPower / damage / damage guard 的业务结果
- Fever/Skill/Crescendo rates
- score-up type
- Life/record/HUD 结果。

Reflect 只可输出：

- 按 5 槽池顺序收集的判定条目；
- entry count；
- 本阶段可闭合的 `addCombo` 总和；
- representative raw/adjusted Perfect 与 JudgeTiming None；
- 清除后的槽位状态。

该输出必须命名为测试/宿主投影，例如 `OneFrameJudgementBatch`，不得命名为完整原作 `OneFrameTotalData`。后续“分数、生命与状态”阶段再扩展原作完整 Reflect 消费链。

## 8. 分项任务

### A01 晋升 Auto Live 静态证据

**依赖**：A00。

**落地步骤**：

1. 在 Reverse 从锁定 APK/metadata/ELF 重新导出第 6.1 节最小函数。
2. 修复 E02/E05/E30 内部 source profile 不一致，不覆盖历史结论，建立最终修订关系。
3. 为每个函数记录精确 entry/end、调用者、被调用者、字段 offset 和 confirmed/inferred 分类。
4. 把 5 槽初始化从大 `live.c` 晋升为最小独立切片。
5. 运行 Reverse verifier，提交 Reverse。
6. 字节保持复制到 Auto Live 证据包，建立 manifest、`OPEN_GAPS.md` 与三方校验器。

**验证**：

- Reverse verifier 通过。
- `verify.mjs` 工作树模式通过。
- 暂存后 `verify.mjs --index` 通过。
- manifest 不引用 Reverse 未跟踪文件。

**停止条件**：任一 source profile、函数边界或哈希不一致，停在 A01，不进入 A02/A03。

### A02 生成离线 oracle 并关闭 G01–G10

**依赖**：A01。

**落地步骤**：

1. 在 Reverse 为 Normal、Flick、Directional、Long、Slide 构造证据绑定 case。
2. case 优先从 U02 的生产谱面选取；无法覆盖的最小 case 必须由已提交方法级证据构造并标为 method fixture，不得冒充实体谱面。
3. 输出 adjusted position、状态、父/子 cursor、OneFrame slot 和 Reflect 顺序的固定轨迹。
4. 覆盖 B=-5/0/+5、BPM 边界、同位置组、adaptive 多子步、暂停、5 槽耗尽和错误输入。
5. 两次生成字节一致；新进程重跑 verifier 一致。
6. `closure.json` 关闭 G01–G10，冻结到 GarupaEditor。

**必测 oracle case**：

- crossing 前一 Float32 step 不判定，到点同 Update 判定。
- manual 模式同位置不 Force Perfect。
- Normal 同时组保持 NoteManager 反向 Update 所产生的容器顺序。
- Flick base Perfect 与专用回调的精确先后和事件数。
- Long head 与 tail 分离；tail 严格 `>` 边界。
- Slide 至少两个相邻 after 节点，证明单次调用粒度。
- Slide invisible/terminal/Stop 路径。
- 多 adaptive 子步事件在一次外层 Reflect 中的归属。
- 5 个 used slot 成功；第 6 个按原作边界失败关闭或匹配已确认异常。

**停止条件**：`blocking_findings` 非空时不得以局部 case 通过为由进入 A03。

### A03 接入 Auto Live 模式与判定上下文

**依赖**：A02 gate closed。

**目标文件**：

- `src/simulator/host/contracts.ts`
- `src/simulator/host/createSimulatorEngine.ts`
- `src/simulator/engine/data/` 下新的模式/判定上下文类型
- 对应 testing adapter。

**落地步骤**：

1. 增加 `SimulatorPlayMode`，所有生产调用显式提供。
2. 在原作模型侧建立最小 `InGameCalculatedData` Auto Live 状态职责，不把宿主类型直接传遍 Note。
3. `getIsAutoPlay` 只开放 Auto Live 分支；manual 返回 false，mode14/debug 来源不表示。
4. 绑定 G06 允许的 identity result-transform 上下文。
5. 非法模式、缺字段、未知 transform 失败关闭。
6. 校验成功后只把规范化不可变模式值交给 `InGameCalculatedData`；不保留调用者输入对象别名，getter 也不得暴露可修改内部引用。

**证据**：E01–E06、R01–R05、U03。

**验收**：manual 与 auto-live 使用同一 chart/clock，只有 auto-live 在 crossing 进入 Force Perfect；未触发真实输入。合法创建后修改原 `playMode` 对象或从 owner getter 取得的值，均不能改变已验证模式、transform、snapshot 或 crossing 路由。

### A04 建立 Long/Slide 运行子图

**依赖**：A03。

**目标文件**：

- `src/simulator/engine/notes/noteTypes.ts`
- `src/simulator/engine/notes/` 新增 after runtime 实体（如需）
- `src/simulator/engine/managers/noteManager.ts`
- `src/simulator/engine/managers/slideNoteManager.ts`

**落地步骤**：

1. 从 `NoteInformation` 的 `afterNoteAbsolutePos`/`slideNoteList` 和共享对象身份建立运行图。
2. Long 绑定唯一 after；Slide 保留构造列表顺序与共享身份。
3. 建立 current/next/pending/invisible/terminal 状态，不引入测试 ID。
4. 父 Note 激活时初始化子图；父回池时按证据 Reset。
5. 子对象只由父 Note 更新，不进入根 active list。
6. 缺失终端、重复共享映射、非法 after 类型失败关闭。

**证据**：E06–E20、U01/U02、R02/R03。

**验收**：生产 Long/Slide 对象图数量、节点身份、顺序、激活与回收轨迹匹配 oracle。

### A05 恢复 Single 与 Flick Force Perfect

**依赖**：A04。

**落地步骤**：

1. 实现 `NoteSingleBase.MoveState` 的 adjusted crossing。
2. crossing 前清/保持内部计时字段，crossing 后按证据检查 Auto Live。
3. Normal 同次 MoveState 提交一次 raw Perfect。
4. Flick 先走 Single Perfect，再执行专用合成移动路由。
5. Directional Flick 使用 R02 锁定的合成 X/方向参数；未知 FrontNoteType 失败关闭。
6. audio/particle/render 只记录“请求边界尚后置”，不发送伪造后端事件。

**证据**：E01–E06、E21–E24、R02/R03。

**验收**：before/equal/after crossing、B offset、同位置 Normal+Flick、Flick 事件数和重复 Update 去重全部匹配。

### A06 恢复 Long 分阶段完成

**依赖**：A05。

**落地步骤**：

1. Move state 使用 `>= root`；到点变 Wait 并提交 front Perfect。
2. `OnUpdate` 先驱动 linked after `ExecuteUpdate`，再检查 Auto Live tail。
3. tail 使用 E11/R02 锁定的严格 `> tail`。
4. tail 到点先执行 linked after 路由，再执行 Long root 尾路由。
5. `ExecuteAfterUpdate` 先 base，再 linked after。
6. 根据 R02 锁定状态完成、失活、callback 和池复用顺序。
7. 不实现普通 Wait/Stop Miss 或 Hold 音效。

**证据**：E09–E13、E21–E24、R02/R03。

**验收**：头尾分离、等于 tail 不判/下一可达 step 判、父子事件顺序、暂停和回收匹配固定轨迹。

### A07 恢复 Slide 分阶段完成

**依赖**：A06。

**落地步骤**：

1. Move state 使用 `>= root`，切 Wait 并提交 front Perfect。
2. `OnUpdate` 按证据先处理父更新/运动边界，再按列表顺序驱动 after Update，最后进入 Force Perfect。
3. 每次 `forcePerfectOnUpdate` 只读取 current pending after；不得 while 扫过多个节点。
4. current 是 intermediate 时走 intermediate Perfect 路由；terminal 时走 terminal 路由。
5. 对 current child（包括 invisible）先按 E15 每次独立读取 adjusted position；非有限值失败关闭，`adjusted < current.absolutePos` 保持 cursor/judged/OneFrame 不变。只有到点后，invisible 才按 R02 不提交 OneFrame并单次推进 current。
6. Stop state 扫描首个 pending visible 节点，到点后调用 `forcePerfectStopState`。
7. `ExecuteAfterUpdate` 只转发 R02 指定的 current/selected after。
8. 不实现手动释放、普通 Miss、move-time refresh 或视觉移动。

**证据**：E14–E20、E21–E24、R02/R03。

**验收**：head→intermediate(s)→tail 顺序、相邻节点大步、invisible、Stop、一次调用粒度和最终失活匹配；root crossing 前与 root equal 但 invisible child 未到时 cursor 均不提前推进，child equal 时只跳过该一个节点且不产生 OneFrame。

### A08 恢复 OneFrame 填充与聚合

**依赖**：A07。

**落地步骤**：

1. 用 R02 确认的常数 5 替换调用者证据容量；删除生产 `OneFrameDataPoolProfile`，测试不得改容量。
2. `GetUsableOneFrameData` 按槽位 0→4 找 first unused；获取本身不设置 `IsUse`。
3. 增加 Auto Live 专用 Setup，原子写入第 7.4 节字段并最后/按原作顺序设置 `IsUse`。
4. unknown downstream fields 保持 absent/deferred，不能进入算术。
5. Reflect 只在 exists 成立时产生判定批次；空帧不伪造 batch index。
6. 按池序读取并清除 `IsUse`；同一外层帧所有子步共享一次收集。
7. 第 6 个 simultaneous entry 按 R02 行为失败关闭，不扩容、不覆盖、不 clamp。
8. 删除生产 `stageFixture`，如第一切片测试仍需旁路，将其迁到 `testing/` adapter。

**证据**：E21–E26、R02/R03、U05。

**验收**：单条、两条同时、五条满池、六条溢出、空帧、回收复用和池序代表项匹配。

### A09 接入调度、暂停与生命周期

**依赖**：A08。

**落地步骤**：

1. 保持 U03 的 BPM-before-root、根 active list 反序 Update 和 survivor AfterUpdate。
2. parent 内部 after 更新不得改变根 active list 的遍历 Count。
3. NoteManager 整个 adaptive 子步循环完成后，由 `InGameManager` 在 R02 锁定位置调用 Reflect。
4. 暂停不进入 NoteManager，因此不推进 Auto cursor、不占用/清除 OneFrame slot。
5. resume 不补判暂停期间越过的位置；只在恢复后的正常时钟推进到 crossing 时处理。
6. dispose 清理运行对象但不发判定、音频或渲染副作用。
7. 任一子步失败的原子回滚/失败状态按 R02 实现；不得继续下一子步。

**证据**：U03/U04/U05、E09/E10/E14/E20/E26、R02/R03。

**验收**：反向根顺序、父子顺序、跨子步统一 Reflect、暂停前/中/后和 dispose 确定。

### A10 建立生产 oracle 与阶段验收

**依赖**：A09。

**产物**：

- `src/simulator/testing/runAutoLiveTests.mjs`
- `npm run simulator:test:auto-live`
- `tmp/simulator-auto-live-acceptance.md`
- 更新 `src/simulator/README.md` 和本文档进度。

**落地步骤**：

1. 测试读取冻结 fixed trace，不调用 Reverse/Python/网络。
2. 从 U02 普通和 HABAHIRO 生产谱面选取真实 Normal/Flick/Long/Slide 图。
3. 比较逐步状态、事件顺序、Float32 bits、OneFrame slots 和 Reflect batches。
4. 对两个 production BMS 的首 invisible Slide child 覆盖 root equal/child before/child equal cursor timing，不能只比较最终 Deactive。
5. 覆盖全部失败关闭 case。
6. 运行第一切片、谱面构造、时钟调度回归。
7. 建立验收记录，持续披露未恢复分数/输入/表现边界。

**停止条件**：任何 oracle 需要测试侧修正生产输入、排序事件或忽略未知字段，阶段不得关闭。

## 9. 测试矩阵

| ID | 场景 | 必须断言 | 证据 |
| --- | --- | --- | --- |
| AL01 | Manual vs Auto Live | 同 chart/clock 只有 Auto 在 crossing Force Perfect；校验后的模式身份不受调用者/owner getter别名突变影响 | E01–E06、R02/R03 |
| AL02 | B=-5/0/+5 | adjusted crossing 复用 tempo-aware 1/60 路径 | E02–E05、E30、U03 |
| AL03 | Normal before/equal/after | `<` 不判，`>=` 同次 MoveState Perfect，后续不重复 | E01–E03、R02 |
| AL04 | 同位置 Normal | 反向根 Update 决定 Setup 请求顺序，池序 Reflect | U03、E24/E26、R03 |
| AL05 | Flick | base Perfect 在先，专用回调在后，OneFrame 事件数精确 | E06、R02/R03 |
| AL06 | Directional Flick | 合成 X、方向和回调参数精确；无真实触摸 | R02/R03 |
| AL07 | Long head | `>= root`、Move→Wait、front Perfect | E12/E13、R03 |
| AL08 | Long tail | `> tail`、linked after→root、最终状态/回收 | E09–E11、R02/R03 |
| AL09 | Slide head | `>= root`、Wait、front Perfect | E16/E17、R03 |
| AL10 | Slide intermediate/invisible | current 节点与 intermediate 路由；visible/invisible 均先过 E15 position gate；child before 保持 cursor，child equal 后 invisible 不占槽且 cursor +1 | E14/E15、R02/R03 |
| AL11 | Slide terminal/Stop | terminal 与 stopped after 路由分离 | E15/E18/E19、R03 |
| AL12 | 相邻 Slide 节点大步 | 单次调用最多处理 R02 确认数量 | R01–R03 |
| AL13 | AfterUpdate | Long linked after；Slide current after；父 base 在先 | E09/E20、R03 |
| AL14 | adaptive 多子步 | 子步内判定，外层帧一次 Reflect | U03/U04、R02/R03 |
| AL15 | OneFrame 5 槽 | first-unused、Setup 后 IsUse、池序清除和复用 | E24/E26、R02 |
| AL16 | 第 6 条判定 | 精确失败关闭，无扩容/覆盖/部分提交 | R02/R03 |
| AL17 | 空帧 | 无 used slot 时不产生伪判定批次 | R02 |
| AL18 | 暂停 | 时钟、状态、cursor、slot、事件全部冻结 | U03/U05、R03 |
| AL19 | 生产普通谱面 | 各家族真实 root/graph 路径与 fixed trace 一致 | U01/U02、R03 |
| AL20 | 生产 HABAHIRO | 静态构造图可消费；不宣称已有 HABAHIRO 实体运行证据 | U01/U02、R03 |
| AL21 | 未恢复业务 | 真实输入、技能变换、分数/生命、音频/粒子请求失败关闭 | 第 2.2 节、R04 |
| AL22 | 非法数据 | 非有限位置、坏图、未知 family、重复 Setup、外来 handle 拒绝 | R04 |

固定轨迹比较禁止：

- 按位置重新排序实际事件；
- 忽略同位置事件顺序；
- 对 Float32 使用宽松 epsilon 掩盖 bits 不同；
- 把缺失字段填零后比较；
- 只比较最终“全部 Perfect”而忽略中间状态。

## 10. 验证命令

### A01/A02 证据批

```powershell
# Reverse 中（以最终晋升目录为准）
python artifacts/investigations/auto-live-runtime-contract/verify_auto_live_runtime_contract.py

# GarupaEditor 中
node tmp/simulator-reverse-evidence/auto-live/verify.mjs
node tmp/simulator-reverse-evidence/auto-live/verify.mjs --index
```

### A03–A09 日常隔离验证

```powershell
npx.cmd tsc -p src/simulator/tsconfig.json
npm.cmd run simulator:test:auto-live
node src/simulator/testing/verifyDependencies.mjs
```

### A10 阶段验收

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

A10 前不运行 Vite、Tauri 或 GarupaEditor 整体构建。

## 11. 提交与推送边界

建议批次：

1. `docs(simulator): 规划 Auto Live 证据与实施边界`
   - 本任务书与 README 阶段状态。
2. `docs(simulator): 冻结 Auto Live 原作证据`
   - A01/A02 冻结包、manifest、oracle、gap closure；不含运行代码。
3. `feat(simulator): 接入 Auto Live 模式与运行子图`
   - A03/A04；不含 Force Perfect 业务。
4. `feat(simulator): 恢复 Single 与 Flick Force Perfect`
   - A05。
5. `feat(simulator): 恢复 Long 与 Slide Auto Live 状态机`
   - A06/A07。
6. `feat(simulator): 恢复 Auto Live 帧判定聚合`
   - A08/A09。
7. `test(simulator): 验证 Auto Live 固定事件轨迹`
   - A10 测试、验收和 README 更新。

每批提交前后：

1. 更新本文档进度和批次记录。
2. `git diff --check`（若工作树存在用户无关改动，则至少对本批目标路径执行并记录）。
3. 只暂存本批文件。
4. `git diff --cached --check`。
5. 涉及证据包时运行 `verify.mjs --index`。
6. 检查 staged name-status/stat。
7. 提交后 `git push origin codex/refactor-simulator-implementation`。
8. 确认 `git rev-list --left-right --count origin/codex/refactor-simulator-implementation...HEAD` 为 `0 0`。

不新建、不切换分支；不得把当前工作树的非模拟器改动带入提交。

## 12. 阶段完成定义

只有以下条件全部满足，Auto Live 阶段才能关闭：

- [x] Reverse G19–G22 补充证据提交已锁定；G18 明确 superseded，新 `auto_live_gate = closed` 且 `blocking_findings = []`。
- [x] E02/E05/E30 的内部哈希修订链已闭合，无 stale source profile。
- [x] 补充后的固定事件轨迹覆盖 Multiple Directional、Stop、pause、BPM boundary 与精确 B±5 bits，并可在 Reverse 离线重复生成；GarupaEditor 不调用 Python。
- [x] Auto Live 模式显式接入，manual/mode14/debug 路由没有混淆；校验值与owner均规范化冻结，调用者/getter别名不能改变模式。
- [x] Normal/Flick/standalone Directional/Multiple Directional 的 adjusted crossing、事件数、source-order run state 和顺序匹配。
- [x] Long 头/尾比较符号、父子顺序、状态、active pause 与回收匹配。
- [x] Slide 头/中间/终端/Stop、current/selected cursor 和单次调用粒度匹配 frozen trace；invisible/visible current均先执行E15 position gate。
- [x] Long/Slide after 子图保持构造共享身份并由父对象独占更新。
- [ ] OneFrame固定5槽、first-unused、池序Reflect、清除与Note-level exhaustion保持；**跨controller同ID handle仍可伪造owner，Multiple正count也未绑定到实际runtime group。**
- [x] faulted/disposed公共host在shortcut、director参数校验与Awake前失败关闭；snapshot/幂等dispose允许且不产生backend副作用。
- [x] unknown 分数/生命/技能/音频/粒子字段没有零值或 no-op 伪实现。
- [ ] 同位置、actual adaptive多子步、Long/Slide/Multiple暂停、空帧及既有G19 failure case保持；**portable坏图在同批后继失败时的整批preflight/回滚/有证据保留状态尚未闭合。**
- [x] 普通与 HABAHIRO production Normal/Flick/Directional/Multiple/Long/Slide 回归通过，并以独立 oracle 验证 production group，不由待测函数生成 expected；首invisible Slide child crossing/cursor timing逐对象覆盖89/27个root。
- [x] 第一切片、谱面构造和时钟调度全部隔离回归通过，并补齐fault后全部公共`step`输入优先级回归。
- [x] `engine/` 依赖边界通过。
- [ ] `tmp/simulator-auto-live-acceptance.md` 须加入跨owner handle、exact group-count和同批激活失败结果并重新通过。
- [x] 未修改主程序入口、编辑器控制器、窗口协议、渲染或音频实现。
- [ ] 第十一次审计状态纠正提交推送后，仍须完成生产修复、测试与最终验收批次并确认远端与HEAD为`0 0`。

阶段关闭后，下一阶段只允许按整体计划进入“手动输入与判定”。如果 AL21 中任一手动输入分支仍无实体证据，则下一阶段必须先建立对应设备采证硬门，不能沿用 Auto Live 的 Force Perfect 结果绕过手动判定。

## 13. A00 初始审计结论

任务书建立时已完成以下只读检查：

- GarupaEditor 分支为 `codex/refactor-simulator-implementation`，Auto Live 上游提交已推送。
- Reverse 候选基线 `74ab76f6838847d98aae1a15741a5f024e3774ff` 可解析；当前 Reverse 未提交工作树未作为证据使用。
- E01–E30 的 baseline Git blob 字节数和 SHA-256 已独立计算并写入第 5 节。
- 已确认现有 TypeScript Note 只恢复四态与根池，Long/Slide after 运行图和具体 Note 行为仍为 `evidence-required`，符合 A04 起点。
- 已确认当前 OneFrame 控制器仍使用调用者证据容量和测试 `stageFixture`，A08 必须在 R02 闭合后替换为原作 5 槽生产路径。
- 已确认 Python 原型包含 Auto Live 场景测试，但现有 `validation_results.json` 不是逐事件固定 oracle，不能直接满足整体计划。
- 本批只创建任务文档，不实施 A03–A10，不运行整体构建。
