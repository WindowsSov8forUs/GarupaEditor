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
- 当前状态：**A00–A02 已完成；Reverse 最终证据提交 `a3f28d77e71c5e7a62cab0de81f0cf668a5b745b` 已关闭 G01–G10，`auto_live_gate = closed`、`blocking_findings = []`。A03–A10 前置硬门已解除。**
- 计划验收记录：`tmp/simulator-auto-live-acceptance.md`。
- 计划证据包：`tmp/simulator-reverse-evidence/auto-live/`。

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

### 1.3 执行进度

| 任务 | 状态 | 完成标准 |
| --- | --- | --- |
| A00 建立阶段任务书 | 已完成 | 范围、证据候选、硬门、实现批次和验收矩阵写入本文档 |
| A01 晋升 Auto Live 静态证据 | 已完成 | Reverse `a3f28d77` 提交 43 个最终 contract/切片文件；GarupaEditor 冻结 E01–E30 与 R01–R08/R05.D01–D35 |
| A02 生成固定事件 oracle 并关闭缺口 | 已完成，硬门关闭 | G01–G10 closed；固定轨迹两次生成一致；5 槽、Flick 参数、Long/Slide 粒度与失败矩阵闭合 |
| A03 接入 Auto Live 模式与判定上下文 | 已完成 | 显式 `manual`/`auto-live` 判别联合、最小 `InGameCalculatedData` 与 identity result-transform 门已接入 |
| A04 建立 Long/Slide 运行子图 | 已完成 | Long terminal 与 Slide source-order after runtime 由父 root 独占；缺图/重复身份在激活前失败关闭 |
| A05 恢复 Single/Flick Force Perfect | 可开始 | Normal/Flick/Directional 在 adjusted crossing 同次 Update 产生一次确认的 Perfect 路由 |
| A06 恢复 Long 分阶段完成 | 等待 A05 | 头、尾严格比较、状态转换、父/尾事件和失活顺序匹配 oracle |
| A07 恢复 Slide 分阶段完成 | 等待 A06 | 头、中间、终端、Stop 路径及每次调用粒度匹配 oracle |
| A08 恢复 Auto Live OneFrame 填充与聚合 | 等待 A07 | 原作 5 槽池、Setup 占用、池序收集、同帧聚合、清除和失败关闭匹配证据 |
| A09 接入调度、暂停与生命周期 | 等待 A08 | 反向根 Update、子节点顺序、外层帧 Reflect、暂停冻结和池复用无回归 |
| A10 生产 oracle 与阶段验收 | 等待 A09 | 固定轨迹、生产 BMS、失败关闭、全部隔离回归和验收文档通过 |

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

**证据**：E01–E06、R01–R05、U03。

**验收**：manual 与 auto-live 使用同一 chart/clock，只有 auto-live 在 crossing 进入 Force Perfect；未触发真实输入。

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
5. invisible 节点是否自动跳过、何时推进 current 严格按 R02。
6. Stop state 扫描首个 pending visible 节点，到点后调用 `forcePerfectStopState`。
7. `ExecuteAfterUpdate` 只转发 R02 指定的 current/selected after。
8. 不实现手动释放、普通 Miss、move-time refresh 或视觉移动。

**证据**：E14–E20、E21–E24、R02/R03。

**验收**：head→intermediate(s)→tail 顺序、相邻节点大步、invisible、Stop、一次调用粒度和最终失活匹配。

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
4. 覆盖全部失败关闭 case。
5. 运行第一切片、谱面构造、时钟调度回归。
6. 建立验收记录，持续披露未恢复分数/输入/表现边界。

**停止条件**：任何 oracle 需要测试侧修正生产输入、排序事件或忽略未知字段，阶段不得关闭。

## 9. 测试矩阵

| ID | 场景 | 必须断言 | 证据 |
| --- | --- | --- | --- |
| AL01 | Manual vs Auto Live | 同 chart/clock 只有 Auto 在 crossing Force Perfect | E01–E06、R02/R03 |
| AL02 | B=-5/0/+5 | adjusted crossing 复用 tempo-aware 1/60 路径 | E02–E05、E30、U03 |
| AL03 | Normal before/equal/after | `<` 不判，`>=` 同次 MoveState Perfect，后续不重复 | E01–E03、R02 |
| AL04 | 同位置 Normal | 反向根 Update 决定 Setup 请求顺序，池序 Reflect | U03、E24/E26、R03 |
| AL05 | Flick | base Perfect 在先，专用回调在后，OneFrame 事件数精确 | E06、R02/R03 |
| AL06 | Directional Flick | 合成 X、方向和回调参数精确；无真实触摸 | R02/R03 |
| AL07 | Long head | `>= root`、Move→Wait、front Perfect | E12/E13、R03 |
| AL08 | Long tail | `> tail`、linked after→root、最终状态/回收 | E09–E11、R02/R03 |
| AL09 | Slide head | `>= root`、Wait、front Perfect | E16/E17、R03 |
| AL10 | Slide intermediate | current 节点、intermediate 路由、cursor +1 | E14/E15、R02/R03 |
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

- [ ] Reverse Auto Live 最终证据提交已锁定，`auto_live_gate = closed` 且 `blocking_findings = []`。
- [ ] E02/E05/E30 的内部哈希修订链已闭合，无 stale source profile。
- [ ] 固定事件轨迹可在 Reverse 离线重复生成，GarupaEditor 不调用 Python。
- [ ] Auto Live 模式显式接入，manual/mode14/debug 路由没有混淆。
- [ ] Normal/Flick/Directional 的 adjusted crossing、事件数和顺序匹配。
- [ ] Long 头/尾比较符号、父子顺序、状态和回收匹配。
- [ ] Slide 头/中间/终端/Stop、current cursor 和单次调用粒度匹配。
- [ ] Long/Slide after 子图保持构造共享身份并由父对象独占更新。
- [ ] OneFrame 固定 5 槽、first-unused、Setup、池序 Reflect、清除与耗尽匹配。
- [ ] unknown 分数/生命/技能/音频/粒子字段没有零值或 no-op 伪实现。
- [ ] 同位置、adaptive 多子步、暂停、空帧和失败关闭全部通过。
- [ ] 普通与 HABAHIRO 生产谱面回归通过，并保留 HABAHIRO 无实体运行样本披露。
- [ ] 第一切片、谱面构造和时钟调度全部隔离回归通过。
- [ ] `engine/` 依赖边界通过。
- [ ] `tmp/simulator-auto-live-acceptance.md` 已建立。
- [ ] 未修改主程序入口、编辑器控制器、窗口协议、渲染或音频实现。
- [ ] 提交已推送，远端与 HEAD 为 `0 0`。

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
