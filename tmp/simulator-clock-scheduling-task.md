# 模拟器时钟与调度阶段实施任务书

## 1. 文档身份

- 目标分支：`codex/refactor-simulator-implementation`
- 上级计划：`tmp/simulator-reconstruction-plan.md`
- 前置阶段任务书：`tmp/simulator-chart-construction-task.md`
- 前置阶段验收：`tmp/simulator-chart-construction-acceptance.md`
- 唯一原作证据仓库：`HOST________\VSCode\GirlsBandParty-Reverse`
- 静态证据基线提交：`74ab76f6838847d98aae1a15741a5f024e3774ff`
- 排除的逆向仓库内容：未跟踪的 `runtime/tools/` 及任何未进入锁定提交的文件
- 锁定游戏样本：`jp.co.craftegg.band` 10.1.3（version code 229，`arm64-v8a`）
- 阶段目标：把已完成的原作形状 `NoteBatchInformationList` 接入模拟器运行时，恢复原作托管层的帧率请求、双音乐时钟、BPM command、判定偏移、自适应子步、两阶段 Note 调度和暂停冻结语义。
- 阶段状态：任务书已建立，S01–S10 尚未实施；S02 是 S03–S10 的前置证据硬门。

本阶段继续维持 GarupaEditor 当前 TypeScript 技术栈，不因 Reverse 中的 Python 验证模型改变运行技术栈。Reverse 是唯一行为依据；旧 GarupaEditor 模拟器、通用节奏游戏实现、浏览器计时经验和方便实现的默认值均不得作为原作行为来源。

### 1.1 已锁定决策

- 判定偏移时钟属于本阶段；判定窗口、输入仲裁和 Note 结果不属于本阶段。
- move-time、`InGameSnapshotData`、`ReturnTime`、对象池重建和最多 16 秒无输入回放后置，不进入本阶段。
- 非零 CC03/CC08 生产或实体设备 oracle 是阶段完成硬门；静态反编译和合成测试不能替代该硬门。
- 60/120 FPS 只恢复 `InGameDirector.Awake` 的目标帧率选择和后端请求，不宣称浏览器、Android Surface、合成器或显示器实际达到对应 cadence。
- 生产 Note 进入尚未恢复的具体 Move/Wait/Stop/OnUpdate/AfterUpdate 行为时必须返回 `evidence-required`；不得以 no-op 保持表面可运行。
- `createSimulatorEngine` 接收已经构造完成的谱面结果，不解析 BMS，也不适配编辑器谱面、窗口协议或主程序入口。

### 1.2 执行进度

| 任务 | 状态 | 完成条件 |
| --- | --- | --- |
| S01 冻结时钟与调度静态证据 | 待实施 | E01–E26、上游样本依赖、manifest、开放缺口和三方哈希校验器全部落地 |
| S02 完成实体设备证据闭环 | 证据硬门 | 非零 BPM、初始主/launcher 时钟和 launcher lead 轨迹先进入 Reverse 提交，再更新本任务书最终锁定提交 |
| S03 接入谱面构造结果 | 等待 S02 | 生产运行时不再依赖 `FirstSlice*Fixture` 或调用者提供的时钟/BPM 派生值 |
| S04 恢复 60/120 FPS 请求边界 | 等待 S02 | `InGameDirector.Awake` 只向记录型后端请求确认的 60/120 目标值 |
| S05 恢复双音乐时钟 | 等待 S02 | 主/launcher 初始状态、Float32 推进和回调轨迹匹配实体证据 |
| S06 恢复 BPM command 消费 | 等待 S02 | launcher 预告、专用活跃列表、切换阈值和即时移除顺序匹配非零 BPM oracle |
| S07 恢复判定偏移时钟 | 等待 S02 | 正负 offset 按 1/60 秒跨 BPM 逐步计算，零 offset 返回原位置 |
| S08 恢复自适应子步 | 等待 S02 | `ExecuteFrame`、四计数器、严格阈值和 `101/21/6` 回退完整闭合 |
| S09 恢复两阶段调度与列表突变 | 等待 S02 | 每子步顺序、同时组延迟、反向 Update、AfterUpdate 过滤和实时列表语义完整闭合 |
| S10 建立生产 oracle 与阶段验收 | 等待 S02 | 零变化生产回归、非零 BPM 实体轨迹、60/120、偏移、暂停和失败关闭全部通过 |

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
2. 静态证据基线固定为 `74ab76f6838847d98aae1a15741a5f024e3774ff`。S02 新证据进入 Reverse 后，必须在任务书中另记最终锁定提交；禁止直接引用 Reverse 未提交工作树。
3. S02 未完成前不得实施 S03–S10。允许为采证编写 Reverse 工具，但采集结果必须先提交 Reverse，再冻结到 GarupaEditor 临时证据包。
4. `runtime/tools/` 始终排除；即使其中存在可运行脚本，也不能成为证据或 GarupaEditor 依赖。
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
│       └── clock-scheduling-runtime-oracle/
└── fixtures/
    ├── upstream-chart-construction.json
    ├── bpm-change-source.bms
    ├── bpm-change-chart.json
    └── bpm-change-runtime-trace.json
```

`manifest.json` 每项必须记录：证据 ID、来源类型、Reverse 源提交、Reverse 相对路径或设备采集来源、冻结相对路径、字节数、完整 SHA-256、确认状态、消费任务和备注。

`verify.mjs` 必须验证：

- Reverse 静态基线或最终证据提交；
- Reverse 工作树除 `runtime/tools/` 外无未登记文件；
- E01–E26 的源文件与冻结副本字节数、SHA-256；
- S02 实体证据的 Reverse 已提交副本与冻结副本；
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
- 自适应子步只在有效 BPM change count 至少为一时启用。
- 子步阈值严格为 `<0.0179999992`、`<0.0329999998`、`<0.0500000007` 和其余值。
- 当前 bucket 先递增，再检查 `counter[0] > 100`、`counter[1] > 20`、`counter[2] >= 6`；第四计数器无直接回退比较。
- 每子步顺序为：音乐时钟、BPM 活跃列表正序、主 Note 活跃列表反序、存活对象 AfterUpdate、一个待激活组。
- 同组成员按 `informationList` 源序激活并追加；本子步不更新，新成员下一子步按反向活跃顺序首次更新。
- `NoteBpmChange` 由 `ccNum` 3/8 识别；同批只选择源序第一个。
- BPM command 的位置阈值为相同 bar 内的有符号整数 `192 * numerator / denominator`。
- command 完成顺序为 `UpdateBPM(value, string)`、`isActive = false`、回调从专用列表移除。
- High Frequency false/true 分别请求 60/120；物理 Surface cadence 未由静态证据保证。
- 判定偏移逐个 frame 使用 1/60 秒并在跨 BPM 时重新查询 tempo，不是固定位置偏移。

## 6. S02 实体设备证据硬门

### 6.1 Reverse 新调查产物

S02 必须先在 Reverse 创建并提交 `artifacts/investigations/clock-scheduling-runtime-oracle/`，至少包含：

- `README.md`：采集对象、版本、设备、命令位置、hook 边界、确认/推定/未解决结论。
- `targets.tsv`：每个 hook 的 owner、方法、RVA、字段和用途。
- `runtime_trace.json`：逐帧和逐子步机器可读轨迹。
- `source_bms.txt`：原始非零 CC03/08 BMS 字节，或指向已提交生产 BMS 的哈希登记。
- `independent_chart.json`：若存在独立谱面表示，记录其来源与哈希。
- `verify_runtime_oracle.py` 或等效校验器：只校验已提交静态文件，不要求 GarupaEditor 运行依赖。

### 6.2 必采字段

每个 trace frame 至少记录：

- frame 序号、外层 `deltaTime`、目标 60/120 模式；
- 最终子步数、每子步 delta、每子步 `ExecuteFrame`、四个历史计数器；
- 主 bar/beat/absolute position；
- launcher bar/beat/absolute position；
- `CurrentBPM`、`CurrentBPMString`、`NextBPM`、`NextBPMString`；
- `NoteGroupIndex`、当前批次 absolutePos；
- `activeNoteBpmChangeList` 的对象身份、源记录身份、顺序和 active 状态；
- BPM command 的 bar、numerator、denominator、absolutePos、ccNum、BPM 数值和原字符串；
- command 激活、`NextBPM` 写入、到点 `UpdateBPM`、inactive 和列表移除的事件序号；
- 音乐位置回调相对 BPM Update 和 Note Update 的顺序。

### 6.3 必须闭合的问题

1. 初始主时钟 bar/beat 及其设置 owner。
2. 初始 launcher bar/beat 及其设置 owner。
3. launcher lead-time 的来源、单位、计算和写入时机。
4. 初始 `CurrentBPM`/string 与 `NextBPM`/string 的赋值关系。
5. 首个 BPM command 在 launcher window 内设置 `NextBPM` 的准确 substep。
6. command 对象从 Setup 到 callback 移除之间的专用列表驻留时间。
7. 同批多个 BPM record 时只消费首个的实体确认，若无法构造样本则保留静态确认并明确记录未采分支。
8. 60 与 120 模式下同一 BPM crossing 的事件顺序。

### 6.4 硬停止条件

- 非零 BPM 样本不是原作客户端实际可消费 BMS。
- trace 依赖修改原作调度逻辑才能产生。
- 初始 launcher 状态、lead-time 或首个 BPM 驻留时机无法确认。
- 采集文件未提交 Reverse，或 Reverse 提交仍包含未登记实现依据。
- runtime trace 与 E07–E10 的静态顺序冲突且未完成新的静态复核。

S02 完成后必须更新本节、新增 R01 起的证据 ID、写入最终 Reverse 提交和完整 SHA-256，再允许 S03 开始。

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

### S02 完成实体设备证据闭环

**目标**

用原作实体设备闭合非零 BPM 和 launcher 初始化运行时语义。

**产物**

- 第 6 节 Reverse 调查目录及提交。
- GarupaEditor 冻结副本、R 系列证据 ID、最终锁定提交和更新后的任务书。

**实施步骤**

1. 在 Reverse 设计只读 hook 与采集 schema。
2. 选择或取得原作实际消费的非零 CC03/08 谱面。
3. 分别在 60/120 设置下采集初始化、launcher 激活和 current BPM crossing。
4. 将原始数据、解析结果和校验器提交 Reverse。
5. 复核静态证据与实体轨迹，任何冲突先修订 Reverse 结论。
6. 冻结已提交产物并更新本任务书锁定提交、哈希和进度。

**原作证据**

- E07–E10、E19–E21，以及新 R 系列实体证据。

**确认事实**

- E10 已确认静态写入顺序；实体证据负责确认初始化和驻留时机，不重新定义已闭合指令。

**推定内容**

- hook 字段的人类可读别名必须标记为采集标签，不冒充元数据字段名。

**未解决项**

- 实际音频 transport 相对 BPM callback 的设备层时序不属于本阶段，除非实体证据同时静态闭合其 owner。

**禁止越界项**

- 不修改 APK 行为，不注入替代 BPM，不使用旧模拟器生成轨迹。
- 不直接从未提交的采集输出实现 GarupaEditor。

**测试**

- Reverse 采集校验器。
- 同一输入重复采集的事件顺序一致性。
- 60/120 两模式的字段完备性。

**停止条件**

- 第 6.4 节任一条件成立。

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
3. 通过 `ccNum` 3/8 从批次记录识别有效 BPM command，并计算 count。
4. 保留 Long/Slide 共享节点身份和谱面构造阶段的最终存活顺序。
5. 删除生产宿主对 `SimulatorClockProfile`、`SimulatorNoteManagerProfile` 和 `FirstSlice*Fixture` 的依赖。

**原作证据**

- E07–E13、E25、E26、F01–F04、R 系列初始化证据。

**确认事实**

- BPM change count 只计 CC03/08，不包含起始 BPM。
- 同批最终顺序来自已验收 `informationList`，不得重新按 lane 排序。

**推定内容**

- GarupaEditor 的聚合输入结构是可移植宿主边界，不是原作 API。

**未解决项**

- 具体 Note 家族运行行为继续失败关闭。

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
4. 每一步按当前遍历位置查询 BPM，不能只使用调用时 CurrentBPM。
5. 返回 Float32 语义下的 absolute position。

**原作证据**

- E01–E03、E22–E24，以及 S02 非零 BPM 样本可派生的跨界 oracle。

**确认事实**

- 判定 offset 是有符号 frame 数，不是 position-unit 常量。

**推定内容**

- tempo 查询索引结构属于可移植实现细节；结果必须与逐帧原作算法一致。

**未解决项**

- 设置允许范围若元数据未闭合则继续失败关闭。

**禁止越界项**

- 不实现判定窗口或 Note 选择。
- 不用一次秒数积分替代逐 frame 跨 BPM 查询。

**测试**

- 零、正、负、跨 BPM、跨 bar、往返和边界 Float32。

**停止条件**

- tempo 数据无法唯一确定某一步 BPM。

### S08 恢复自适应子步

**目标**

恢复原作慢帧拆分和持久历史回退。

**产物**

- 生产 `NoteManager` 内部子步选择、四计数器、substep delta 和 substep ExecuteFrame。

**实施步骤**

1. 验证 delta 为有限非负 Float32。
2. 计算外层 `ExecuteFrame = min(delta * 60, 1)`。
3. change count 为零时固定一步且不更新计数器。
4. 非零时按严格阈值选择 bucket 和 1–4 初始步数。
5. 对当前 bucket 执行 `uint` wrap 增量，再检查三个历史回退条件。
6. 以最终步数同时平分 delta 和 ExecuteFrame。

**原作证据**

- E04–E06、E14、E17、E22、E23。

**确认事实**

- 101st、21st、6th 对应样本本身已经使用单步。
- 第四计数器只记录，不直接触发回退。

**推定内容**

- “性能计数器”是职责名称，不声明为原作字段名。

**未解决项**

- 非对称阈值的设计原因无行为影响。

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

- S02 非零 BPM oracle 未进入最终 Reverse 锁定提交。
- 任一已确认字段或事件序号不匹配。
- 只能依赖 Python、网络、no-op Note 或宽松忽略差异才能通过。

## 9. 提交与推送边界

每一批完成后必须先更新本任务书，再提交并推送：

1. `docs(simulator): 冻结时钟与调度静态证据`
   - S01 manifest、静态证据副本、校验器、上游依赖和开放缺口。
2. Reverse 仓库独立提交：`evidence(runtime): 闭合非零 BPM 与 launcher 时钟轨迹`
   - S02 原始采集、调查结论和校验器；不得与 GarupaEditor 代码混合。
3. `docs(simulator): 冻结时钟与调度实体证据`
   - S02 GarupaEditor 冻结副本、最终 Reverse 提交和任务书更新。
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
3. 任务书记录最终 Reverse 锁定提交，且 Reverse 除明确排除的 `runtime/tools/` 外无未登记依据。
4. 非零 BPM 实体/生产 oracle 已确认初始主/launcher 状态、lead-time、next/current 切换和 active BPM 生命周期。
5. `createSimulatorEngine` 直接接收 `ChartConstructionResult`，生产路径不依赖第一切片 fixture 或调用者派生时钟值。
6. 60/120 请求、双 Float32 时钟、BPM 字符串、单次 carry 和位置 callback 全部匹配证据。
7. BPM command 只消费同批首个 ccNum 3/8，专用列表和到点移除顺序匹配实体 trace。
8. 正负判定 offset 以 1/60 秒逐步跨 BPM 计算。
9. 自适应 count 门、四计数器、严格阈值、`101/21/6` 和 ExecuteFrame 守恒全部通过。
10. BPM-before-Note、反向 Update、After survivor、单组激活、列表突变和下一子步 Count 全部通过。
11. 暂停冻结全部调度状态，恢复原位续跑；不调用 snapshot replay。
12. 具体生产 Note 未恢复行为保持 `evidence-required`，没有 no-op 兼容层。
13. Python、网络、React、Pixi、Tauri 和编辑器谱面类型不进入 engine 运行依赖。
14. 任务书和 `tmp/simulator-clock-scheduling-acceptance.md` 明确保留 move-time、Note 行为、判定、输入、音频、渲染和主程序入口为后续阶段。
15. 完成规定隔离验证并推送远端；不以 GarupaEditor 整体可运行为验收条件。

## 11. 本任务书落地验证

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
