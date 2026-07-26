# 模拟器谱面构造阶段实施任务书

## 1. 文档身份

- 目标分支：`codex/refactor-simulator-implementation`
- 上级计划：`tmp/simulator-reconstruction-plan.md`
- 前置任务书：`tmp/simulator-first-slice-task.md`
- 唯一原作证据仓库：`HOST________\VSCode\GirlsBandParty-Reverse`
- 锁定证据提交：`74ab76f6838847d98aae1a15741a5f024e3774ff`
- 排除的逆向仓库内容：未跟踪的 `runtime/tools/` 及任何未进入锁定提交的文件
- 锁定游戏样本：`jp.co.craftegg.band` 10.1.3（version code 229，`arm64-v8a`）
- 阶段目标：从原始 BMS 文本恢复原作 `MusicScoreBezierConverter -> NoteDataBMSBuilder -> NoteBatchInformationListFactory` 构造链，并产出原作形状的 `NoteBatchInformationList`。
- 阶段状态：C01–C06 已完成，C07–C10 尚未实施；本文件是该阶段唯一执行任务书。

本阶段继续维持 GarupaEditor 当前 TypeScript 技术栈方向。Reverse 仓库中的 Python 原型只能作为离线 oracle，不能成为模拟器运行依赖。实施者不得从已删除的 GarupaEditor 模拟器、常见 BMS 实现、通用曲线库、个人经验或方便实现的默认值补齐原作行为。

### 1.1 执行进度

| 任务 | 状态 | 结果 |
| --- | --- | --- |
| C01 冻结谱面构造证据包 | 已完成 | 已冻结 E01–E18、F01–F04、22 项 manifest、开放缺口和三方哈希校验器 |
| C02 建立构造边界与 API | 已完成 | 已建立原作字段类型、四个构造 owner、深度冻结边界与分阶段失败关闭纯函数入口 |
| C03 恢复 Header 与 Bezier 转换 | 已完成 | 普通与 HABAHIRO 生产转换文本均达到 Reverse oracle 字节级哈希一致 |
| C04 恢复 BMS 文本解析 | 已完成 | 已恢复原作材料对象、Header/小节/CC/WAV/BPM 解析、分组顺序与同位置复用 |
| C05 恢复批次与同位置顺序 | 已完成 | 已恢复材料到基础 Note/批次转换、绝对位置二分插入和跨 button 首次出现顺序 |
| C06 恢复 Long、Slide 与派生节点 | 已完成 | 已恢复 Long 配对、Slide A/B 有序对象图、同位置支撑节点和多方向追加族 |
| C07 恢复 HABAHIRO 与多范围合并 | 待实施 | 尚未恢复宽谱合并、双坐标和 lane-change 记录 |
| C08 恢复 BPM、Skill 与 Fever 构造数据 | 待实施 | 尚未恢复命令记录的数据边界和失败关闭条件 |
| C09 恢复终结过滤与同步准备 | 待实施 | 尚未恢复四次过滤和同步所需端点身份 |
| C10 建立生产 oracle、隔离测试与验收 | 待实施 | 尚未建立离线生产验证和阶段验收记录 |

### 1.2 批次记录

#### 2026-07-26 第一批：C01 证据冻结

- Reverse `HEAD` 已确认等于 `74ab76f6838847d98aae1a15741a5f024e3774ff`；工作树只有明确排除的未跟踪 `runtime/tools/`。
- E01–E18 已按 Reverse 原目录结构冻结到 `tmp/simulator-reverse-evidence/chart-construction/artifacts/`。
- F01–F04 已从 E11/E12 登记 URL 下载到 `fixtures/`；四个文件的字节数与 SHA-256 全部匹配本任务书第 4.3 节。
- `manifest.json` 已登记 22 项证据和样本的来源类型、源提交或 URL、冻结路径、字节数、完整 SHA-256、确认状态与消费任务。
- `.gitattributes` 已对本证据包设置 `-text -whitespace`，保留原始 BMS 中受哈希保护的尾随空格、末尾空行和换行字节，同时避免 `git diff --check` 把原作字节报告为待修格式问题。
- `OPEN_GAPS.md` 已登记非零 BPM 生产 oracle、`noteSyncEdgeMargin`、激活后同步线生命周期和命令记录消费者四项开放边界。
- `verify.mjs` 已验证 Reverse 提交与工作树边界、18 份源证据与冻结副本、4 份离线样本以及 Git 索引中的字节数和 SHA-256。
- 本批不创建模拟器代码，不修改第一切片实现，不运行 TypeScript 检查、模拟器测试、Vite/Tauri 构建或 GarupaEditor 整体构建。
- 本批验证命令为 `node tmp/simulator-reverse-evidence/chart-construction/verify.mjs`、暂存后的 `node tmp/simulator-reverse-evidence/chart-construction/verify.mjs --index` 和 `git diff --check`。

#### 2026-07-26 第二批：C02 构造数据与 API 边界

- 第一切片中带 `fixtureId` 和逐字段 `EvidenceBound` 的预构造载体已显式改名为 `FirstSliceNoteInformationFixture`、`FirstSliceNoteBatchFixture` 和 `FirstSliceNoteBatchListFixture`，不再占用原作数据名称。
- `src/simulator/engine/chart/types.ts` 已建立 `ButtonType`、`GameNoteType`、`FrontNoteType`、`AfterNoteType`、`GameNoteAdditionalType`、`VirtualLaneDirection` 的 IL2CPP 确认值。
- 同一类型边界已建立原作形状的只读 `NoteInformation`、`NoteBatchInformation`、`NoteBatchInformationList` 以及 GarupaEditor 聚合结果 `ChartConstructionResult`；原作记录不含 `fixtureId`、`sourceOrder` 或同步投影字段。
- `MusicScoreHeaderParser`、`MusicScoreBezierConverter`、`NoteDataBMSBuilder`、`NoteBatchInformationListFactory` 已建立独立 owner；每次公开调用创建新的工厂上下文，不使用可变全局 singleton。
- `createNoteBatchInformationList({ musicScoreData, isCommand? })` 已公开，`isCommand` 省略时为 `false`；当前 C07 尚未恢复，完成 Long/Slide 图后统一在 `chart-construction.multi-range-combine` 返回 `evidence-required`，不伪造 HABAHIRO 合并结果。
- 谱面构造证据 ID 已使用 `chart-construction:E01` 至 `chart-construction:E18` 作用域与第一切片证据区分；这只属于 GarupaEditor 诊断边界，不进入原作记录。
- `freezeChartConstructionResult` 已深度冻结批次、Note、button、声音值、Slide 图和 BPM 列表，并在共享终端节点出现于根 `slideNoteList` 与批次列表时保留同一对象身份。
- 已新增 `npm.cmd run simulator:test:chart-boundary`，4 项测试覆盖枚举值、独立上下文、分阶段失败关闭、深度冻结、共享节点身份和禁止适配器字段。
- 本批通过模拟器隔离 TypeScript 检查、4 项 C02 边界测试、20 项第一切片回归、禁止依赖扫描和证据包索引校验；未运行 Vite/Tauri 或 GarupaEditor 整体构建。

#### 2026-07-26 第三批：C03 Header/Bezier 与 C04 BMS 文本解析

- `MusicScoreHeaderParser` 已恢复 Parse/ReParse、控制 WAV 识别、主 WAV 与最多 200 个附加 WAV key、`#HABAHIRO` 状态和控制 Header 清除顺序。
- `MusicScoreBezierConverter` 已恢复二次曲线 200 次采样、192 刻度、步长 3 量化、force 前后排序、同位置归并、角度/常量化简、HABAHIRO 支撑 lane 展开和谱面文本重组；未引入通用曲线库。
- 冻结普通生产 BMS 的转换结果为 2107 行，SHA-256 为 `B3F3AEC64444D2553060641B1ADA203F99478727489A627C97F39B3FEA08880D`；冻结 HABAHIRO 生产 BMS 的转换结果为 1778 行，SHA-256 为 `C1C68FC617D1621F6F15C01F28E1C9CF64293D7CB154608CABD94F9D67CEFE1A`，均与 E11/E12 字节级一致。
- HABAHIRO 样本归并使用确定性补偿求和复现 Reverse Python 3.14 离线 oracle 的浮点边界；该算法仅用于已确认的曲线样本平均，不扩展为其他数值规则。
- `BMSBarData`、`BMSBarDataWithButton` 与 `BMSNoteMaterial` 已按 IL2CPP 字段形状建立；原作材料不含 `sourceOrder`、fixture 身份或同步投影字段。
- `NoteDataBMSBuilder` 已恢复 Header、小节、CC、WAV、起始 BPM 原字符串、CC03 十六进制 BPM、CC08 查表 BPM、声音值、不可见标记、附加类型和虚拟 lane 解析。
- 每个小节的 button group 保留 BMS 流中首次出现顺序，组内材料按 `absolutePos` 插入；CC01 同 button 同位置复用材料并追加音乐/声音值；HABAHIRO 同内部 button、同位置但不同 CC 的来源身份保持为独立材料。
- 两份生产转换文本分别构造 2563 与 2564 个材料；起始 BPM、原字符串、宽谱标记与 E11/E12 一致。生产样本无非零 BPM 变化，因此本批只用合成静态夹具验证 CC03/08，不宣称非零 BPM 生产闭合。
- 已新增 `npm.cmd run simulator:test:chart-parsing`，8 项测试覆盖两份生产哈希和材料数、button group 顺序、CC01 合并、CC03/08、虚拟 lane、HABAHIRO CC 碰撞与失败关闭。
- 本批通过 8 项 C03/C04 定向测试、4 项构造边界回归、20 项第一切片回归、模拟器隔离 TypeScript 检查和禁止依赖扫描；未运行 Vite/Tauri 或 GarupaEditor 整体构建。

#### 2026-07-26 第四批：C05 批次与同位置顺序

- `convertResultDictionary` 已按 Builder 的有序小节、每小节中 button group 首次出现顺序和组内材料绝对位置顺序遍历，不建立 `sourceOrder` 或全局 lane/button 排序。
- 基础 `NoteInformation` 已按原作构造字段继承 button、Note 类型、声音、CC、小节分数、绝对位置、短节奏标记、不可见标记、附加类型、BPM 与虚拟 lane；Long/Slide 配对字段继续保持未配对状态。
- `NoteBatchInformation` 按绝对位置执行显式二分查找：缺失位置在补码位置插入新批次，已有位置只向 `informationList` 末尾追加 Note。因此跨 button 同位置顺序严格来自上游 button group 首次出现顺序。
- 批次插入不依赖 TypeScript 排序稳定性；只对唯一小节 key 执行数值升序，对同位置 Note 不调用任何排序。
- 同 button、同位置仍由 C04 Builder 复用单一 material；C05 只从该 material 创建一个 Note，并保留已合并的 `playMusicList_` 与 `soundValueList` 结果。
- 原作形状的 `NoteInformation` 与批次中均未加入 `sourceOrder`、fixture ID 或同步投影字段；确定性测试身份只存在于测试输入本身。
- 已新增 `npm.cmd run simulator:test:chart-batches`，6 项测试覆盖跨 button 同位置顺序、同 button 合并、批次二分插入、基础字段映射、重复运行确定性和 C06 失败关闭。
- 本批通过 6 项 C05 定向测试、8 项 C03/C04 回归、4 项构造边界回归、20 项第一切片回归、模拟器隔离 TypeScript 检查和禁止依赖扫描；未运行 Vite/Tauri 或 GarupaEditor 整体构建。

#### 2026-07-26 第五批：C06 Long、Slide 与派生节点

- Long 记录已按时间顺序和构造 lane 身份成对；根写入终点绝对位置、终端短节奏标记、终端附加类型，并将终端类型 3、12、13 分别映射为 `AfterNoteType` 1、2、3；普通终端映射为 0。
- Long 终端只把 `buttonType` 改为 `ButtonType.None`，保留自身材料字段和批次对象身份，供 C09 按原作过滤；根与终端未复制为新的适配器记录。
- Slide A/B 已按排序后的批次时间和 `informationList` 原序分别收集；只从家族 head 开始，按现有顺序追加中间、隐藏与终端节点，不按几何 lane 重排。
- `isSlideNoteHead`、`slideNoteList` 与终端 `AfterNoteType` 已写回原对象；`slideNoteList` 成员与批次中支撑成员保持同一对象身份，最后一个成员作为终端。
- HABAHIRO Slide 同位置支撑 lane 按 E09 合并到现有图节点的 baked button 集合，重复来源记录保留并标记 `IsMultiRangeCombine`；一般宽谱连续 Note 合并仍留给 C07。
- `BakeButtonTypes` 与 `UpdateCenterButtonType` 的图节点边界已恢复：button 数组确定排序，中心 button 取下中位，偶数宽度计算 half-button index，奇数宽度保持 `-1`。
- Long/Slide 多方向追加节点已按终端位置、方向族和相邻 button 规则归属；根与追加成员更新为已确认的 multiple `AfterNoteType`、追加 `GameNoteType` 和 `FrontNoteType`，不创建独立 playable root 投影。
- 冻结普通生产 BMS 在转换前形成 93 个 Slide 根、共 298 个 authoring 节点；Bezier 转换后仍为 93 个根、共 1577 个节点，全部源路径均为展开路径的有序子序列。
- 冻结 HABAHIRO 生产 BMS 在转换前形成 51 个 Slide 根、共 141 个 authoring 节点；转换后仍为 51 个根、共 626 个节点，全部源路径均为展开路径的有序子序列。
- 已新增 `npm.cmd run simulator:test:chart-graphs`，6 项合成测试覆盖四种 Long 终端、Slide A/B、隐藏节点、共享身份、宽谱同位置节点、Long/Slide 多方向追加和 C07 失败关闭，并附两份生产有序子序列 oracle。
- 本批通过 C06 合成与生产图测试、C05/C03/C04/边界/第一切片全部回归、模拟器隔离 TypeScript 检查和禁止依赖扫描；未运行 Vite/Tauri 或 GarupaEditor 整体构建。

## 2. 固定范围

### 2.1 纳入范围

- 原始 BMS 字符串到构造结果的纯 TypeScript 管线。
- 原作 `MusicScoreHeaderParser`、`MusicScoreBezierConverter`、`NoteDataBMSBuilder`、`NoteBatchInformationListFactory` 的职责边界。
- 原作 `NoteBatchInformation` 与 `NoteInformation` 字段形状、构造顺序和对象所有权。
- Header Parse/ReParse、控制 WAV 识别、Bezier 展开、量化、化简和谱面文本重组。
- BMS Header、小节、CC、WAV、声音值、虚拟 lane、附加类型和 BPM 数据解析。
- 批次建立、同位置 material 合并、Long/Slide 图、HABAHIRO 合并和最终过滤。
- 为后续 `NoteManager` 激活同步线保留的记录顺序、终端和多方向侧节点身份。
- 普通谱面、HABAHIRO 谱面以及后续取得的非零 BPM 变化谱面的离线 oracle。
- 仅面向 `src/simulator` 的隔离类型检查和谱面构造定向测试。

### 2.2 排除范围

- GarupaEditor 编辑器谱面类型到 BMS 或构造接口的适配。
- `App.tsx`、模拟器窗口、主程序入口、路由、窗口通信和启动载荷。
- 判定、真实输入、Auto Live、分数、生命、Combo、Skill 消费和 Fever 状态机。
- Pixi 绘制、同步线实际渲染、Web Audio、CRIWARE、资源加载和动画事件执行。
- `NoteManager` 激活后的同步线断线、重连和实际线对象生命周期。
- `noteSyncEdgeMargin` 的默认值或未经证据确认的序列化值。
- Python 运行依赖、测试期间实时下载以及 Reverse 未跟踪的 `runtime/tools/`。
- 阶段验收前的 GarupaEditor 整体构建或完整模拟器联调。

## 3. 强制执行规则

1. 每个字段、枚举值、构造分支、排序、过滤和对象连接必须指向第 4 节冻结证据。
2. IL2CPP 元数据确认的类名、方法名和字段名可作为原作名称；旁路测试身份和证据追踪不得伪装为原作字段。
3. 原作形状的数据记录不得加入 `fixtureId`、`sourceOrder`、`SyncConnectionSpec` 或其他适配器字段。
4. 未闭合输入和行为统一返回 `evidence-required`，不得自动纠错、跳过记录、采用约定俗成的 BMS 语义或设置默认值。
5. 原作内部构造对象与可移植入口分层：内部对象恢复原作职责；对外纯函数是 GarupaEditor 边界，不冒充原作 API。
6. Python 原型、Bestdori JSON 和测试同步图只作为离线 oracle，不进入生产类型或运行路径。
7. 生产样本只能从 Reverse 证据登记的 URL 取得；下载后必须先校验字节数和 SHA-256，再进入临时证据包。
8. `createSimulatorEngine` 本阶段不解析 BMS；主程序如何进入模拟器继续不在范围内。
9. 第一切片允许程序在中间提交不可运行；只在任务书规定的节点运行对应隔离验证。
10. 若 Reverse 证据与本任务书摘要冲突，以锁定提交中的原始证据为准，并先修订任务书，不得自行选择实现。

## 4. 冻结证据目录

### 4.1 未来证据包结构

```text
tmp/simulator-reverse-evidence/chart-construction/
├── manifest.json
├── OPEN_GAPS.md
├── verify.mjs
├── artifacts/
│   └── investigations/
│       ├── bms-note-batch/
│       ├── music-score-bezier/
│       ├── runtime-integration-prototype/
│       └── equal-position-and-cross-note-mutation/
└── fixtures/
    ├── poppin_shuffle_special.txt
    ├── poppin_shuffle_special.json
    ├── 786_miracle_april_habahiro_special.txt
    └── 786_miracle_april_habahiro_special.json
```

`manifest.json` 的每个条目必须记录：证据 ID、Reverse 源提交、Reverse 相对路径或已登记 URL、冻结相对路径、字节数、完整 SHA-256、确认状态、适用任务和备注。`verify.mjs` 必须同时验证源文件、冻结副本和 Git 索引中的字节哈希；生产测试不得访问网络。

### 4.2 证据清单

| ID | Reverse 相对路径 | SHA-256 | 确认用途 |
| --- | --- | --- | --- |
| E01 | `artifacts/investigations/bms-note-batch/README.md` | `37B64F06EDFBC7D8F92053F82CD18D672A47B8D8089B1C5B0DCFF4D35ACC1F22` | BMS 到批次总体管线、HABAHIRO 合并和开放边界 |
| E02 | `artifacts/investigations/bms-note-batch/targets.tsv` | `4E52CD056E2A15FF983006D3E97964C3EF523ADB02FBBF85753598878050F8ED` | 工厂、Builder、转换和过滤方法边界 |
| E03 | `artifacts/investigations/bms-note-batch/sound_value_map.tsv` | `5380165E2567BC4462E617D730F7E109364861734EA31673FB1BE9EC6D17659C` | 声音值到 Note 类型、附加类型和虚拟 lane 的映射 |
| E04 | `artifacts/investigations/bms-note-batch/pipeline.pseudocode.cs` | `E72AC980A0C9527530AFCC613A98D2C7DCB05BA81B6C892674FE2C09290D7708` | ARM64 闭合的工厂顶层顺序与多范围合并 |
| E05 | `artifacts/investigations/music-score-bezier/README.md` | `ED4FBEB0214B63025688764CACDF1B8109A2EDEC92E5A40DE1F009BC1B74D0CE` | Header、Bezier、量化、化简与生产闭合说明 |
| E06 | `artifacts/investigations/music-score-bezier/targets.tsv` | `0EB4B0A4CB738CB98113B1D33756E9E8CF807BB30CD7822FA71AE2D403E453C3` | Converter、Header Parser、文本解析工具的方法边界 |
| E07 | `artifacts/investigations/runtime-integration-prototype/music_score_bezier_conversion.json` | `79EA7AEF383C32F1E6B35BA7CF50FC3FD93EDDF9FAD08D5890C7546C0C3F6799` | 200 次采样、192 刻度、步长 3、排序和化简机器可读结论 |
| E08 | `artifacts/investigations/runtime-integration-prototype/music_score_header_text_conversion.json` | `8BB7AB0C0A7F4DAE7A1C6046DD5B17D4C4628350A77F43A725C35091A200225A` | Header Parse/ReParse、附加 WAV key 和文本重组 |
| E09 | `artifacts/investigations/runtime-integration-prototype/bms_note_information_adapter.json` | `9989AD44706B64AEDF1AE0D21C639470DF2D4275D179C202A5E30FC8324CF46A` | `NoteInformation` 字段、Long/Slide 图、宽谱双坐标和命令记录 |
| E10 | `artifacts/investigations/runtime-integration-prototype/batch_finalize_and_front_sync.json` | `F9A07C6F3F7C2D905DF37121DBC514B6D796307DCD62789AE11F8865CD6745A9` | 四次 `RemoveAll`、记录存活顺序和同步端点身份 |
| E11 | `artifacts/investigations/runtime-integration-prototype/production_bms_validation.json` | `081956FDB61263D84F6FDBC1DCDC5A93365B50F0032BE282EF8D42DD046BFF0A` | 普通生产谱面字段、对象数量、Slide 展开和同步 oracle |
| E12 | `artifacts/investigations/runtime-integration-prototype/production_habahiro_bms_validation.json` | `ECBAF86B547FED5426CD0A59F1D8401AB8A1E1714B78BF8EED974A923BCEE951` | HABAHIRO 双坐标、宽谱对象数量、lane-change 和同步 oracle |
| E13 | `artifacts/investigations/runtime-integration-prototype/bpm_state_transition.json` | `036DE13292B7D2E98852451564E3FB02DD7A7B5C83E349DAEBC4682F8DDB2376` | 起始 BPM、CC03/08 数据结构和后续消费边界 |
| E14 | `artifacts/investigations/runtime-integration-prototype/habahiro_lane_change.json` | `49A8A805822AF3C01B13594E73AE9C587E40DD96E4B3301FFC4DBE053BA18BED` | lane-change 构造记录与动画消费分界 |
| E15 | `artifacts/investigations/runtime-integration-prototype/targets.tsv` | `8BCB3052C44DEFB5884E717BD96A71A2CE698D6C0B47EDAB17AAC52B745F679D` | 总证据路由和机器可读产物索引 |
| E16 | `artifacts/investigations/equal-position-and-cross-note-mutation/README.md` | `7ADA4FD567B8B5C142A98AE046BC2E5C5A300A97BB658A2D6C21C3E623D67E9E` | button group 首次出现顺序和同位置合并结论 |
| E17 | `artifacts/investigations/equal-position-and-cross-note-mutation/closure.json` | `3DF63B02A1A7031635E5A23A685D39EC7596769F421562B9B2F8A8FDE4BA2992` | 等位置顺序机器可读闭合状态 |
| E18 | `artifacts/investigations/equal-position-and-cross-note-mutation/targets.tsv` | `142DCCF7AFAF8981606D042484F64A753A8C48FB042ABFDC1D128D4445829457` | 等位置相关原生方法和调用边界 |

### 4.3 生产样本清单

| ID | 冻结文件 | Reverse 登记来源 | 字节数 | SHA-256 |
| --- | --- | --- | --- | --- |
| F01 | `fixtures/poppin_shuffle_special.txt` | `https://bestdori.com/assets/jp/musicscore/musicscore10_rip/poppin_shuffle_special.txt` | 17882 | `418DB7F5BFC6B5431AC0ABF2FB905120BDFA8C778C35AA42418A6FA43F4094DC` |
| F02 | `fixtures/poppin_shuffle_special.json` | `https://bestdori.com/api/charts/3/special.json` | 50591 | `FA636238280D384C3BAE42335B54522B02CDBE608C890516F2F38FB728DEA2FC` |
| F03 | `fixtures/786_miracle_april_habahiro_special.txt` | `https://bestdori.com/assets/jp/musicscore/musicscore790_rip/786_miracle_april_habahiro_special.txt` | 38700 | `43148090C40ABBD951E8D7112200BDAE9B796A8A531A0793169E0AD70C3DC159` |
| F04 | `fixtures/786_miracle_april_habahiro_special.json` | `https://bestdori.com/api/charts/786/special.json` | 58170 | `F30C0BC1AE5766D11394FBA02C8F14E463787B31A79E38E6C79F6E02B3493773` |

F01–F04 仅因 E11/E12 已锁定其 URL、字节数、哈希和验证用途而可使用。Bestdori 数据本身不是新的实现依据；测试只能比较 Reverse 已确认的字段和数量。

## 5. 构造数据与 API 决策

### 5.1 内部原作对象

在 `src/simulator/engine/chart/` 规划以下职责，不引入 React、Pixi、Tauri、DOM 或编辑器谱面类型：

- `MusicScoreHeaderParser`：维护 WAV、附加 WAV 和 `IsMultiRange` Header 状态。
- `MusicScoreBezierConverter`：接收原始谱面文本，输出原作转换后的谱面文本。
- `NoteDataBMSBuilder`：维护 `resultDictionary_`、BPM 列表、起始 BPM、Header 数据和解析状态。
- `NoteBatchInformationListFactory`：按原作顺序协调 Builder、批次转换、宽谱合并、Long/Slide 设置、过滤和多方向设置。

内部方法可按 TypeScript 命名规范实现，但必须在任务书进度记录中维护与原作方法的明确映射。不得因原作使用 singleton 就把可变全局单例暴露给测试或宿主；可移植入口每次调用创建独立构造上下文。

### 5.2 原作形状的数据记录

`NoteBatchInformation` 至少恢复 E09 确认的字段职责：

- `barIndex`
- `numerator`
- `denominator`
- `absolutePos`
- `informationList`

`NoteInformation` 按 E09 和 IL2CPP 元数据恢复以下构造字段职责：

- `index`、`isResult`、`isSlideNoteHead`、`isMultiRangeCombine`、`isInvisible`
- `buttonType`、构造期 button 集合、baked `buttonTypesArray`
- `gameNoteType`、`fireNoteType`、`afterNoteType`
- `halfButtonIndex`、`soundValue`、`soundValueList`、`ccNum`
- `barIndex`、`numerator`、`denominator`、`absolutePos`、`storedAbsolutePos`
- `afterNoteAbsolutePos`、短节奏标记及终端短节奏标记
- `bpm`、`bpmString`
- `slideNoteList`
- 根和 Long 终端的附加类型、Skill 索引
- `virtualLaneDirection`、`virtualLaneDistance`

TypeScript 对外结果在构造完成后只读。构造期可变集合不得从返回结果泄漏；循环图或共享节点必须保留对象身份，不得通过重复复制改变所有权。

### 5.3 可移植纯函数入口

对外规划：

```ts
createNoteBatchInformationList({
  musicScoreData,
  isCommand,
}): SimulatorResult<ChartConstructionResult>
```

- `musicScoreData` 是完整原始 BMS 字符串。
- `isCommand` 对应原作参数，省略时严格为 `false`。
- `ChartConstructionResult` 包含只读 `noteBatches`、`startBpm`、`startBpmString`、`bpmChangeRealValueList`、`bpmChangeStringRealValueList`、`isMultiRangeNotes` 和 `habahiroChangeAbsolutePos`。
- 证据引用、测试身份和诊断轨迹放在结果旁路，不注入原作记录。
- `createSimulatorEngine` 本阶段仍只消费已构造结果；是否调整宿主输入在谱面构造闭合后另行规划。

## 6. 分块实施任务

### C01 冻结谱面构造证据包

**目标**

建立可离线复验、可追踪到锁定 Reverse 提交的证据包，消除后续实现对活动工作树、实时网络和 Python 原型的依赖。

**产物**

- `tmp/simulator-reverse-evidence/chart-construction/manifest.json`
- `tmp/simulator-reverse-evidence/chart-construction/OPEN_GAPS.md`
- `tmp/simulator-reverse-evidence/chart-construction/verify.mjs`
- E01–E18 的字节级副本
- F01–F04 的离线生产样本

**实施步骤**

1. 确认 Reverse `HEAD` 等于锁定提交，且唯一未跟踪内容仍为明确排除的 `runtime/tools/`。
2. 按第 4 节路径复制 E01–E18，保留原目录结构。
3. 从 E11/E12 登记 URL 下载 F01–F04；先验证字节数，再验证 SHA-256。
4. 建立 manifest 并登记每项证据的确认状态和消费任务。
5. 建立 `OPEN_GAPS.md`，至少登记非零 BPM 生产 oracle、`noteSyncEdgeMargin` 和运行时同步重连边界。
6. 建立源文件、冻结副本和 Git 索引三方哈希验证脚本。

**原作证据**

- 路由与源提交：E15。
- 生产样本来源和哈希：E11、E12。
- 具体算法证据：E01–E10、E13–E18。

**确认事实**

- E01–E18 均位于锁定提交。
- F01–F04 的 URL、字节数和 SHA-256 已由 Reverse 生产验证锁定。

**推定内容**

- 无。

**未解决项**

- 尚无带非零 CC03/08 的冻结生产样本。

**禁止越界项**

- 不复制 `runtime/tools/`。
- 不复制旧模拟器代码或把 Python 原型放入运行路径。
- 不接受哈希不匹配但“内容可读”的样本。

**测试**

- 运行证据包哈希验证脚本。
- 检查 manifest 路径、字节数、哈希和 Git 索引一致。

**停止条件**

- Reverse 提交不匹配。
- 任一源证据或生产样本哈希不匹配。
- 无法证明网络样本就是 E11/E12 登记的字节。

### C02 建立构造边界与 API

**目标**

用 TypeScript 建立原作构造对象边界和独立纯函数入口，同时把原作数据与 GarupaEditor 测试设施隔离。

**产物**

- `engine/chart` 构造模块边界。
- 原作形状的 `NoteBatchInformation`、`NoteInformation` 及相关枚举类型。
- `createNoteBatchInformationList` 和 `ChartConstructionResult`。
- 第一切片夹具类型到新构造记录的临时测试适配边界。

**实施步骤**

1. 建立第 5 节四个内部原作对象的职责边界。
2. 将生产数据字段与 `fixtureId`、证据包装、测试轨迹分离。
3. 建立每次调用独立的构造上下文，禁止跨谱面残留 Builder 或 Header 状态。
4. 返回只读构造结果；构造期集合只在内部可变。
5. 缺少证据的输入、枚举或数据形状统一返回结构化 `evidence-required`。

**原作证据**

- 工厂与 Builder 方法边界：E01、E02、E04。
- 字段布局和对象图：E09。
- Header/Converter 边界：E05–E08。

**确认事实**

- 原作工厂公开返回 `List<NoteBatchInformation>`，并通过属性暴露 BPM 与宽谱状态。
- `NoteBatchInformation` 和 `NoteInformation` 的字段职责已由 IL2CPP 元数据和 E09 交叉确认。

**推定内容**

- `ChartConstructionResult` 是 GarupaEditor 可移植聚合结果，不是原作类型。
- 每次调用独立上下文是宿主隔离策略，不宣称原作 singleton 生命周期相同。

**未解决项**

- 谱面构造闭合后，`createSimulatorEngine` 最终直接消费哪个聚合类型尚不在本任务决定。

**禁止越界项**

- 不在原作记录中添加 `fixtureId`、`sourceOrder` 或同步投影。
- 不修改主程序入口或编辑器载荷。
- 不为未确认枚举值提供“unknown but continue”分支。

**测试**

- 验证两次构造调用无共享状态。
- 验证返回集合只读且共享节点身份保持。
- 验证原作数据序列化视图不含测试字段。

**停止条件**

- 无法区分原作字段与适配器字段。
- 为兼容第一切片而必须污染原作数据形状。

### C03 恢复 Header 与 Bezier 转换

**目标**

严格恢复原作谱面文本预处理，使控制节点展开后的文本与 Reverse oracle 字节级确定。

**产物**

- Header Parse/ReParse 实现。
- 控制 WAV 与附加 WAV key 分配实现。
- 普通及 HABAHIRO Bezier 转换实现。
- 文本级确定性测试夹具和转换摘要。

**实施步骤**

1. 恢复 WAV、附加 WAV、`IsMultiRange` 和文件名解析。
2. 识别 Slide A/B 的 front/back、force/control 四类控制族。
3. 对二次曲线执行原作 200 次采样。
4. 将位置映射到 192 刻度并按步长 3 量化。
5. 恢复 lane/WAV 生成、force 前后排序、中间点归并和控制点化简。
6. 为最多 200 个生成节点分配附加 WAV key，并按原作顺序重组谱面行。
7. 对普通和 `#HABAHIRO` 支撑 lane 分别验证。

**原作证据**

- 算法说明和生产结果：E05。
- 方法级边界：E06。
- 机器可读算法参数：E07、E08。
- 生产文本输出哈希：E11、E12。

**确认事实**

- 曲线采用二次曲线、200 次采样、192 刻度和步长 3 量化。
- Header 重解析和 200 个附加 WAV key 已在普通生产谱面闭合。
- HABAHIRO 转换保留独立支撑 lane。

**推定内容**

- 无；实现中若需要新的分组名称，只能作为私有语义名称并标记 `inferred`。

**未解决项**

- 无 E05/E07/E08 登记之外的控制 WAV 家族。

**禁止越界项**

- 不使用通用 Bezier 库替代采样、量化和化简顺序。
- 不规范化换行、数字文本或 Header 顺序来掩盖输出差异。

**测试**

- 覆盖四个普通控制族和 HABAHIRO 控制族。
- 验证普通输出 SHA-256 为 `B3F3AEC64444D2553060641B1ADA203F99478727489A627C97F39B3FEA08880D`。
- 验证 HABAHIRO 输出 SHA-256 为 `C1C68FC617D1621F6F15C01F28E1C9CF64293D7CB154608CABD94F9D67CEFE1A`。
- 验证转换重复执行结果完全一致。

**停止条件**

- 输出行数、WAV 数量、控制 Header 清除结果或输出哈希与 E11/E12 不同。
- 只能通过忽略顺序或宽松比较通过测试。

### C04 恢复 BMS 文本解析

**目标**

按原作 Builder 规则把转换后的 BMS 文本解析为材料字典和构造所需元数据。

**产物**

- Header、小节和谱面行解析器。
- `BMSBarData`、`BMSNoteMaterial` 等内部构造材料。
- 声音值、类型、附加类型、虚拟 lane 和 BPM 映射。

**实施步骤**

1. 恢复初始化状态和逐行分派。
2. 恢复 Header 数据、`#BPM`、`#BPMxx`、WAV 和宽谱标记解析。
3. 恢复小节号、CC 字符串、分母、magnification 和绝对位置计算。
4. 按 E03 恢复 Note、Flick、Directional、附加类型、不可见标记和虚拟 lane 映射。
5. 同 button、同位置时复用已有 material 并合并声音值。
6. 保留 `startBpm` 的 float 值和原始字符串，不自行格式化。

**原作证据**

- Builder 总体职责和等位置合并：E01、E04、E16–E18。
- 方法边界：E02。
- 声音值映射：E03。
- BPM 数据边界：E13。

**确认事实**

- Builder 使用 `SortedDictionary<int, BMSBarData>` 保存结果。
- 同 button、同绝对位置的材料会合并声音值。
- CC03 是十六进制 BPM，CC08 通过 `#BPMxx` 查表。

**推定内容**

- TypeScript 内部材料类型名称是移植名称；字段语义必须逐项对应证据。

**未解决项**

- 非零 BPM 生产样本尚未冻结。
- 未在 E03 中出现的声音值没有实现许可。

**禁止越界项**

- 不采用第三方 BMS parser 的默认容错。
- 不跳过未知 Header、CC 或声音值后继续产出“尽可能多”的谱面。
- 不引入全局 lane/button 排序。

**测试**

- 覆盖 Header、普通 CC、CC03、CC08、虚拟 lane、不可见 Note 和同位置声音值合并。
- 对未知声音值、奇数长度值串、非法分母和未解析 BPM key 验证失败关闭。

**停止条件**

- 必须猜测未登记声音值或错误恢复策略。
- 同位置材料数量或声音值集合无法与 E16/E17 对齐。

### C05 恢复批次与同位置顺序

**目标**

恢复从 Builder 结果到 `NoteBatchInformationList` 的原作顺序，不以适配器字段替代真实排序来源。

**产物**

- `convertResultDictionary` 与批次插入逻辑。
- 确定的 button group 和组内记录顺序。
- 同位置及跨 button 顺序测试。

**实施步骤**

1. 按 BMS 流中 button group 首次出现顺序建立组。
2. 在组内按确认的绝对位置规则排序。
3. 按原作调用顺序将材料转换为 `NoteInformation` 并插入批次。
4. 保留相同位置跨 button 的首次出现顺序。
5. 不在后续阶段重新按 lane、button、类型或适配器 ID 排序。

**原作证据**

- 转换方法边界：E01、E02、E04。
- 首次出现顺序和同位置规则：E16–E18。
- 最终存活顺序：E10。

**确认事实**

- 跨 button 同位置顺序来自 button group 在 BMS 流中的首次出现顺序。
- 同 button、同位置由上游 material 合并处理。

**推定内容**

- 无。

**未解决项**

- 无独立 `sourceOrder` 原作字段。

**禁止越界项**

- 不增加 `sourceOrder`。
- 不按 lane 数值、button 数值或 Note 类型执行全局稳定排序。

**测试**

- 构造跨 button 同位置输入，验证首次出现顺序。
- 构造同 button 同位置输入，验证单一 material 与声音值合并。
- 验证多次运行批次与 `informationList` 顺序一致。

**停止条件**

- 只有引入伪造顺序字段才能通过生产 oracle。
- TypeScript 排序稳定性成为未记录的行为依赖。

### C06 恢复 Long、Slide 与派生节点

**目标**

恢复 Long 和 Slide 的原作构造图，使终端、隐藏节点和多方向追加节点保持正确所有权。

**产物**

- Long 根与终端配对实现。
- Slide A/B head、ordered `slideNoteList`、中间节点和终端实现。
- baked button 集合和多方向追加节点关系。

**实施步骤**

1. 按原作 family 和 chart 顺序收集 Long 与 Slide A/B 材料。
2. 恢复 `setupLongNotePair` 的终点绝对位置和终端手势映射。
3. 恢复 `setupSlideNoteSet` 的 head 标记、节点追加顺序和终端类型。
4. 恢复 Slide 节点 button 集合 bake。
5. 将 Long/Slide 的 directional additional 节点连接到所属根或终端。
6. 将 terminal/additional 记录保留为支撑成员，不投影为独立 playable root。

**原作证据**

- 工厂方法与顺序：E01、E02、E04。
- 字段布局、Long/Slide 图和多方向成员：E09。
- 生产 Slide 有序子序列：E11、E12。

**确认事实**

- Long 终端类型 3、12、13 映射到已确认的 `AfterNoteType`。
- Slide 最后一个 `slideNoteList` 成员作为终端，其余成员保持有序中间节点。
- terminal/additional 记录不生成独立 playable root。

**推定内容**

- 测试中用于描述图的 root/node ID 是旁路身份，不是原作字段。

**未解决项**

- 节点的判定、移动、松手、渲染和音效消费属于后续阶段。

**禁止越界项**

- 不把终端或追加节点平铺为独立音符。
- 不按几何位置重新排序 Slide 节点。
- 不实现后续 Note 实体行为。

**测试**

- 覆盖 Long 普通终端、Flick 终端和多方向终端。
- 覆盖 Slide A/B head、中间、隐藏和终端。
- 验证普通生产谱面 298 个 authoring Slide 节点是 1577 个展开节点的有序子序列。
- 验证 HABAHIRO 141 个源节点是 626 个展开节点的有序子序列。

**停止条件**

- 图只有通过复制或重排节点才能匹配 oracle。
- 无法区分 playable root 与支撑成员。

### C07 恢复 HABAHIRO 与多范围合并

**目标**

恢复宽谱连续 button 合并，同时保留 CC 来源 lane 与内部 half-button/baked button 的双坐标。

**产物**

- `combiningDictionary`、`combineNotes` 和 combine 类型门。
- CC 来源集合、内部 button 集合和合并标记。
- lane-change 构造记录。

**实施步骤**

1. 按 `informationList` 当前顺序扫描可合并 run。
2. 只合并相同 `GameNoteType`、连续 button 且满足 E01/E04 类型门的记录。
3. 选取首尾整数中点对应的现有记录作为代表。
4. 合并覆盖 button、非零虚拟 lane、嵌套声音值并 bake button 数组。
5. 标记覆盖记录的 `IsMultiRangeCombine`。
6. 独立保留根、Long 终端和每个 Slide 节点的 CC 来源集合。
7. 将 additional type 4 保留为 lane-change 构造记录，位置和 CC 不转换为动画行为。

**原作证据**

- 多范围算法：E01、E04。
- 双坐标、CC 碰撞和 lane-change 分离：E09、E12、E14。
- 类型门和方法边界：E02。

**确认事实**

- 中点现有记录成为合并代表，覆盖记录仍保留到最终过滤。
- CC 来源 lane 与内部 half-button 索引不是同一坐标。
- 锁定 HABAHIRO 样本在绝对位置 1728 产生一条 lane-change 记录，来源 CC 为 13。

**推定内容**

- “代表记录”是对确认选择行为的语义描述，不扩展为输入或判定所有权结论。

**未解决项**

- lane-change 动画事件时间和实际材质切换属于后续渲染阶段。

**禁止越界项**

- 不用内部 button 范围覆盖 CC 来源 lane。
- 不把 lane-change 记录变成 playable root。
- 不猜测动画时长或自动完成事件。

**测试**

- 覆盖连续与非连续 button、不同类型、Long button `-1` 和被排除类型。
- 验证同内部 button/位置但不同 CC 的记录不会丢失。
- 验证 767 条带 CC 记录、311 个合并 CC 集合和位置 1728 的 lane-change 记录。

**停止条件**

- CC 来源集合与 E12 数量不同。
- 需要丢弃 CC 碰撞记录才能满足内部 button 合并。

### C08 恢复 BPM、Skill 与 Fever 构造数据

**目标**

恢复命令相关数据的构造形状，但不提前实现其运行时消费者。

**产物**

- 起始 BPM、CC03/08 BPM 变化记录和原始字符串列表。
- 根与 Long 终端的 Skill/Fever 附加类型及索引。
- 非零 BPM 生产 oracle 缺口记录和证据门。

**实施步骤**

1. 恢复 `#BPM` 起始值和原始字符串。
2. 恢复 CC03 两字符十六进制 BPM 记录。
3. 恢复 CC08 经 `#BPMxx` 查表的 BPM 记录。
4. 保留 BPM float 与字符串的并行列表及记录位置。
5. 恢复 Skill/Fever 根与终端附加类型、索引分配。
6. 在取得冻结的非零 BPM 生产或实体设备 oracle 前，将“生产闭合”保持为开放状态。

**原作证据**

- Builder 方法和声音值映射：E01–E04。
- BPM 数据与静态消费边界：E13。
- 生产 Skill/Fever 字段数量：E11。
- lane-change 与其他附加类型分界：E09、E14。

**确认事实**

- 起始 BPM 不计入 BPM change count。
- CC03 和 CC08 的数据来源不同。
- E11/E12 两个生产样本均无非零 BPM change command。
- Skill/Fever 字段可构造，但其 UI、分数和状态机消费不属于本阶段。

**推定内容**

- 无。

**未解决项**

- 尚无非零 CC03/08 的冻结生产或实体设备 oracle。
- 音频 transport 回调时机属于后续生命周期。

**禁止越界项**

- 不因两个样本没有 BPM change 就删除该分支。
- 不用合成测试宣称生产谱面闭合。
- 不实现 Skill、Fever、音频或协程消费者。

**测试**

- 用静态证据构造最小 CC03/08 输入，验证解析值、字符串、位置和顺序。
- 验证未知 BPM key、非法十六进制和非有限 BPM 失败关闭。
- 生产验收仅记录 E11/E12 起始 BPM 及零 change count。

**停止条件**

- 实现需要推定 CC03/08 未确认格式。
- 在无非零 oracle 时测试或文档宣称 BPM 生产闭合。

### C09 恢复终结过滤与同步准备

**目标**

严格恢复工厂末端过滤，并保留后续 `NoteManager` 建立同步线所需的数据身份和顺序。

**产物**

- 四次 `RemoveAll` 的顺序实现。
- 过滤前后记录审计测试。
- 测试专用端点同步投影器，不进入生产构造结果。

**实施步骤**

1. 第一遍移除 button `-1` 的 Long 和对应 directional Long 类型。
2. 第二遍按 `checkDeleteBgmNote` 与空 button/声音值/终端例外规则过滤。
3. 第三遍移除非 head Slide 和已确认终端 directional Slide 类型。
4. 第四遍移除 `IsMultiRangeCombine` 覆盖记录。
5. 验证四遍只删除成员，不重排剩余 `informationList`。
6. 保留 front、Long end、Slide end 和 Slide side-node 身份供后续激活使用。
7. 仅在测试中按 E10 投影静态同步连接，验证构造数据足以恢复 oracle。

**原作证据**

- 过滤顶层调用顺序：E01、E04。
- 四个谓词和同步端点身份：E10。
- 对象图字段：E09。
- 生产同步数量：E11、E12。

**确认事实**

- 四个 `RemoveAll` 按固定顺序执行且不会重排存活项。
- 同步端点可以是 front、Long end、Slide end 或选定 Slide side node。
- 实际同步线由后续 `NoteManager` 激活流程建立，不是工厂序列化字段。

**推定内容**

- 测试投影器中的连接 ID、方向标签和集合形状是 oracle 表达，不是原作字段。

**未解决项**

- `noteSyncEdgeMargin` 序列化值。
- 激活后由实时 Note 状态触发的断线和重连时机。

**禁止越界项**

- 不把 `SyncConnectionSpec` 写入工厂输出。
- 不设置 `noteSyncEdgeMargin` 默认值。
- 不实现同步线对象、渲染或运行时回调。

**测试**

- 对每个过滤谓词建立正反例并验证执行顺序。
- 验证过滤后顺序与过滤前存活子序列完全一致。
- 普通样本测试投影得到 192 条端点同步关系。
- HABAHIRO 样本测试投影得到 266 条端点同步关系。

**停止条件**

- 只有在生产模型中加入同步投影字段才能匹配 oracle。
- 过滤结果需要额外排序或未记录删除规则。

### C10 建立生产 oracle、隔离测试与验收

**目标**

用离线生产样本证明构造结果在已确认字段、数量、顺序和连接关系上与 Reverse oracle 一致，并明确仍未闭合的命令消费边界。

**产物**

- `src/simulator/testing` 下的谱面构造隔离测试入口。
- 普通与 HABAHIRO 生产 oracle 适配器。
- `tmp/simulator-chart-construction-acceptance.md`。
- 阶段证据缺口和验证命令记录。

**实施步骤**

1. 使用项目现有 TypeScript 工具链编译并执行隔离测试，不新增 Python、Vitest 或 Jest 运行依赖。
2. 从 F01/F03 构造原作记录；F02/F04 仅比较 E11/E12 已确认的 authoring 字段。
3. 建立旁路 oracle 适配器统计 playable root、Slide 源节点、展开节点、同步连接和命令记录。
4. 验证普通谱面全部确认数量和字段。
5. 验证 HABAHIRO 谱面全部确认数量、双坐标和 lane-change。
6. 运行确定性、失败关闭、禁止依赖和证据包验证。
7. 在验收文档记录未运行范围和非零 BPM 生产 oracle 开放状态。

**原作证据**

- 普通生产 oracle：E11、F01、F02。
- HABAHIRO 生产 oracle：E12、F03、F04。
- 数据与同步解释：E09、E10。
- 非零 BPM 开放边界：E13。

**确认事实**

- 普通谱面应产生 656 批次、935 构造记录、825 playable roots、298 个源 Slide 节点、1577 个展开节点和 192 条同步关系。
- HABAHIRO 谱面应产生 371 批次、770 构造记录、598 playable roots、51 个 Slide 根、626 个展开节点、1 条位置 1728 的 lane-change 记录和 266 条同步关系。
- Python 原型只用于生成 Reverse oracle，TypeScript 测试可完全离线执行。

**推定内容**

- 测试适配器中的 playable root 与同步连接结构是验证投影，不是新的模拟器运行协议。

**未解决项**

- 非零 BPM change 的生产或实体设备 oracle。
- Skill/Fever、lane-change 动画和同步运行时消费。

**禁止越界项**

- 测试不得实时访问 Bestdori。
- 不将 Python 加入 package scripts 或生产依赖。
- 阶段验收前不运行 GarupaEditor 整体构建。
- 不因生产样本通过就宣称排除范围内行为已经复原。

**测试**

- Header Parse/ReParse、200 key、Bezier 四族、量化和文本确定性。
- BMS CC/WAV/声音值、CC03/08、未知输入失败关闭。
- 同位置 material 合并、button group 顺序、Long/Slide 配对和隐藏节点。
- HABAHIRO CC 碰撞、双坐标、合并过滤和 lane-change。
- 四次终结过滤、存活子序列和静态同步 oracle。
- 普通与 HABAHIRO 全量生产统计和字段比较。
- 依赖扫描、证据包哈希验证和 `git diff --check`。

**停止条件**

- 任一已确认字段、数量、顺序、文本哈希或同步数量不匹配。
- 测试只能依赖网络、Python 或宽松忽略差异才能通过。
- 验收文档未明确记录非零 BPM 和运行时消费者仍开放。

## 7. 提交边界

后续实施必须按以下语义边界提交；若某批因证据缺口停止，不得把未闭合实现混入下一批：

1. `docs(simulator): 冻结谱面构造证据与生产样本`
   - C01 的 manifest、证据副本、样本、验证脚本和缺口文档。
2. `refactor(simulator): 建立原作谱面构造数据边界`
   - C02 的原作形状类型、内部对象边界和纯函数接口。
3. `feat(simulator): 恢复 Bezier 与 BMS 文本构造管线`
   - C03、C04 的 Header、Bezier、Builder 和基础解析。
4. `feat(simulator): 恢复长按滑条与宽谱对象图`
   - C05–C07 的顺序、Long/Slide、HABAHIRO 和 lane-change 构造。
5. `feat(simulator): 恢复命令数据与谱面终结规则`
   - C08、C09 的 BPM/Skill/Fever 数据、四次过滤和同步准备。
6. `test(simulator): 验证谱面构造生产样本`
   - C10 的隔离测试、生产 oracle 和验收文档。

本任务书本身单独提交为：

```text
docs(simulator): 记录谱面构造阶段任务与证据
```

## 8. 阶段完成定义

只有同时满足以下条件，谱面构造阶段才可标记完成：

1. C01–C10 的产物、证据、测试和停止条件逐项记录为完成。
2. E01–E18、F01–F04 的冻结副本、manifest 和 Git 索引哈希全部一致。
3. 原作形状数据不含 `fixtureId`、`sourceOrder` 或同步投影字段。
4. 普通生产文本、材料、批次、记录、playable root、Slide 节点和同步 oracle 全部匹配。
5. HABAHIRO 生产文本、双坐标、批次、记录、playable root、Slide 节点、lane-change 和同步 oracle 全部匹配。
6. 未知输入、缺失 BPM key、未登记声音值和未闭合行为全部失败关闭。
7. 非零 BPM 生产 oracle 若仍未取得，验收必须明确将其保留为开放缺口，不得宣称该路径生产闭合。
8. Python 和网络不在 TypeScript 运行或测试依赖中。
9. `noteSyncEdgeMargin`、同步运行时重连、判定、渲染、音频、输入和主程序入口仍明确属于后续阶段。
10. 完成规定的隔离验证；不以 GarupaEditor 整体可运行作为本阶段完成承诺。

## 9. 本任务书落地验证

本次只创建本任务书，不创建代码框架、不复制证据包、不下载生产样本，也不修改第一切片文件。

提交前必须检查：

- C01–C10 均包含目标、产物、实施步骤、原作证据、确认事实、推定内容、未解决项、禁止越界项、测试和停止条件。
- E01–E18 与 F01–F04 均使用完整路径、字节数和完整 SHA-256，不使用省略形式。
- 文档明确 Reverse 提交、排除 `runtime/tools/`、TypeScript 技术栈和 Python 离线 oracle 边界。
- 文档明确工厂输出不包含 `fixtureId`、`sourceOrder` 或 `SyncConnectionSpec`。
- 文档明确非零 BPM、`noteSyncEdgeMargin` 和运行时消费者的开放边界。
- 仅运行 `git diff --check`；不运行 TypeScript 检查、模拟器测试、Vite/Tauri 构建或 GarupaEditor 整体构建。
