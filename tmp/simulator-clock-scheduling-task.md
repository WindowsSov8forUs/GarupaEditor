# 模拟器时钟与调度阶段实施任务书

## 1. 文档身份

- 目标分支：`codex/refactor-simulator-implementation`
- 上级计划：`tmp/simulator-reconstruction-plan.md`
- 前置阶段任务书：`tmp/simulator-chart-construction-task.md`
- 前置阶段验收：`tmp/simulator-chart-construction-acceptance.md`
- 唯一原作证据仓库：`HOST________\VSCode\GirlsBandParty-Reverse`
- 静态证据基线提交：`74ab76f6838847d98aae1a15741a5f024e3774ff`
- 当前运行证据提交：`2ba3bdbbab9be2de6fedb9b22f623bd80611c023`
- 排除的逆向仓库内容：未跟踪的 `.claude/`、`runtime/tools/` 及任何未进入锁定提交的文件
- 锁定游戏样本：`jp.co.craftegg.band` 10.1.4（version code 230，`arm64-v8a`）；10.1.3/229 仅作独立历史样本和跨版本佐证，不与 10.1.4 trace 合并
- 阶段目标：把已完成的原作形状 `NoteBatchInformationList` 接入模拟器运行时，恢复原作托管层的帧率请求、双音乐时钟、BPM command、判定偏移、自适应子步、两阶段 Note 调度和暂停冻结语义。
- 阶段状态：**S01–S10 已全部完成，时钟与调度阶段关闭，可开启下一阶段 Auto Live**。Reverse 最终运行 oracle 锁定至 `2ba3bdbbab9be2de6fedb9b22f623bd80611c023`；HABAHIRO 实体样本与 30 槽 BPM 池回绕继续作为只读捕捉不可得的非阻断保真度例外。

本阶段继续维持 GarupaEditor 当前 TypeScript 技术栈，不因 Reverse 中的 Python 验证模型改变运行技术栈。Reverse 是唯一行为依据；旧 GarupaEditor 模拟器、通用节奏游戏实现、浏览器计时经验和方便实现的默认值均不得作为原作行为来源。

### 1.1 已锁定决策

- 判定偏移时钟属于本阶段；判定窗口、输入仲裁和 Note 结果不属于本阶段。
- move-time、`InGameSnapshotData`、`ReturnTime`、对象池重建和最多 16 秒无输入回放后置，不进入本阶段。
- 非零 CC03/CC08、初始双时钟、60/120、暂停、偏移和 `101/21/6` 自适应回退的生产/实体证据已经取得；S02 硬门已关闭。
- HABAHIRO 实体样本与 30 槽 BPM 池回绕在只读捕捉前提下不可获得，统一标注为“根据已有证据进行还原，不阻断，无法依赖实体证据，不确保百分百还原”。
- 60/120 FPS 只恢复 `InGameDirector.Awake` 的目标帧率选择和后端请求，不宣称浏览器、Android Surface、合成器或显示器实际达到对应 cadence。
- 生产 Note 进入尚未恢复的具体 Move/Wait/Stop/OnUpdate/AfterUpdate 行为时必须返回 `evidence-required`；不得以 no-op 保持表面可运行。
- `createSimulatorEngine` 接收已经构造完成的谱面结果，不解析 BMS，也不适配编辑器谱面、窗口协议或主程序入口。

### 1.2 执行进度

| 任务 | 状态 | 完成条件 |
| --- | --- | --- |
| S01 冻结时钟与调度静态证据 | 已完成 | E01–E26、上游 F01–F04 依赖、manifest、开放缺口和源/副本/Git 索引三方哈希校验器已落地并通过验证 |
| S02 完成实体设备证据闭环 | 已完成 | 最终 Reverse 提交 `2ba3bdbb` 与 122 文件运行 oracle 已冻结；`101/21/6` 已闭合，两项只读不可得边界保留为非阻断保真度例外 |
| S03 接入谱面构造结果 | 已完成 | 生产运行时直接接收已登记的 `ChartConstructionResult`，并使用构造时冻结的进程累积 BPM count；fixture 身份仅留测试侧 |
| S04 恢复 60/120 FPS 请求边界 | 已完成 | `InGameDirector.Awake` 幂等地向记录型后端请求一次 60/120，不建立 pacing 循环 |
| S05 恢复双音乐时钟 | 已完成 | start/current/next 数值与字符串、0.8 秒 launcher lead、Float32 推进、单次 carry 和 callback 计数已恢复 |
| S06 恢复 BPM command 消费 | 已完成 | CC03/CC08 首条选择、30 槽池、next 预告、正序活跃列表、提交与即时移除已恢复 |
| S07 恢复判定偏移时钟 | 已完成 | `[-5,5]` 整数 offset 按 1/60 秒逐步计算；Fast 重查 tempo，Slow 保留调用点 BPM |
| S08 恢复自适应子步 | 已完成 | 进程累积门、四计数器、严格阈值、修订后的 `counter[1]/[2]/[3]` 回退和双量守恒已恢复 |
| S09 恢复两阶段调度与列表突变 | 已完成 | BPM-before-Note、反向实时 Update、survivor AfterUpdate、单组激活和下一子步 Count 已恢复 |
| S10 建立生产 oracle 与阶段验收 | 已完成 | 普通/HABAHIRO 生产构造、CC03/CC08 实体源投影、60/120、偏移、暂停、自适应、调度、失败关闭和全部隔离回归通过；见验收记录 |

### 1.3 批次记录

#### 2026-07-26 第一批：S01 静态证据冻结

- Reverse `HEAD` 已核对为 `74ab76f6838847d98aae1a15741a5f024e3774ff`，工作树只有明确排除的 `?? runtime/tools/`。
- E01–E26 已按 Reverse 相对目录字节保持复制到 `tmp/simulator-reverse-evidence/clock-scheduling/artifacts/`，共 26 个静态证据文件。
- `manifest.json` 已记录源提交、源路径、冻结路径、字节数、完整 SHA-256、确认状态和消费任务。
- `OPEN_GAPS.md` 已登记 S02 为 `required-before-code`，并逐项列明非零 BPM、初始主/launcher 时钟、launcher lead-time、BPM 字符串和逐子步生命周期缺口。
- F01–F04 沿用谱面构造阶段既有冻结副本，只在 manifest 中登记为上游依赖并校验字节数与哈希；本批未重复复制或下载。
- `verify.mjs` 已覆盖 Reverse 基线与排除状态、26 个源文件/冻结副本、4 个上游依赖、S02 硬门和 S03–S10 阻断，并完成 Git 索引三方校验。
- 工作树验证已通过：`node tmp/simulator-reverse-evidence/clock-scheduling/verify.mjs` 输出 `entries=26, upstream=4, runtimeGate=required-before-code, index=skipped`；暂存后 `node tmp/simulator-reverse-evidence/clock-scheduling/verify.mjs --index` 输出 `index=checked`；`git diff --check` 与 `git diff --cached --check` 均通过。
- 本批只落地证据与文档，未修改 `src/simulator` 或 `package.json`，未运行 TypeScript、模拟器测试、Vite/Tauri 或 GarupaEditor 整体构建。
- 下一批只能进入 S02，在 Reverse 仓库完成实体设备证据闭环；S02 完成前 S03–S10 保持阻断。

#### 2026-07-27 第二批：S02 已提交运行证据同步

- Reverse 当前证据提交锁定为 `e96733cd96a5e7446d2b9adbc413bf77de0bcf98`；工作树只有明确排除的 `?? .claude/` 与 `?? runtime/tools/`。
- Reverse 自带 `verify_runtime_oracle.py` 已通过，输出明确为 `S02 remains blocked`；本批按该结论冻结，不将部分闭合误写成阶段完成。
- R01 按 `SHA256SUMS` 冻结 `clock-scheduling-runtime-oracle` 全部 109 个已提交文件，共 44,655,679 bytes，包含原始/规范化 trace、源 BMS、环境、样本 manifest、摘要、closure 和离线校验器。
- R02–R06 冻结 10.1.4/230 的重定位 README、提取器、targets、校验器和地址映射；R07–R10 单独冻结运行证据修订后的自适应子步、BPM 累积和 prototype 结论；R11 冻结最新交接边界文档，未覆盖第一批 E01–E26 历史副本。
- 已确认原任务书两处静态摘要需要修订：自适应回退比较 `counter[1]/[2]/[3]` 而非 `counter[0]/[1]/[2]`；`NoteManager +0x74` 是进程持久累积值，不是当前 chart 的有效 BPM command count。
- `OPEN_GAPS.md` 已按 R01 `closure.json` 重写；当前三个阻断族为 HABAHIRO 实体样本、`counter[1] > 100`/`counter[2] > 20` 动态边界和 30 槽 BPM 池游标回绕复用。
- 本地证据校验已通过：普通模式输出 `static=26, runtime=109, revisions=10, upstream=4, runtimeGate=blocked-by-runtime-closure, index=skipped`；暂存后索引模式输出相同计数且 `index=checked`。
- 本批只同步证据、校验器和任务书，不修改 `src/simulator`，不运行 TypeScript、模拟器测试、Vite/Tauri 或整体构建。

#### 2026-07-27 第三批：调整只读证据边界分类

- `habahiro_zero_bpm_60` 与 `bpm_pool_cursor_wrap_reuse` 改列“只读捕捉前提下无法明确项”，不再阻断 S02；实现时只允许根据已有冻结证据还原，并明确不确保百分百还原。
- 两项仍保留在 Reverse 原始 `closure.json` 中，不修改冻结文件、不伪造实体闭合，也不用合成谱面替代生产运行证据。
- runs 061–067 重新核对后确认：重探针把帧立即扰动到 bucket 2/3，轻探针稳定在 bucket 0；仅出现最多两个孤立 bucket-2 frame，且没有 bucket-1 frame。
- `counter[1] = 101` 与 `counter[2] = 21` 无法动态触发的原因是必要只读观测本身改变时序，而减轻观测后目标 bucket 又不具运行时可达性；阈值、比较与计数器映射本身已有静态证据确认。
- manifest 与校验器改为只让 `fallback_101_21_6_counter1_counter2_boundaries` 阻断 S03–S10，并强制登记两项非阻断保真度例外。
- 工作树证据校验已通过，输出 `static=26, runtime=109, revisions=10, upstream=4, runtimeGate=blocked-by-adaptive-fallback-runtime-evidence, index=skipped`；暂存后索引校验输出相同计数且 `index=checked`，`git diff --cached --check` 通过。本批不修改 `src/simulator`，不运行 TypeScript、模拟器测试、Vite/Tauri 或整体构建。

#### 2026-07-27 第四批：S02 最终证据关闭

- Reverse 最终锁定提交更新为 `2ba3bdbbab9be2de6fedb9b22f623bd80611c023`；runs 081/083 闭合 `counter[2]` 20→21，runs 086/087 闭合 `counter[1]` 100→101。
- R01 更新为 122 个运行 oracle 文件、44,838,972 bytes；`SHA256SUMS` 含 121 行，哈希为 `B6A69C72FC45D594A65CAD886DBAAB4E884E60EC3539732DEEC01A673EA14F2F`。
- 最终 closure 为 `s02_gate = closed`、`blocking_findings = []`；HABAHIRO 与 BPM pool cursor-wrap 仍是显式非阻断保真度例外。
- manifest、`OPEN_GAPS.md`、校验器和最终 handoff 已同步；S03–S10 前置硬门解除。

#### 2026-07-27 第五批：S03–S09 时钟调度运行链

- 宿主输入已改为 `ChartConstructionResult + runtime settings + OneFrameData`；克隆、调用者合成或 `isCommand` 构造结果因缺少原作进程历史身份而失败关闭。
- 谱面构造阶段在不污染公开结果类型的前提下登记构造身份、当前 chart BPM command 数和进程累积 count；零变化谱面在热进程中按原作证据进入 adaptive 门。
- `InGameDirector.Awake` 新增 60/120 后端请求；初始化幂等、dispose 不发反向请求，且没有浏览器/Surface pacing 实现。
- 双时钟从 start BPM 数值/字符串初始化，launcher lead 按 0.8 秒的 Float32 位置恢复；每子步使用 current/next BPM、192 刻度、单次 carry 和位置 callback。
- `NoteBpmChange`、30 槽池和专用活跃列表已落地；每批只选择源序首个 CC03/CC08，提交顺序为 current/string 写入、inactive、callback 即时移除。
- 判定 offset 仅接受生产 UI 已闭合的 `[-5,5]` 整数；Fast 每步按位置查 tempo，Slow 跨 bar 借位时固定使用调用点已提交 BPM。
- 自适应门改用进程累积 count，并修正为 `counter[1] > 100`、`counter[2] > 20`、`counter[3] > 5`；`counter[0]` 只记录。
- 两阶段调度保持时钟→BPM 正序→Note 实时反序→survivor AfterUpdate→一个批次；生产 Note 具体行为继续 `evidence-required`。
- 隔离类型检查、第一切片回归和新时钟调度验收入口已通过；S10 将运行全部规定回归并形成独立验收记录。

#### 2026-07-27 第六批：S10 阶段验收

- 新增 `simulator:test:clock-scheduling` 独立入口，直接消费 F01/F03 生产 BMS 与最终 R01 中 CC03/CC08 原作实际消费源，并验证初始化、Float32 单步、BPM 生命周期、offset、帧率请求、进程累积门和失败关闭。
- 普通零变化谱面以 220/`"220"` 初始化，HABAHIRO 静态生产谱面以 180/`"180"` 初始化；两者无 change command，冷进程单步门和计数器冻结通过。
- CC03 85→140 与 CC08 99.5→95.5 的命令位置、原字符串、launcher 预告、池游标、驻留、提交、inactive 和同步移除通过。
- 实体 trace 中 frame 2267 的 Float32 子步从 109.47891998291016 精确推进到 110.79721069335938；Fast +5 跨 CC08 后切换 tempo，Slow -5 借位时保持 95.5。
- 全部规定隔离验证通过：模拟器 TypeScript、第一切片 17 项、谱面构造全部系列、生产谱面验收和时钟调度 15 组。
- 证据工作树与 Git index 校验在 S02 最终批已通过；本批未运行 Vite/Tauri 或 GarupaEditor 整体构建。
- 验收记录：`tmp/simulator-clock-scheduling-acceptance.md`。下一阶段只允许按整体计划进入 Auto Live，不得提前接入主程序、输入、渲染或音频。

## 2. 固定范围

### 2.1 纳入范围

- `ChartConstructionResult` 到原作运行对象、Note 批次和 BPM command 的所有权转换。
- `InGameDirector.Awake` 对 High Frequency 设置的 60/120 目标帧率选择。
- `InGameDirector.Update -> InGameManager.ExecUpdate -> NoteManager.ExecUpdate` 的已确认托管层入口链。
- `InGameMusicScoreController` 的主时钟、launcher 时钟、`CurrentBPM`、`NextBPM`、原始 BPM 字符串、`ExecuteFrame` 和音乐位置回调。
- `NoteBpmChange` 的 Setup、活跃列表、逐子步更新、到点切换和回调移除。
- `GetAdjustMusicPos`、`FastAbsolutePos`、`SlowAbsolutePos` 的跨 BPM 判定偏移算法。
- BPM-change-count 门、四个持久 `uint` 计数器、1–4 子步和历史回退。
- BPM command 正序 Update、主活跃 Note 反序 Update、存活对象 AfterUpdate 和单批次激活顺序。
- GameState/PauseState 对 Note 调度的已确认冻结和恢复边界。
- 记录型帧率后端、时钟快照和测试侧调度轨迹。
- 普通/HABAHIRO 零 BPM-change 样本以及 S02 取得的非零 BPM 生产或实体设备 oracle。

### 2.2 排除范围

- BMS 文本解析、Bezier/HABAHIRO 构造和终结过滤；这些由已验收谱面构造阶段提供。
- `App.tsx`、编辑器谱面适配、窗口路由、启动载荷、Tauri 通信和模拟器主程序入口。
- 浏览器 `requestAnimationFrame` 循环、Android Surface 实现和物理显示模式选择。
- Auto Live、Force Perfect、真实输入、判定窗口、分数、Combo、生命、Skill/Fever 消费和 lane-change 动画。
- 具体 Note 家族的 Move/Wait/Stop、OnUpdate、AfterUpdate、超时、Flick、Long 和 Slide 完成行为。
- move-time、快照字典、`ReturnTime`、对象池重建、`RefreshAfterMoveTime` 和确定性回放。
- 同步线对象、断线/重连、`noteSyncEdgeMargin`、渲染、音频和资源加载。
- Unity 中无引擎对象依赖的其他 `MonoBehaviour.Update` 相对顺序、渲染线程和设备呈现时序。
- Python 运行依赖、测试期间实时网络访问和 Reverse 未跟踪的 `runtime/tools/`。

## 3. 强制执行规则

1. 每个字段、阈值、顺序、列表操作和状态转移必须指向第 5 节证据 ID；不得用第一切片现状反推原作。
2. 静态证据基线固定为 `74ab76f6838847d98aae1a15741a5f024e3774ff`；最终运行证据提交为 `2ba3bdbbab9be2de6fedb9b22f623bd80611c023`，其 `closure.json` 明确 `s02_gate = closed`；禁止直接引用 Reverse 未提交工作树。
3. S02 已完成，S03–S10 可按本任务书顺序实施；任何新增或冲突证据仍须先提交 Reverse，再冻结到 GarupaEditor 临时证据包。
4. `.claude/` 与 `runtime/tools/` 始终排除；即使其中存在说明或可运行脚本，也不能成为证据或 GarupaEditor 依赖。
5. 生产类型不得加入 fixture ID、证据 ID、调度测试回调或合成 `sourceOrder`。测试身份必须存在于旁路适配器。
6. `createSimulatorEngine` 是 GarupaEditor 可移植宿主边界，不冒充原作公开 API；原作管理器内部不依赖 React、Pixi、Tauri、DOM 或编辑器谱面类型。
7. 运行时不得读取 `tmp/simulator-reverse-evidence/`；证据包只服务实现审计和测试。
8. Python harness 只能作为离线 oracle；TypeScript 生产实现、package scripts 和隔离测试不得调用 Python。
9. 未确认输入、非法数值、缺失实体证据和越界行为统一返回 `evidence-required`，不得自动纠错或选择约定默认值。
10. 每一批完成后必须同步本任务书的执行进度、批次记录、证据缺口和验证结果，使用中文语义提交并推送当前远端分支。
11. 日常只运行当前批次规定的模拟器隔离验证；S10 前不运行 Vite/Tauri 或 GarupaEditor 整体构建。
12. 如果新 Reverse 证据与本文静态摘要冲突，以新提交中的原始证据为准，先修订任务书，再实现代码。

## 4. 证据包规划

### 4.1 目录结构

```text
tmp/simulator-reverse-evidence/clock-scheduling/
├── manifest.json
├── OPEN_GAPS.md
├── verify.mjs
├── artifacts/
│   └── investigations/
│       ├── note-scheduling-clock/
│       ├── music-bar-division-adaptive-substeps/
│       ├── bpm-change-consumer/
│       ├── simultaneous-note-ordering/
│       ├── runtime-integration-prototype/
│       ├── ingame-playerloop-pause-gates/
│       ├── frame-rate-control-flow/
│       ├── deterministic-engine-harness/
│       ├── package-version-rebaseline-10-1-4/
│       └── clock-scheduling-runtime-oracle/
├── revisions/
│   └── e96733cd96a5e7446d2b9adbc413bf77de0bcf98/
└── fixtures/
    ├── upstream-chart-construction.json
    ├── bpm-change-source.bms
    ├── bpm-change-chart.json
    └── bpm-change-runtime-trace.json
```

`manifest.json` 每项必须记录：证据 ID、来源类型、Reverse 源提交、Reverse 相对路径或设备采集来源、冻结相对路径、字节数、完整 SHA-256、确认状态、消费任务和备注。

`verify.mjs` 必须验证：

- Reverse 静态基线和当前/最终证据提交；
- Reverse 工作树除 `.claude/` 与 `runtime/tools/` 外无未登记文件；
- E01–E26 的源文件与冻结副本字节数、SHA-256；
- R01 `SHA256SUMS` 下全部 122 个运行证据文件、R02–R06 重定位证据、R07–R10 修订证据和 R11 最终交接文档的源提交/冻结副本/Git 索引一致性；
- 谱面构造证据包 F01–F04 的既有冻结哈希；
- 暂存后 Git 索引中的全部证据字节。

### 4.2 上游谱面样本依赖

本阶段复用 `tmp/simulator-reverse-evidence/chart-construction/fixtures/`，不得重新下载：

| ID | 既有冻结文件 | SHA-256 | 用途 |
| --- | --- | --- | --- |
| F01 | `poppin_shuffle_special.txt` | `418DB7F5BFC6B5431AC0ABF2FB905120BDFA8C778C35AA42418A6FA43F4094DC` | 普通谱面零 BPM-change 回归 |
| F02 | `poppin_shuffle_special.json` | `FA636238280D384C3BAE42335B54522B02CDBE608C890516F2F38FB728DEA2FC` | 普通谱面独立 authoring oracle |
| F03 | `786_miracle_april_habahiro_special.txt` | `43148090C40ABBD951E8D7112200BDAE9B796A8A531A0793169E0AD70C3DC159` | HABAHIRO 零 BPM-change 回归 |
| F04 | `786_miracle_april_habahiro_special.json` | `F30C0BC1AE5766D11394FBA02C8F14E463787B31A79E38E6C79F6E02B3493773` | HABAHIRO 独立 authoring oracle |

## 5. 静态冻结证据

所有路径均相对于 Reverse 仓库。哈希必须按大写完整写入 manifest，不得使用省略形式。

| ID | Reverse 相对路径 | SHA-256 | 主要消费任务 |
| --- | --- | --- | --- |
| E01 | `artifacts/investigations/note-scheduling-clock/README.md` | `CB13700C9A3B8CA4DC66DE2AFCD923A7917868260385E731F5BE5262FF7CA946` | S05、S07、S09 |
| E02 | `artifacts/investigations/note-scheduling-clock/targets.tsv` | `F019C5B9B6499CFB246AE013C42987ABE12BF0CCD8057A3D4845AADDFDEFFDF4` | S01、S05、S07、S09 |
| E03 | `artifacts/investigations/note-scheduling-clock/pipeline.pseudocode.cs` | `814B2FB856B11BE11012E56321F1B140BF84B98A257672619D51F812F0543E75` | S05、S07、S09 |
| E04 | `artifacts/investigations/music-bar-division-adaptive-substeps/README.md` | `6720E2EDBD1470004B6437FF245402B30097DD93DCECC248E0DA7C0ABCEFE92B` | S05、S08、S09 |
| E05 | `artifacts/investigations/music-bar-division-adaptive-substeps/closure.json` | `09A4B3639384887135D60CC296E2D590D550F12D647941C1C508B62610586C0E` | S05、S08、S09 |
| E06 | `artifacts/investigations/music-bar-division-adaptive-substeps/targets.tsv` | `F0972AD43B68999901B2406B368C070FD25FD6CF1F288745A6B0589EDCE181BF` | S01、S05、S08 |
| E07 | `artifacts/investigations/bpm-change-consumer/README.md` | `42C57683697FC8BD26CFE138E5CF78D6301DF2BEB52E294873BCEA6B8875FFB5` | S02、S03、S05、S06 |
| E08 | `artifacts/investigations/bpm-change-consumer/bpm_state_transition.json` | `036DE13292B7D2E98852451564E3FB02DD7A7B5C83E349DAEBC4682F8DDB2376` | S02、S05、S06、S10 |
| E09 | `artifacts/investigations/bpm-change-consumer/targets.tsv` | `CF77D4EE5A840E55322A2D539EED0EEC53A916244330AB67EB7259FFE9FE2684` | S01、S02、S06 |
| E10 | `artifacts/investigations/bpm-change-consumer/arm64/bpm_change.s` | `D27DAF82A10175D9626784D005C1A75BFF68AE6A776CB10438C6EF4DFC7B2E76` | S02、S05、S06 |
| E11 | `artifacts/investigations/simultaneous-note-ordering/README.md` | `A15D27EDD7FB1368760E196789A35D5486F804C856F42BAE40FDB5FB5FAD3E95` | S03、S09、S10 |
| E12 | `artifacts/investigations/simultaneous-note-ordering/pipeline.pseudocode.cs` | `C4DB58BD214CEA508310C574301A0276C592580E9A87C22BEA8B10657A73FB1C` | S09 |
| E13 | `artifacts/investigations/runtime-integration-prototype/note_manager_two_phase_substep_order.json` | `774C1C39644EE937E47FE64171E5715AF915A194E9EB8A59FDA44F1F664CB177` | S06、S09 |
| E14 | `artifacts/investigations/runtime-integration-prototype/note_manager_adaptive_substeps.json` | `260ACB365EEAD55A0C1F8D9219F762CA9AC4CF656E597C892B459886388B4D05` | S08、S09 |
| E15 | `artifacts/investigations/runtime-integration-prototype/note_manager_active_list_mutation.json` | `E1B8E48695F0BD7EFC0C3750BC7ADAF113533326DC98A8FB685FC70B787E7BFD` | S09 |
| E16 | `artifacts/investigations/runtime-integration-prototype/multiple_flick_active_list_order.json` | `EC64154569BA4B30D644D27E839BEABA5357A6554FAAEA95080295B118ABB391` | S09 |
| E17 | `artifacts/investigations/runtime-integration-prototype/slide_tail_execute_frame.json` | `4109E09E6D0D7CE3F8CD224A0C0C002CE9EEA61B33BA738CC3D24FC8FCF4CB99` | S08、S09 |
| E18 | `artifacts/investigations/ingame-playerloop-pause-gates/closure.json` | `6F0EFD625BB32C954CBAF6873CA118A8F2415CA43ECB739FC0F43604A4D9BC01` | S04、S09、S10 |
| E19 | `artifacts/investigations/frame-rate-control-flow/README.md` | `B94C93A5E908D26BCF0D56B4EA4333F9D86FB976C0694C5DFB265BC6D7580477` | S04、S10 |
| E20 | `artifacts/investigations/frame-rate-control-flow/frame_rate_control.json` | `185798DCFDED803FEBC72268CFBFDF08EBF2BC130BE9945E94BA569D96E41FA3` | S04、S10 |
| E21 | `artifacts/investigations/frame-rate-control-flow/targets.tsv` | `46E47D23FB1AF51002329019A22804151928A8F5CF502998F231A25AEC8279FA` | S01、S04 |
| E22 | `artifacts/investigations/deterministic-engine-harness/README.md` | `1F93E9190ED6C70B086DE6BBAE4AD5C27454628C88C38909CD3D340D576298CF` | S07、S08、S09、S10 |
| E23 | `artifacts/investigations/deterministic-engine-harness/validation_results.json` | `A1A8938C93D010592F5964C064C9AF4FB32573CD0700E65C5DA92275C4E7E161` | S07、S08、S09、S10 |
| E24 | `artifacts/investigations/deterministic-engine-harness/targets.tsv` | `CA586BB9CD5F34FEBF8E04C4D2DD86F4D7D6FF80FD73EFA7622E0F0531E6C833` | S01、S10 |
| E25 | `artifacts/investigations/runtime-integration-prototype/production_bms_validation.json` | `081956FDB61263D84F6FDBC1DCDC5A93365B50F0032BE282EF8D42DD046BFF0A` | S03、S05、S10 |
| E26 | `artifacts/investigations/runtime-integration-prototype/production_habahiro_bms_validation.json` | `ECBAF86B547FED5426CD0A59F1D8401AB8A1E1714B78BF8EED974A923BCEE951` | S03、S05、S10 |

### 5.1 静态证据已确认事实

- `MUSIC_BAR_DIVISION_COUNT = 192`；`GetBarSeconds = 240 / BPM`。
- 主/launcher 绝对位置均为 `beatProgress + 192 * barProgress`，每次推进只执行一次跨小节 carry。
- 非负 delta 的 `ExecuteFrame = min(deltaTime * 60, 1)`。
- 自适应子步门读取 `NoteManager +0x74`；R09 已证明该值随同一进程的谱面解析累积，不能再描述为“当前谱面的有效 BPM change count”。
- 子步阈值严格为 `<0.0179999992`、`<0.0329999998`、`<0.0500000007` 和其余值。
- E04/E05 的旧计数器标签已由 R07/R08/R10 修订：当前 bucket 先递增，再检查 `counter[1] > 100`、`counter[2] > 20`、`counter[3] >= 6`；`counter[0]` 只记录、不直接触发回退。
- 每子步顺序为：音乐时钟、BPM 活跃列表正序、主 Note 活跃列表反序、存活对象 AfterUpdate、一个待激活组。
- 同组成员按 `informationList` 源序激活并追加；本子步不更新，新成员下一子步按反向活跃顺序首次更新。
- `NoteBpmChange` 由 `ccNum` 3/8 识别；同批只选择源序第一个。
- BPM command 的位置阈值为相同 bar 内的有符号整数 `192 * numerator / denominator`。
- command 完成顺序为 `UpdateBPM(value, string)`、`isActive = false`、回调从专用列表移除。
- High Frequency false/true 分别请求 60/120；物理 Surface cadence 未由静态证据保证。
- 判定偏移逐个 frame 使用 1/60 秒，不是固定位置偏移；R01 已确认 Fast 正向跨界会按 cursor 位置切换 tempo，而 Slow 负向跨回前一 bar 时仍保持调用点已提交 BPM，二者不得再写成同一条“每步重查 tempo”规则。

### 5.2 已冻结运行证据与修订

| ID | 内容 | 完整性锚点 | 状态 | 主要消费任务 |
| --- | --- | --- | --- | --- |
| R01 | `clock-scheduling-runtime-oracle/` 全部 122 个已提交文件 | `SHA256SUMS` SHA-256 `B6A69C72FC45D594A65CAD886DBAAB4E884E60EC3539732DEEC01A673EA14F2F` | 已校验、S02 closure 已关闭 | S02–S10 |
| R02 | 10.1.4 重定位 README | `5E37640F8F9F0B24E10B016606FE46E9361F4005606BE82EBC00FF44761E09B5` | 已确认 | S02、S04–S07、S09、S10 |
| R03 | 10.1.4 重定位提取器 | `3DD7854E3120EA87967C7E86774465CC89FAA0F9ACED02BCF5CAE55CBC38376E` | 已确认工具 | S02 |
| R04 | 10.1.4 targets | `2295CCD41B1660EB666613A8A36D354D7B763C9E2DFF83DE2C1B433011819019` | 已确认 | S02、S04–S07、S09 |
| R05 | 10.1.4 重定位校验器 | `516E366BBFABB59A9794A791EDBF53376DB50E23C6BC3BA4559DB1A745F8AFE2` | 已确认工具 | S02 |
| R06 | 10.1.4 地址映射 | `3F001E628649F206BC88231FC4AF5427A9858C566E207D8BD24519F43A6B971C` | 已确认 | S02、S04–S07、S09 |
| R07 | 修订后的自适应子步 README | `1248714B2CBAB4A556F21A1E87FC39984E79C6F79E49CB6B48BF698049FFCC34` | 修订 E04 摘要 | S02、S08、S09 |
| R08 | 修订后的自适应 closure | `6323B886C8621EB94BFE9C47284D487179DD173CD9FA2C51A361B38EB12370F1` | 修订 E05 结论 | S02、S08、S09 |
| R09 | 修订后的 BPM consumer README | `4E0257BF3941387B40769CBC38481F71475A2CFF2D4147B4E9169A8DD4173DE8` | 修订 change-count 语义 | S02、S03、S05、S06、S08 |
| R10 | 修订后的 adaptive prototype oracle | `EC5C0CD7938828D50D5704B0FD0DAA492864F79DAC74F0FE34CDAA0723E39E71` | 修订 E14 映射 | S02、S08、S09 |
| R11 | 最新时钟调度交接边界 | `42AED247AB18D6C0B47F60E601C3696C41D18999E5401C281CF40993B826E5F0` | 当前边界说明 | S02、S03、S08、S10 |

最终 R01 的顶层 `overall_status = confirmed-with-explicit-nonblocking-boundaries`、`s02_gate = closed`、`blocking_findings = []`；两项生产样本不可得边界继续在 manifest、`OPEN_GAPS.md` 与验收记录中显式保留。

## 6. S02 实体设备证据硬门

### 6.1 已提交调查产物

Reverse `2ba3bdbbab9be2de6fedb9b22f623bd80611c023` 已提交并由 R01 完整冻结：

- 10.1.3/229 和锁定的 10.1.4/230 环境、目标、源 BMS、样本 manifest 与完整哈希；
- CC03 85→140、CC08 99.5→95.5 的 60 模式轨迹；
- 同一 CC08 的 120 请求、暂停前/驻留中/恢复后、正负 offset 和反向 active-list 更新轨迹；
- 原始压缩 JSONL、规范化 lifecycle/adaptive/pause trace 和各主题摘要；
- `closure.json`、`SHA256SUMS` 与无需 GarupaEditor/设备/网络的 `verify_runtime_oracle.py`。

### 6.2 已闭合问题

1. 初始主/launcher 时钟、launcher lead `79.5999984741211` 及其生产样本关系。
2. 初始 start/current/next BPM 数值和原字符串，以及 CC03/CC08 到点提交。
3. command Setup、active list 驻留、UpdateBPM、inactive、callback 和列表即时移除主生命周期。
4. 10.1.4 下 `InGameDirector.Awake` 对 60/120 的单次请求。
5. BPM-before-Note、主 active list 反向遍历和暂停期间 NoteManager 完全不进入。
6. 2/3/4 子步和 `counter[3] >= 6` 当帧回退；并修正 bucket-to-counter 静态标签。
7. Fast 正 offset 跨 BPM 的逐步 tempo 切换，以及 Slow 负 offset 跨 bar 时保留调用点 BPM。
8. 进程持久的 `NoteManager +0x74` 累积语义，推翻“当前 chart 有效 change count”旧标签。

### 6.3 只读捕捉不可得的非阻断保真度例外

1. `786 miracle_april SPECIAL` HABAHIRO 零 BPM-change 60 模式实体样本当前不可选；根据已有证据进行还原，不阻断，无法依赖实体证据，不确保百分百还原。
2. 当前 4176 个生产 BMS 中单谱面最多 16 个 BPM command，无法触发 30 槽 BPM pool 第 31 次 acquire、游标回绕和复用；根据已有证据进行还原，不阻断，无法依赖实体证据，不确保百分百还原。

### 6.4 最终关闭的低 bucket 回退边界

- runs 081/083 两次独立确认  20→21 时，候选 3 子步在同帧回退为 1 子步。
- runs 086/087 两次独立确认  100→101 时，候选 2 子步在同帧回退为 1 子步。
- 连同既有 pass-2 runs 的  5→6 回退， 三个动态边界全部闭合。
- 控制条件、metadata 与 guardrail 均进入最终提交；采集没有替换返回值或直接写进程内存。

### 6.5 S02 关闭结论

- Reverse  为 、，离线校验器输出 。
- GarupaEditor 冻结 122 个 runtime-oracle 文件（ 121 行）及最终 handoff；源提交、冻结副本与 Git 索引由  校验。
- 第 6.3 节两项只读不可得边界不参与门控，实施与验收不得宣称百分百还原。
- S03–S10 已解除前置阻断。

## 7. 运行边界与接口决策

### 7.1 `createSimulatorEngine`

S03 后的目标边界：

```ts
interface SimulatorEngineInput {
  readonly chart: ChartConstructionResult;
  readonly runtime: {
    readonly highFrequencyMode: boolean;
    readonly judgeOffsetFrames: number;
  };
  readonly oneFrameData: OneFrameDataPoolProfile;
}
```

- `chart` 必须来自已验收的 `createNoteBatchInformationList` 或等价原作形状构造结果。
- `highFrequencyMode` 是原作 LiveCore 设置输入，只决定 60/120 请求。
- `judgeOffsetFrames` 必须是原作设置允许的有符号整数；允许范围若 S02/静态元数据未闭合，越界输入返回 `evidence-required`，不得自行 clamp。
- 调用者不再提供 `currentBpm`、`nextBpm`、初始位置或 `bpmChangeCount`；这些由 chart 和 S02 已确认初始化规则产生。
- `oneFrameData` 保持第一切片既有边界，本阶段不改变其业务消费。
- `createSimulatorEngine` 不接收 BMS 字符串，不调用谱面构造工厂。

如果 S02 证明初始化依赖额外原作设置字段，必须先更新本接口章节和任务书，再实现；不得把新字段隐藏为默认常量。

### 7.2 帧率后端

在现有后端合同中新增后端中立端口：

```ts
interface FrameRateBackend {
  requestTargetFrameRate(value: 60 | 120): void;
}
```

- 记录型后端保存请求轨迹。
- 生产后端实现不属于本阶段。
- 不建立 `setInterval`、`requestAnimationFrame` 或 Surface API 适配。
- 快照中的该轨迹是测试观察设施，不成为主程序入口协议。

### 7.3 测试侧调度观察

- 记录型 Note、时钟事件和调度 trace 只放在 `src/simulator/testing` 或明确的测试旁路。
- trace 至少区分 frame、substep、music advance、BPM update、Note update、AfterUpdate 和 group activation。
- trace 不进入原作 `NoteInformation`、`NoteBase` 生产字段或未来主程序载荷。

## 8. 分项任务

### S01 冻结时钟与调度静态证据

**目标**

建立本阶段可独立审计的静态证据包，并登记 S02 硬门。

**产物**

- 第 4 节目录结构中的 manifest、开放缺口、校验器和 E01–E26 副本。
- 上游 F01–F04 依赖索引，不重复复制或下载生产样本。

**实施步骤**

1. 确认 Reverse `HEAD` 等于静态基线提交，且仅有排除的 `runtime/tools/`。
2. 按原目录结构复制 E01–E26。
3. 写入字节数、完整 SHA-256、确认状态和消费任务。
4. 建立 S02 placeholder，状态必须为 `required-before-code`。
5. 建立源文件、冻结副本和 Git 索引三方校验。

**原作证据**

- E01–E26；F01–F04 只作为上游冻结依赖。

**确认事实**

- 当前 Reverse 基线已闭合托管层静态算法，但 E07/E08 明确声明缺少非零 BPM 生产 oracle 和 launcher lead-time。

**推定内容**

- 无。

**未解决项**

- S02 的全部设备字段。

**禁止越界项**

- 不创建模拟器代码。
- 不把 Python 或 Reverse 工具复制为 GarupaEditor 运行依赖。

**测试**

- 证据源、冻结副本和 Git 索引哈希校验。
- manifest 完整性和排除路径校验。

**停止条件**

- 任一哈希、源提交或相对路径不一致。
- Reverse 出现除 `runtime/tools/` 外未登记内容。

**完成记录（2026-07-26）**

- E01–E26、F01–F04 依赖、manifest、`OPEN_GAPS.md` 和 `verify.mjs` 已落地。
- 源文件、工作树冻结副本与 Git 索引三方校验通过。
- 未触发停止条件；S02 继续保持 `required-before-code`。

### S02 完成实体设备证据闭环

**目标**

按独立证据需求清单闭合原作时钟与调度运行时语义，并以 Reverse `closure.json` 作为是否解除硬门的权威状态。

**产物**

- 第 6 节 Reverse 调查目录、版本重定位证据及提交。
- GarupaEditor 冻结副本、R 系列证据 ID、当前/最终锁定提交和更新后的任务书。

**实施步骤**

1. 在 Reverse 设计只读 hook 与采集 schema。已完成。
2. 取得原作实际消费的非零 CC03/CC08、零变化、60/120、暂停和 offset 样本。已完成可用部分。
3. 将原始数据、解析结果、版本重定位和校验器提交 Reverse。已完成至最终提交 `2ba3bdbbab9be2de6fedb9b22f623bd80611c023`。
4. 复核静态证据与实体轨迹，修订 change-count、counter mapping 和 Slow offset 结论。已完成当前冲突。
5. 冻结已提交产物并更新本任务书锁定提交、哈希和进度。已完成 R01–R11。
6. 将 HABAHIRO 与 30 槽池回绕登记为第 6.3 节非阻断保真度例外；实现只消费已有证据，不宣称实体闭合。已完成。
7. runs 081/083/086/087 已闭合两个低 bucket 回退边界，S02 硬门关闭。

**原作证据**

- E01–E26、F01–F04、R01–R11，以及后续闭合第 6.3 节的新 R 系列证据。

**确认事实**

- R01 已确认初始化、launcher lead、CC03/CC08 主生命周期、60/120 请求、暂停、反向遍历和正负 offset 的已采分支。
- R07–R10 修订旧静态标签；旧 E 副本保留为历史证据，生产实现必须消费修订结论。

**推定内容**

- hook 字段的人类可读别名必须标记为采集标签，不冒充元数据字段名。

**未解决项**

- 无阻断项；第 6.3 节两项行为只能按已有证据还原，不能宣称百分百复原。
- 第 6.3 节两项行为只能按已有证据还原，不能宣称百分百复原。
- 实际音频 transport 相对 BPM callback 的设备层时序不属于本阶段，除非实体证据同时静态闭合其 owner。

**禁止越界项**

- 不修改 APK 行为，不注入替代 BPM，不使用旧模拟器生成轨迹。
- 不直接从未提交的采集输出实现 GarupaEditor。

**测试**

- Reverse `verify_runtime_oracle.py` 已通过并明确输出 `S02 closed with explicit non-blocking fidelity boundaries`。
- GarupaEditor `verify.mjs` 对源提交、冻结副本、R01 `SHA256SUMS` 和 Git index 的一致性校验。
- 后续新增样本的重复采集事件顺序与 closure 字段完备性。

**停止条件**

- 新证据使最终 closure 再次出现 blocking finding，或源提交、冻结副本与 manifest 不一致。

### S03 接入谱面构造结果

**目标**

消除第一切片生产 fixture 边界，让原作形状谱面成为运行时唯一 Note/BPM 来源。

**产物**

- 第 7.1 节宿主输入。
- Chart 到 NoteManager/clock/BPM command 的 engine-owned 初始化路径。
- 第一切片 fixture 移入测试侧或明确改名为测试载体。

**实施步骤**

1. 由 `ChartConstructionResult.noteBatches` 建立原作池与待激活组，不复制推定顺序字段。
2. 从 `startBpm`/string 初始化确认的 BPM 状态。
3. 通过 `ccNum` 3/8 从批次记录识别 BPM command；另建原作职责的进程持久 builder 累积状态，不再从当前 chart 临时计算 `NoteManager +0x74`。
4. 保留 Long/Slide 共享节点身份和谱面构造阶段的最终存活顺序。
5. 删除生产宿主对 `SimulatorClockProfile`、`SimulatorNoteManagerProfile` 和 `FirstSlice*Fixture` 的依赖。

**原作证据**

- E07–E13、E25、E26、F01–F04、R 系列初始化证据。

**确认事实**

- builder 累积列表只追加 CC03/CC08，不包含起始 BPM；`NoteManager +0x74` 读取的是同一进程累积长度，而非当前 chart 局部 count。
- 同批最终顺序来自已验收 `informationList`，不得重新按 lane 排序。

**推定内容**

- GarupaEditor 的聚合输入结构是可移植宿主边界，不是原作 API。

**未解决项**

- 具体 Note 家族运行行为继续失败关闭。
- 进程生命周期与“新建模拟器 engine”是否等同原作新进程必须在 S02 闭合后按 owner 决定，不能自行在每次 chart 构造时清零累积列表。

**禁止越界项**

- 不在宿主内解析 BMS。
- 不把测试身份写入 `NoteInformation`。

**测试**

- 普通/HABAHIRO 构造结果直接建立运行对象图。
- BPM command 与 playable Note 分离。
- 原对象身份、批次顺序和重复初始化确定性。

**停止条件**

- 必须重新排序或添加无证据字段才能接入。
- S02 初始化规则仍未闭合。

### S04 恢复 60/120 FPS 请求边界

**目标**

恢复原作 gameplay 初始化时的目标帧率选择，不实现平台 pacing。

**产物**

- `InGameDirector.Awake` 对应初始化职责。
- `FrameRateBackend` 记录型实现和快照轨迹。

**实施步骤**

1. false 选择 60，true 选择 120。
2. 初始化阶段只发出一次后端请求。
3. 重复 initialize 不重复请求；dispose 不制造反向帧率请求。
4. `step(deltaTime)` 保持显式外部帧输入。

**原作证据**

- E18–E21。

**确认事实**

- `InGameDirector.Awake` 是设置消费者；设置页 callback 只持久化 boolean。
- Surface 请求只是平台 hint，不能证明物理 cadence。

**推定内容**

- 后端端口名称属于 GarupaEditor 适配层。

**未解决项**

- 浏览器和设备实际刷新模式。

**禁止越界项**

- 不建立定时循环。
- 不把 60/120 当作固定 `deltaTime`。

**测试**

- false/true 请求 60/120。
- 初始化幂等、调用顺序和快照无副作用。

**停止条件**

- 需要修改主程序入口才能验证端口。

### S05 恢复双音乐时钟

**目标**

恢复主/launcher Float32 时钟、BPM 字符串和回调顺序。

**产物**

- 原作职责的 `InGameMusicScoreController` 状态与推进方法。
- 主/launcher 位置和 BPM 状态快照。

**实施步骤**

1. 按 R 系列证据初始化主/launcher bar、beat、current/next BPM 与字符串。
2. 每子步先以 CurrentBPM 推进主时钟，再以 NextBPM 推进 launcher 时钟。
3. 使用 Float32 运算、192 刻度和 `240/BPM`。
4. 达到 192 时只减一次并只加一个 bar。
5. 推进完成后按确认顺序调用音乐位置 callback。

**原作证据**

- E01–E06、E07、E08、R 系列初始化与逐子步轨迹。

**确认事实**

- 两个时钟共用 192，但使用不同 BPM 字段。
- 原方法没有循环处理一次调用跨越多个小节。

**推定内容**

- 快照字段和 trace 名称是测试观察设施。

**未解决项**

- 与真实音频 transport 的设备层同步。

**禁止越界项**

- 不为大 delta 增加多小节循环。
- 不从调用者接收默认初始位置。

**测试**

- 单步、小节边界、一次大跨越、主/launcher 不同 BPM。
- 60/120 delta 序列和实体逐子步轨迹。
- 非法 BPM 与未闭合初始化失败关闭。

**停止条件**

- 实体初始状态或 launcher lead 无法匹配。

### S06 恢复 BPM command 消费

**目标**

按原作对象生命周期恢复 CC03/08 的 launcher 预告和 current BPM 切换。

**产物**

- `NoteBpmChange`、专用对象池/活跃列表、Setup/Reset/ExecUpdate/updateBpm 和 callback。
- current/next BPM 数值、字符串和事件快照。

**实施步骤**

1. 每次待激活批次只扫描一次，并选首个 ccNum 3/8。
2. 按 R 系列证据在 launcher 激活点写入 next BPM/string。
3. 从 BPM pool 取得对象、绑定原始 `NoteInformation`、设置 active 并追加专用列表。
4. 每子步在主 Note Update 前正序执行 BPM command。
5. bar 已超过或同 bar beat 达到整数阈值时更新 current BPM/string。
6. 清 active，再由 callback 从专用列表即时移除。

**原作证据**

- E07–E10、E13、R 系列非零 BPM 轨迹。

**确认事实**

- 起始 BPM 不计 change count。
- command 由 ccNum 判别，不由 `GameNoteType` 或附加类型判别。
- 同批第二条 BPM record 不由此路径激活。

**推定内容**

- BPM pool 容器的人类可读名称若元数据未确认必须单独标记。

**未解决项**

- 真实音频回调相位。

**禁止越界项**

- 不用预排序 TempoMap while-loop 替代对象列表。
- 不把 BPM command 当 playable Note。

**测试**

- CC03、CC08、同批双 command、跨 bar、同 bar 等值边界。
- next/current/string/active/list 顺序与实体 trace 全量匹配。
- pool 复用与即时移除。

**停止条件**

- 只能通过批量应用所有已过期 command 才能匹配测试。
- 事件顺序与 R 系列证据不一致。

### S07 恢复判定偏移时钟

**目标**

提供后续判定阶段使用的严格调整音乐位置，不提前实现判定。

**产物**

- `getAdjustMusicPos`、`fastAbsolutePos`、`slowAbsolutePos` 和测试侧 tempo 查询。

**实施步骤**

1. offset 为零直接返回 MusicPos。
2. 正值从当前 cursor 重复执行 N 次 `+1/60` 秒。
3. 负值重复执行 N 次 `-1/60` 秒，跨 bar 时借位。
4. Fast 正向路径每一步按 cursor 位置取 tempo，跨 CC08 边界后切换至新 BPM。
5. Slow 负向路径按调用点已提交 BPM 逐步回退，即使借位回到命令前一 bar 也不切回旧 BPM。
6. 返回 Float32 语义下的 absolute position。

**原作证据**

- E01–E03、E22–E24、R01 `judge_offset_10_1_4.json` 及对应原始/规范化 trace。

**确认事实**

- 判定 offset 是有符号 frame 数，不是 position-unit 常量。

**推定内容**

- Fast 路径的 tempo 查询索引结构属于可移植实现细节；结果必须与逐帧原作算法一致。

**未解决项**

- 设置允许范围若元数据未闭合则继续失败关闭。

**禁止越界项**

- 不实现判定窗口或 Note 选择。
- 不用一次秒数积分替代逐 frame 运算。
- 不把 Fast 的跨界 tempo 查询规则错误套用到 Slow 负向路径。

**测试**

- 零、正、负、跨 BPM、跨 bar、往返和边界 Float32。

**停止条件**

- Fast/Slow 的方法边界或输入 BPM owner 无法唯一确定。

### S08 恢复自适应子步

**目标**

恢复原作慢帧拆分和持久历史回退。

**产物**

- 生产 `NoteManager` 内部子步选择、四计数器、substep delta 和 substep ExecuteFrame。

**实施步骤**

1. 验证 delta 为有限非负 Float32。
2. 计算外层 `ExecuteFrame = min(delta * 60, 1)`。
3. `NoteManager +0x74` 为零时固定一步且不更新计数器；该字段来自进程持久 builder 累积状态。
4. 非零时按严格阈值选择 bucket 和 1–4 初始步数。
5. 对当前 bucket 执行 `uint` wrap 增量，再按 `counter[1] > 100`、`counter[2] > 20`、`counter[3] >= 6` 检查历史回退。
6. 以最终步数同时平分 delta 和 ExecuteFrame。

**原作证据**

- E04–E06、E14、E17、E22、E23，以及覆盖旧标签的 R01、R07、R08、R09、R10。

**确认事实**

- `counter[3]` 到 6 的对应样本本身已经使用单步。
- `counter[0]` 只记录，不直接触发回退。

**推定内容**

- “性能计数器”是职责名称，不声明为原作字段名。

**未解决项**

- 无；`counter[1]/[2]/[3]` 的 `101/21/6` 动态边界均已闭合。

**禁止越界项**

- 不在 pause 期间更新计数器。
- 不对负 delta 取绝对值或 clamp 为零。

**测试**

- 三个严格阈值两侧、四 bucket、`uint` wrap、change-count 零门。
- `101/21/6`、持久回退和 delta/ExecuteFrame 守恒。

**停止条件**

- 实现需要每帧重置计数器或更改比较顺序。

### S09 恢复两阶段调度与列表突变

**目标**

把双时钟、BPM command 和 Note 两阶段调度恢复为一个确定性子步管线。

**产物**

- `NoteManager.ExecUpdate` 完整托管层顺序。
- 测试侧记录 Note 与逐子步 trace。

**实施步骤**

1. 每个最终子步推进双时钟。
2. 正序遍历 BPM active list。
3. 清空当次 `refExecuteNotes` 计数。
4. 从当前主 active Count-1 建立固定递减索引，在实时列表上反序 Update。
5. Note 自己 Update 后若非 Deactive，立即追加 After 序列。
6. 按追加顺序执行 AfterUpdate；不从当前 active list 重建。
7. 只检查当前 NoteGroupIndex 对应批次；成功激活后只加一，不循环追赶多个批次。
8. 组内按 `informationList` 顺序取得池对象、Activate 并追加 active list。
9. 下一子步重新读取 active Count。

**原作证据**

- E01–E05、E11–E18、R 系列逐子步轨迹。

**确认事实**

- BPM active list 在主 Note active list 前更新。
- 当前自移除对实时列表立即生效；固定索引不因同次回调重新读取 Count。
- 当前调用图没有已确认的跨 Note 低索引删除行为；不得暴露伪造入口。

**推定内容**

- 测试 RecordingNote 只验证调度，不代表任何原作 Note 家族行为。

**未解决项**

- 后续 Note 家族可能引入的真实跨 Note callback 必须随对应证据阶段实现。

**禁止越界项**

- 不把 Deactive Note 保留到 AfterUpdate。
- 不在同子步更新新激活组。
- 不用复制数组消除实时列表突变。
- 不让具体生产 Note 以 no-op 通过尚未恢复阶段。

**测试**

- BPM-before-Note、C/B/A 反序、After survivor 顺序、同组延迟一子步。
- 自移除、下一子步 Count、重复激活去重、pool cursor。
- 一子步只激活一个组，即使 launcher 已越过多个批次。
- 具体 Note 行为失败关闭。

**停止条件**

- 必须改变构造阶段 `informationList` 顺序才能匹配。
- S02 trace 显示不同的 BPM/Note 相位且尚未复核。

### S10 建立生产 oracle 与阶段验收

**目标**

证明本阶段已确认的时钟、BPM 和调度行为在生产谱面与实体非零 BPM 轨迹上严格一致。

**产物**

- `src/simulator/testing` 下独立时钟调度验收入口。
- `tmp/simulator-clock-scheduling-acceptance.md`。
- 更新后的任务书完成记录和开放边界。

**实施步骤**

1. 运行 F01/F03 构造并直接建立 engine runtime。
2. 验证两个零 BPM-change 样本不启用 adaptive 分支且 BPM 状态保持起始值。
3. 对 S02 样本逐 frame/substep 比较主/launcher、current/next、active BPM、组游标和事件顺序。
4. 比较 60/120 请求与各自采集轨迹，不比较未确认的物理显示 cadence。
5. 验证跨 BPM 正负 offset、自适应慢帧、同时组、列表突变和暂停续跑。
6. 验证生产 Note 在未恢复行为边界失败关闭。
7. 运行本阶段全部隔离回归、第一切片和谱面构造回归、证据索引校验与 `git diff --check`。

**原作证据**

- E01–E26、F01–F04、全部 R 系列实体证据。

**确认事实**

- Python harness 是离线 oracle，不是运行依赖。
- F01/F03 各自只有起始 BPM 事件，没有 change command。

**推定内容**

- 验收 trace 和快照属于测试观察设施，不成为主程序协议。

**未解决项**

- move-time、真实 Note 行为、判定、音频和渲染继续属于后续阶段。

**禁止越界项**

- 不实时访问网络或 Reverse 未提交工具。
- 不因测试记录 Note 可运行就宣称生产 Note 行为完成。
- 不运行 GarupaEditor 整体构建。

**测试**

- S03–S09 全部任务列出的测试。
- 暂停期间时钟、BPM active list、组游标、active Note、pool cursor 和四计数器完全冻结。
- 恢复后下一次 substep 从原状态继续，不重建、不回放。
- 相同输入重复运行快照和事件序列完全一致。

**停止条件**

- S02 `closure.json` 仍为 blocked，或任一第 6.3 节阻断项尚未进入最终 Reverse 闭合提交。
- 任一已确认字段或事件序号不匹配。
- 只能依赖 Python、网络、no-op Note 或宽松忽略差异才能通过。

## 9. 提交与推送边界

每一批完成后必须先更新本任务书，再提交并推送：

1. `docs(simulator): 冻结时钟与调度静态证据`
   - S01 manifest、静态证据副本、校验器、上游依赖和开放缺口。
2. Reverse 仓库独立提交：`evidence(runtime): 闭合非零 BPM 与 launcher 时钟轨迹`
   - S02 原始采集、调查结论和校验器；不得与 GarupaEditor 代码混合。
3. `docs(simulator): 同步时钟与调度运行证据`
   - S02 当前已提交运行证据、版本重定位、修订结论、closure 阻断和任务书更新；后续闭合提交继续使用独立证据批次。
4. `refactor(simulator): 接入原作谱面运行数据`
   - S03 构造结果接入和第一切片 fixture 生产边界移除。
5. `feat(simulator): 恢复帧率请求与双音乐时钟`
   - S04–S05。
6. `feat(simulator): 恢复 BPM 切换与判定偏移时钟`
   - S06–S07。
7. `feat(simulator): 恢复自适应两阶段调度`
   - S08–S09。
8. `test(simulator): 验证时钟与调度生产轨迹`
   - S10 隔离测试、生产/实体 oracle 和验收记录。

本任务书本身单独提交为：

```text
docs(simulator): 记录时钟与调度阶段任务与证据
```

每次 GarupaEditor 提交前后执行：

1. 只暂存当前批次目标文件。
2. `git diff --cached --check`。
3. 暂存后的证据包执行 `verify.mjs --index`（任务书初始提交除外）。
4. 检查 staged name-status 和 stat。
5. 中文语义提交。
6. `git push origin codex/refactor-simulator-implementation`。
7. `git rev-list --left-right --count origin/codex/refactor-simulator-implementation...HEAD` 必须为 `0 0`。

## 10. 阶段完成定义

只有同时满足以下条件，时钟与调度阶段才可标记完成：

1. S01–S10 全部产物、证据、测试和停止条件逐项记录为完成。
2. E01–E26、F01–F04 和 R 系列证据的源文件、冻结副本及 Git 索引哈希一致。
3. 任务书记录最终 Reverse 锁定提交，且 Reverse 除明确排除的 `.claude/` 与 `runtime/tools/` 外无未登记依据。
4. 低 bucket 回退动态边界已闭合或另行明确降级；HABAHIRO 与 30 槽 BPM 池回绕持续登记为只读实体证据不可得的非阻断保真度例外，不宣称百分百还原。
5. `createSimulatorEngine` 直接接收 `ChartConstructionResult`，生产路径不依赖第一切片 fixture 或调用者派生时钟值。
6. 60/120 请求、双 Float32 时钟、BPM 字符串、单次 carry 和位置 callback 全部匹配证据。
7. BPM command 只消费同批首个 ccNum 3/8，专用列表和到点移除顺序匹配实体 trace。
8. 正负判定 offset 以 1/60 秒按各自路径计算：Fast 跨界切换 tempo，Slow 负向借位保持调用点 BPM。
9. 进程持久自适应门、四计数器、严格阈值、`counter[1]/[2]/[3]` 回退和 ExecuteFrame 守恒全部通过。
10. BPM-before-Note、反向 Update、After survivor、单组激活、列表突变和下一子步 Count 全部通过。
11. 暂停冻结全部调度状态，恢复原位续跑；不调用 snapshot replay。
12. 具体生产 Note 未恢复行为保持 `evidence-required`，没有 no-op 兼容层。
13. Python、网络、React、Pixi、Tauri 和编辑器谱面类型不进入 engine 运行依赖。
14. 任务书和 `tmp/simulator-clock-scheduling-acceptance.md` 明确保留 move-time、Note 行为、判定、输入、音频、渲染和主程序入口为后续阶段。
15. 完成规定隔离验证并推送远端；不以 GarupaEditor 整体可运行为验收条件。

## 11. 本任务书初始落地验证

本次只创建 `tmp/simulator-clock-scheduling-task.md`：

- 不创建 `tmp/simulator-reverse-evidence/clock-scheduling/`；
- 不复制 E01–E26 或 F01–F04；
- 不进行实体设备采集；
- 不修改 `src/simulator`、`package.json` 或任何模拟器代码；
- 不运行 TypeScript 检查、模拟器测试、Vite/Tauri 或 GarupaEditor 整体构建。

提交前只执行：

1. 检查 S01–S10 均包含目标、产物、实施步骤、原作证据、确认事实、推定内容、未解决项、禁止越界项、测试和停止条件。
2. 检查 E01–E26 的路径与完整 SHA-256 可在静态基线提交定位。
3. 检查 S02 硬门、最终 Reverse 提交更新规则、move-time 后置和生产 Note 失败关闭均明确写入。
4. 运行 `git diff --check`。
5. 暂存后检查 `git diff --cached --check`、staged name-status 和 stat。
6. 使用 `docs(simulator): 记录时钟与调度阶段任务与证据` 提交并推送当前分支。
