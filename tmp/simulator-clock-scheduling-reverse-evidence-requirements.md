# 模拟器时钟与调度阶段逆向证据需求清单

## 1. 文档身份

- 文档用途：一次性列明模拟器“时钟与调度”阶段实施前、实施中和验收时必须取得的全部原作逆向证据。
- 适用阶段：`simulator-clock-scheduling-task.md` 的 S02–S10。
- 唯一行为依据：`HOST________\VSCode\GirlsBandParty-Reverse` 中已经提交、可校验、可追溯的逆向产物。
- 静态基线提交：`74ab76f6838847d98aae1a15741a5f024e3774ff`。
- 当前冻结证据提交：`e96733cd96a5e7446d2b9adbc413bf77de0bcf98`。运行 oracle 文件内容延续 `f71f73fd2e408cfc888c5bbcce0a59c8eb73b18d` 的最终静态批次，后续提交补充并修正交接边界表述；S02 仍因第 27 节列出的明确可用性/观察可达性边界保持 fail-closed，因此这里不称其为“S02 解锁提交”。
- 第一批运行时证据：`2aee4dbe486be1feda9fdf28cb94d14204058f42`；已冻结 60 模式 CC03/CC08、双时钟初始化、launcher lead、bundle/BMS 一致性和 `bpmChangeCount` 运行时修正。
- 第二批运行时证据：`3051532a`（含 `da94ca43` 证据提交与 `864e7bc4` 采集稳定性文档）；新增七条完整采集，闭合零 BPM-change 60 模式、三类暂停/恢复、正 offset 跨 BPM，并修订自适应回退计数器映射。仍不是最终解锁提交。
- 第三批运行时证据：`803ac909`；采集设备自动升级到 10.1.4 / 230，已完成时钟调度目标集的跨版本重建证明，并在 10.1.4 上闭合 120 模式请求。详见第 25 节。
- **锁定版本：`10.1.4 / 230`**（第 26 节）。10.1.3 证据保持冻结，作为该版本自身的闭合样本与跨版本佐证，不与 10.1.4 合并。
- 当前结论：E01–E26 静态证据、10.1.3 的 R01–R22 历史批次、10.1.4 重建与 runs 030–060 均已冻结；除明确边界项外无普通待采任务。S02 动态证据硬门仍未闭合，S03–S10 不得开始。
- **E14 与 `music-bar-division-adaptive-substeps` 的哈希已因第 23 节的修订而变化**，这是第 2.3 节要求的“静态与动态冲突先在 Reverse 修订”的正常结果，不是篡改信号；引用方须按第 24 节刷新。

本文档是独立证据需求书，不是采集脚本设计，不要求使用某一种注入、调试或记录工具。只要产物满足真实性、完整性、可复核性和提交冻结要求，即可采用对原作行为无修改的采集方式。

## 2. 证据等级与通用规则

### 2.1 证据等级

每个结论必须能路由到以下四层产物，不能只留下文字总结：

1. **原始证据**：原始 BMS、二进制、元数据、原始内存值、原始逐事件 trace、必要的反编译或汇编片段。
2. **解析证据**：将原始值转换为字段、对象、列表、位置、BPM 和事件的机器可读结果。
3. **闭合结论**：逐项区分确认事实、推定内容、未解决项和被排除解释。
4. **校验器**：在不运行 GarupaEditor、不联网、不连接设备的情况下，验证文件、哈希、字段完备性、事件约束和样本覆盖。

### 2.2 每份证据必须记录

- Reverse 源提交和相对路径。
- 文件字节数和完整大写 SHA-256。
- 采集或提取时间、工具及工具版本。
- 原作包、二进制、设备和运行样本身份。
- 证据状态：`confirmed`、`inferred`、`unresolved` 或 `excluded`。
- 消费任务：S03、S04、S05、S06、S07、S08、S09、S10 中的一个或多个。
- 若为动态数据，记录对应静态 target、方法 RVA、字段 offset 和对象 owner。
- 若为派生数据，记录来源文件、转换规则和可重复执行的校验入口。

### 2.3 强制边界

- 原作字段必须以 owner、类型和 offset 标识；人类可读别名只能标记为 trace label，不能冒充已确认字段名。
- ASLR 后的运行地址只属于单次 run；跨运行稳定定位必须使用模块身份和 RVA。
- 浮点字段必须同时保存原始位模式和解码值，不能只保留格式化十进制字符串。
- 列表和对象池必须保存成员指针身份与顺序，不能只保存 Count。
- 静态和动态证据冲突时，先在 Reverse 复核并修订结论，不得在模拟器中选择“看起来合理”的一方。
- 未提交、无完整哈希、不可回放或依赖修改原作逻辑的轨迹无效。
- 禁止使用旧 GarupaEditor 模拟器、Reverse 未跟踪的 `runtime/tools/`、未经 Reverse 登记的网络样本或模拟器自身输出反推原作。
- 合成输入可验证已经确认的算法分支，但不能替代要求生产或实体设备闭合的分支。

## 3. 已冻结静态基线

以下 E01–E26 已在 GarupaEditor 临时证据包冻结。S02 应校验并引用它们，不重复下载，也不得用新动态轨迹静默覆盖其结论。

| ID | Reverse 相对路径 | SHA-256 |
| --- | --- | --- |
| E01 | `artifacts/investigations/note-scheduling-clock/README.md` | `CB13700C9A3B8CA4DC66DE2AFCD923A7917868260385E731F5BE5262FF7CA946` |
| E02 | `artifacts/investigations/note-scheduling-clock/targets.tsv` | `F019C5B9B6499CFB246AE013C42987ABE12BF0CCD8057A3D4845AADDFDEFFDF4` |
| E03 | `artifacts/investigations/note-scheduling-clock/pipeline.pseudocode.cs` | `814B2FB856B11BE11012E56321F1B140BF84B98A257672619D51F812F0543E75` |
| E04 | `artifacts/investigations/music-bar-division-adaptive-substeps/README.md` | `6720E2EDBD1470004B6437FF245402B30097DD93DCECC248E0DA7C0ABCEFE92B` |
| E05 | `artifacts/investigations/music-bar-division-adaptive-substeps/closure.json` | `09A4B3639384887135D60CC296E2D590D550F12D647941C1C508B62610586C0E` |
| E06 | `artifacts/investigations/music-bar-division-adaptive-substeps/targets.tsv` | `F0972AD43B68999901B2406B368C070FD25FD6CF1F288745A6B0589EDCE181BF` |
| E07 | `artifacts/investigations/bpm-change-consumer/README.md` | `42C57683697FC8BD26CFE138E5CF78D6301DF2BEB52E294873BCEA6B8875FFB5` |
| E08 | `artifacts/investigations/bpm-change-consumer/bpm_state_transition.json` | `036DE13292B7D2E98852451564E3FB02DD7A7B5C83E349DAEBC4682F8DDB2376` |
| E09 | `artifacts/investigations/bpm-change-consumer/targets.tsv` | `CF77D4EE5A840E55322A2D539EED0EEC53A916244330AB67EB7259FFE9FE2684` |
| E10 | `artifacts/investigations/bpm-change-consumer/arm64/bpm_change.s` | `D27DAF82A10175D9626784D005C1A75BFF68AE6A776CB10438C6EF4DFC7B2E76` |
| E11 | `artifacts/investigations/simultaneous-note-ordering/README.md` | `A15D27EDD7FB1368760E196789A35D5486F804C856F42BAE40FDB5FB5FAD3E95` |
| E12 | `artifacts/investigations/simultaneous-note-ordering/pipeline.pseudocode.cs` | `C4DB58BD214CEA508310C574301A0276C592580E9A87C22BEA8B10657A73FB1C` |
| E13 | `artifacts/investigations/runtime-integration-prototype/note_manager_two_phase_substep_order.json` | `774C1C39644EE937E47FE64171E5715AF915A194E9EB8A59FDA44F1F664CB177` |
| E14 | `artifacts/investigations/runtime-integration-prototype/note_manager_adaptive_substeps.json` | `260ACB365EEAD55A0C1F8D9219F762CA9AC4CF656E597C892B459886388B4D05` |
| E15 | `artifacts/investigations/runtime-integration-prototype/note_manager_active_list_mutation.json` | `E1B8E48695F0BD7EFC0C3750BC7ADAF113533326DC98A8FB685FC70B787E7BFD` |
| E16 | `artifacts/investigations/runtime-integration-prototype/multiple_flick_active_list_order.json` | `EC64154569BA4B30D644D27E839BEABA5357A6554FAAEA95080295B118ABB391` |
| E17 | `artifacts/investigations/runtime-integration-prototype/slide_tail_execute_frame.json` | `4109E09E6D0D7CE3F8CD224A0C0C002CE9EEA61B33BA738CC3D24FC8FCF4CB99` |
| E18 | `artifacts/investigations/ingame-playerloop-pause-gates/closure.json` | `6F0EFD625BB32C954CBAF6873CA118A8F2415CA43ECB739FC0F43604A4D9BC01` |
| E19 | `artifacts/investigations/frame-rate-control-flow/README.md` | `B94C93A5E908D26BCF0D56B4EA4333F9D86FB976C0694C5DFB265BC6D7580477` |
| E20 | `artifacts/investigations/frame-rate-control-flow/frame_rate_control.json` | `185798DCFDED803FEBC72268CFBFDF08EBF2BC130BE9945E94BA569D96E41FA3` |
| E21 | `artifacts/investigations/frame-rate-control-flow/targets.tsv` | `46E47D23FB1AF51002329019A22804151928A8F5CF502998F231A25AEC8279FA` |
| E22 | `artifacts/investigations/deterministic-engine-harness/README.md` | `1F93E9190ED6C70B086DE6BBAE4AD5C27454628C88C38909CD3D340D576298CF` |
| E23 | `artifacts/investigations/deterministic-engine-harness/validation_results.json` | `A1A8938C93D010592F5964C064C9AF4FB32573CD0700E65C5DA92275C4E7E161` |
| E24 | `artifacts/investigations/deterministic-engine-harness/targets.tsv` | `CA586BB9CD5F34FEBF8E04C4D2DD86F4D7D6FF80FD73EFA7622E0F0531E6C833` |
| E25 | `artifacts/investigations/runtime-integration-prototype/production_bms_validation.json` | `081956FDB61263D84F6FDBC1DCDC5A93365B50F0032BE282EF8D42DD046BFF0A` |
| E26 | `artifacts/investigations/runtime-integration-prototype/production_habahiro_bms_validation.json` | `ECBAF86B547FED5426CD0A59F1D8401AB8A1E1714B78BF8EED974A923BCEE951` |

静态基线已经确认算法骨架，但不能单独证明初始化值、launcher lead、非零 BPM 的真实驻留时机、实体帧序列和暂停续跑轨迹。

## 4. 二进制、版本与运行环境身份

每次动态采集必须生成不可省略的环境记录，至少包含：

- 应用包名、显示版本、version code、区域和发行渠道。
- 设备 ABI、CPU 型号、Android 版本、内核版本和设备型号。
- 主 APK 与全部 split APK 的文件名、字节数和 SHA-256。
- `libil2cpp.so`、`global-metadata.dat` 及影响 gameplay 的原生/托管资源哈希。
- Unity 版本和 IL2CPP 元数据版本；无法直接取得时明确记录来源和确认级别。
- 进程名、模块加载基址、模块 RVA 到运行地址的换算记录。
- 游戏内 High Frequency 设置值、实际请求的 target frame rate，以及该 run 的 60/120 标签。
- 歌曲 ID、歌曲名、难度、music score key、bundle 路径、bundle 哈希、BMS 路径和 BMS 哈希。
- 采集工具、版本、配置和是否附加调试器；明确证明采集未修改原作控制流和状态。

不同包版本、不同 `libil2cpp.so` 或不同 metadata 的证据不得合并为同一闭合样本。若必须跨版本引用静态定位，必须重新证明签名、RVA、字段布局和行为一致。

## 5. 静态托管层定位与调用图

Reverse 最终调查必须为以下对象建立可复核的类型、方法、字段和调用关系表：

- `InGameDirector`
- `InGameManager`
- `InGameMusicScoreController`
- `NoteManager`
- `NoteBpmChange`
- `NoteBatchInformation`
- `NoteInformation`

对每个相关方法至少记录：

- 完整 owner、方法名、返回类型、参数类型和参数顺序。
- RVA、必要的 native 入口、MethodInfo 使用方式和虚调用槽；未确认槽位必须标为 unresolved。
- 调用者、被调用者、调用次数、初始化/每帧/每子步/回调生命周期阶段。
- 分支条件、列表遍历方向、比较符号、整数/浮点转换和早退条件。
- 与 `Awake`、初始化、`Update`、`ExecUpdate`、Setup、Reset、callback 和 dispose 的相对顺序。

对每个相关字段至少记录：

- owner、字段类型、offset、静态/实例属性。
- 初始化写入 owner、运行期写入 owner和读取 owner。
- 数值是否使用 Float32、整数有无符号、字符串是否与数值成对更新。
- 对象池、活跃列表、待激活批次、组游标和四个历史计数器的所有权。

必须形成从 `InGameDirector.Update` 到 `InGameManager.ExecUpdate`、`NoteManager.ExecUpdate`、时钟推进、BPM 更新、Note 更新和批次激活的完整调用图；图中的未知边不得以命名推定补齐。

## 6. 谱面构造结果到运行时的接入证据

必须取得能够证明运行时输入来源和所有权的证据：

- 原作实际消费的原始 BMS 完整字节、SHA-256 和资源定位链。
- bundle、解包资源和 BMS 内容之间的一致性证明。
- `startBpm` 数值及未经重新格式化的原字符串。
- 所有 CC03/CC08 命令的 bar、numerator、denominator、absolutePos、ccNum、BPM 数值和原字符串。
- `NoteBatchInformationList` 的批次顺序、每批 `informationList` 顺序和同位置记录身份。
- 同一批次多个 CC03/CC08 时，只选择源序首个命令的静态与动态证据。
- BPM change count 的计算范围，并明确证明起始 BPM 不计入 change count。
- chart 结果到 Note 批次、Note 对象池、BPM 对象池、待激活组和组游标的映射。
- Long/Slide 共享节点和非 playable command 不被重复实例化为 playable root 的所有权证据。

这些证据只证明运行时接入，不允许在 `createSimulatorEngine` 中重新解析 BMS，也不允许为方便测试向原作形状的 `NoteInformation` 添加 `fixtureId`、`sourceOrder` 等字段。

## 7. 60/120 目标帧率请求证据

必须分别取得同一原作版本下 60 和 120 两条闭合链：

- `highFrequencyMode` 的存储字段、读取 owner 和设置来源。
- `InGameDirector.Awake` 或实际消费者的方法入口、分支条件和调用时机。
- false 到 60、true 到 120 的 `Application.targetFrameRate` 请求值。
- 每次初始化的请求次数、重复初始化行为和 dispose 时是否存在反向请求。
- 目标帧率请求相对 gameplay 对象初始化的事件顺序。

这组证据只证明原作发出了 60/120 请求，不证明 Surface、浏览器、显示器或设备实际以对应物理 cadence 运行。物理 pacing 不属于本阶段复原范围。

## 8. 初始双音乐时钟与 launcher lead

必须在进入 gameplay 后、第一帧更新前后记录初始化链，并闭合：

- 主时钟初始 bar、beat、absolute position。
- launcher 时钟初始 bar、beat、absolute position。
- `CurrentBPM`、`CurrentBPMString`、`NextBPM`、`NextBPMString` 的初始值。
- basic/start BPM 与 current/next BPM 的赋值关系。
- launcher lead-time 的来源字段、单位、计算公式、写入 owner 和写入时机。
- `SetupFirstGameProgress` 或等效初始化方法调用前后的全部相关字段快照。
- 首个 BPM command 位于 launcher window 时，next BPM 首次改变的准确 frame/substep。
- 所有 Float32 字段的原始 32 位 bit pattern。

初始位置、lead 或 BPM 字符串中任一项无法确认，都必须停止 S05 和 S06；不得由宿主参数、常量猜测或零值默认补齐。

## 9. 双时钟逐子步推进证据

每一个被采集 frame 必须拆成明确 substep，逐步记录：

- 外层 `deltaTime`、外层 `ExecuteFrame`、最终 substep 数。
- 每子步 delta 和每子步 `ExecuteFrame`。
- 子步前后的主 bar、beat、absolute position 和原始 float bits。
- 子步前后的 launcher bar、beat、absolute position 和原始 float bits。
- 该子步读取的 CurrentBPM/字符串与 NextBPM/字符串。
- 主时钟使用 CurrentBPM、launcher 使用 NextBPM 的读取证据。
- 192 刻度和 `240 / BPM` 参与计算的指令或托管层等价证据。
- 过 192 时只执行一次减法和一次 bar 增量的单次 carry。
- 音乐位置 callback 的调用次数及其相对时钟推进、BPM Update、Note Update 的事件序号。

至少要覆盖普通推进、恰好到边界、跨小节、一次大 delta 跨越超过一个小节理论范围、current 与 next BPM 不同五类情况。

## 10. BPM command 完整生命周期证据

对 CC03 和 CC08 必须分别记录一条从批次等待到对象回收的完整生命周期：

1. 批次激活前的组游标、launcher 位置和批次位置。
2. 批次被选择的 frame/substep 和比较条件。
3. 扫描 `informationList` 时的源序及首个 CC03/CC08 选择结果。
4. `NextBPM` 与 `NextBPMString` 的写入值、写入 owner 和准确事件序号。
5. BPM 对象池 acquire 前后游标、对象指针和是否为复用对象。
6. `NoteBpmChange.Setup` 的参数、绑定的 `NoteInformation` 身份和全部已确认字段。
7. active flag 变化和专用 active BPM list 的追加位置、Count、顺序和成员身份。
8. 每子步正序 Update 的调用顺序。
9. bar 与整数 beat threshold 的比较输入、转换方式、符号和比较结果。
10. 到点后 `UpdateBPM(value, string)` 对 current BPM 及字符串的写入。
11. `isActive = false`、callback、列表即时移除的准确先后顺序。
12. Reset/回收后的字段状态、池游标变化和下一次复用状态。

还必须闭合以下分支：

- 同批含多个 BPM record 时只消费首个，其他记录不建立 active command。
- launcher 已跨过多个待激活批次时，每子步只激活一个批次，不循环追赶。
- 跨 bar command 与同 bar command 的阈值行为。
- command 不是 playable root，不进入主 Note active list。
- BPM active list 在主 Note active list 之前更新。

不得以预排序 TempoMap 或“应用所有已过期 command”的批处理结果替代上述对象生命周期。

## 11. 自适应子步证据

静态证据已给出算法骨架，仍需在真实运行或同等强度的原作运行证据中记录其状态输入和分支结果：

- `ExecuteFrame = min(deltaTime * 60, 1)` 的原始 Float32 输入、中间值和输出。
- BPM change count 为零时固定单步，且四计数器完全不更新。
- BPM change count 非零时，1、2、3、4 子步的实际选择。
- 四个持久 `uint` 计数器在 frame 前后和 bucket 增量后的值。
- 严格阈值 `<0.0179999992`、`<0.0329999998`、`<0.0500000007` 及 else 分支。
- 当前 bucket 先增量，再执行历史回退判断的顺序。
- 比较对象是 `counter[1] > 100`、`counter[2] > 20`、`counter[3] > 5`，分别对应 `101/21/6` 边界并导致当次使用单步。
- `counter[0]` 只记录 `<0.0179999992` bucket，不参与回退比较。
- `uint` wrap 行为；若无法生产触发，可由已闭合指令语义证明，并标记为静态闭合。
- 最终 delta 和 ExecuteFrame 同时除以 substep 数，且各子步总和守恒。

样本必须包含受控慢帧或等效原作 stall，以实际触发 2/3/4 子步。不能用模拟器合成结果冒充原作动态轨迹。

## 12. 两阶段调度与列表突变证据

每个 substep 必须以统一事件序号证明以下顺序：

1. 主/launcher 双时钟推进。
2. active BPM list 正序 Update。
3. 主 Note active list 从 `Count - 1` 开始反序 Update。
4. Update 后仍存活的对象按记录顺序执行 AfterUpdate。
5. 只检查并激活当前一个待激活批次。

同时必须记录：

- substep 开始时主 active list 的 Count、顺序和指针身份。
- 每次 Update 使用的固定递减索引与调用对象。
- Update 中对象自移除后的实时列表状态。
- `refExecuteNotes` 或等效 survivor 容器的追加时机、顺序和成员身份。
- Deactive 对象不进入 AfterUpdate 的证据。
- AfterUpdate 不从突变后的 active list 重建的证据。
- 组内按 `informationList` 源序 acquire、Activate、追加 active list 的过程。
- 新激活组在当前 substep 不 Update，在下一 substep 重新读取 Count 后首次反向 Update。
- 同时音符、多个对象自移除和下一子步 Count 变化。
- pool cursor、NoteGroupIndex 和 active list 在每个事件前后的状态。

若后续具体 Note 行为会引入跨 Note 删除，必须随对应 Note 阶段另取证；本阶段不能伪造未确认的跨对象 callback 来扩展调度语义。

## 13. 暂停与恢复证据

至少在 BPM command 激活前、驻留中和切换后各覆盖一次暂停/恢复，记录：

- `GameState`、`PauseState` 及阻止 `ExecUpdate` 的实际门条件。
- 暂停请求、状态生效、最后一个正常 substep 和恢复后第一个 substep 的事件序号。
- 暂停前、暂停期间每个 host frame、恢复后的主/launcher 时钟。
- current/next BPM 数值和字符串。
- active BPM list、主 Note active list、成员顺序和 active flag。
- NoteGroupIndex、Note pool cursor、BPM pool cursor。
- 四个自适应历史计数器。
- 暂停期间无时钟推进、无 BPM Update、无 Note Update、无组激活、无池变化。
- 恢复后从原状态继续，不重建、不补跑、不调用 snapshot replay。

暂停 UI、恢复倒计时、音频设备暂停和平台生命周期细节不属于本阶段，除非它们直接改变上述调度状态且能闭合 owner。

## 14. 判定偏移时钟证据

必须为 `GetAdjustMusicPos`、`FastAbsolutePos`、`SlowAbsolutePos` 或其实际方法建立静态和动态闭合：

- offset 的字段类型、符号、设置来源和允许范围。
- offset 为零时返回原 MusicPos。
- 正 offset 每次执行 `+1/60` 秒，重复 N 次。
- 负 offset 每次执行 `-1/60` 秒，重复 N 次。
- 正向 `FastAbsolutePos` 每一步按当时位置重新查询 BPM；负向 `SlowAbsolutePos` 在跨回上一 bar 时继续使用调用时已提交的 CurrentBPM，不回查前一 bar 的旧 BPM。
- 正向 carry、负向 bar 借位及 absolute position 结果。
- 每一步输入/输出 bar、beat、BPM 和 Float32 bit pattern。
- 跨 BPM、跨 bar、正负往返和边界值样本。

生产 UI 已观察到 `-5` 与 `+5` 两端点；超出该生产 UI 范围的输入不属于已确认行为，必须返回
`evidence-required`，不能自行 clamp 或外推。

## 15. 必需生产样本矩阵

下表中的每一行必须由原作实际消费的生产谱面或明确登记的实体设备输入覆盖。一个样本可以覆盖多行，但 manifest 必须逐行标注。

| 样本 | 必须验证的核心分支 |
| --- | --- |
| 普通零 BPM-change，60 模式 | 起始 BPM、单步门、双时钟、基础调度 |
| HABAHIRO 零 BPM-change，60 模式 | 宽谱构造结果接入、单步门、批次顺序不被改写 |
| 非零 CC03，60 模式 | launcher 预告、next/current 切换、完整对象生命周期 |
| 非零 CC08，60 模式 | CC08 识别、数值和原字符串、完整对象生命周期 |
| 同一非零样本，120 模式 | 120 请求、不同 host delta 下相同事件语义 |
| 跨 bar BPM command | bar/整数 beat threshold、carry 与切换顺序 |
| 同批多个 BPM record | 只消费源序首个 command |
| launcher 跨过多个待激活批次 | 每子步只激活一个组 |
| 慢帧 2/3/4 子步 | 三个严格阈值、delta 与 ExecuteFrame 平分 |
| 历史回退 101/21/6 | 持久计数器与当次单步回退 |
| BPM 激活前暂停/恢复 | 未激活组和全部状态冻结 |
| BPM 驻留中暂停/恢复 | active command、列表、池和时钟冻结 |
| BPM 切换后暂停/恢复 | current/next/string 和后续调度续跑 |
| 判定正 offset 跨 BPM | 逐 1/60 秒查询 tempo |
| 判定负 offset 跨 BPM command 边界/跨 bar | 逐步回退、借位、保持已提交 CurrentBPM 和 Float32 结果 |

无法取得的生产分支必须保留为 unresolved 并继续阻断对应实现，不得用合成数据、Python 原型或模拟器预期输出冒充实体闭合。

## 16. Trace 最低字段规范

每条原始或规范化 trace event 至少包含：

- schema version、run ID、frame ID、substep ID、event ID 和父事件 ID。
- host monotonic timestamp、原作线程 ID 和线程名。
- 事件类型、owner、方法、模块、RVA 和运行地址。
- `this` 指针及所有相关对象指针；空指针必须显式记录。
- before/after snapshot，不能只记录最终值。
- Float32/Float64/整数的原始 bytes 或 bit pattern、类型和解码值。
- 主/launcher bar、beat、absolute position。
- current/basic/next BPM 数值和原字符串。
- active BPM list 与 active Note list 的 Count、有序成员指针和 active 状态。
- BPM pool 与 Note pool 的容量、cursor、acquire/return 对象身份。
- NoteGroupIndex、当前批次身份、批次 absolutePos 和 `informationList` 源序投影。
- 四个自适应计数器、外层与子步 delta、外层与子步 ExecuteFrame。
- command 的 bar、numerator、denominator、absolutePos、ccNum、BPM 数值和原字符串。
- BMS SHA-256、bundle SHA-256、命令与源 BMS 的匹配结果。
- 采集异常、丢事件、重入或字段读取失败标记；不得静默跳过。

trace label 必须与原作字段名分栏存储。若某个字段只有 offset 而无确认名称，应使用 `owner+offset` 作为稳定身份。

## 17. Reverse 最终调查产物

最终应在 Reverse 提交以下目录，名称可调整，但职责不能缺失：

`artifacts/investigations/clock-scheduling-runtime-oracle/`

- `README.md`：范围、版本、方法、确认事实、推定、未解决项、排除项和结论。
- `targets.tsv`：owner、方法、RVA、签名、字段 offset、类型、hook/读取用途。
- `environment.json`：第 4 节全部环境与二进制身份。
- `sample_manifest.json`：第 15 节样本矩阵、资源路径、字节数、SHA-256 和覆盖项。
- `sources/`：原始 BMS、必要的独立谱面表示及其来源登记。
- `traces/raw/`：不可修改的原始逐事件输出。
- `traces/normalized/`：可比较的规范化 frame/substep/event 轨迹。
- `summaries/initialization.json`：双时钟、BPM 和 launcher lead 初始化闭合。
- `summaries/bpm_lifecycle.json`：CC03/CC08 生命周期和列表/池状态。
- `summaries/adaptive_substeps.json`：阈值、计数器、回退和守恒。
- `summaries/scheduling_order.json`：BPM-before-Note、反向 Update、AfterUpdate 和批次激活。
- `summaries/pause_resume.json`：冻结字段和原位续跑。
- `summaries/judge_offset.json`：正负 offset 的逐步结果。
- `closure.json`：本清单每个 requirement ID 的状态、证据路径和阻断理由。
- `SHA256SUMS` 或等价 manifest：目录内所有冻结文件的完整 SHA-256。
- `verify_runtime_oracle.py`、`verify_runtime_oracle.mjs` 或等效校验器。
- 必要的反编译、汇编、元数据摘录；只保存闭合结论所需最小范围。

校验器至少检查：文件存在、bytes/hash、schema、必填字段、事件单调性、列表身份一致性、样本覆盖、静态约束、动态生命周期和 unresolved 硬门。校验器不得依赖设备、网络、GarupaEditor 或 Reverse 未提交工具。

## 18. S03–S10 证据映射

| 任务 | 必需证据 |
| --- | --- |
| S03 谱面接入 | 第 4、5、6、15、16、17 节；重点是 BMS 身份、BPM change count、批次顺序、对象池与所有权 |
| S04 60/120 请求 | 第 4、5、7、15、16、17 节 |
| S05 双音乐时钟 | 第 4、5、8、9、15、16、17 节 |
| S06 BPM 消费 | 第 4、5、6、8、9、10、15、16、17 节 |
| S07 判定偏移 | 第 4、5、6、9、14、15、16、17 节 |
| S08 自适应子步 | 第 4、5、9、11、15、16、17 节 |
| S09 两阶段调度 | 第 4、5、9、10、11、12、15、16、17 节 |
| S10 生产验收 | 第 3–17 节全部证据，以及最终 Reverse 提交和 GarupaEditor 冻结一致性 |

任何任务只能消费已经在 Reverse 提交并通过校验器的证据。某一分支 unresolved 时，对应实现必须失败关闭，不能以 no-op、默认值或兼容层维持表面可运行。

## 19. 硬停止条件

出现以下任一情况，停止对应实现并回到 Reverse：

- 初始主时钟、launcher 时钟、launcher lead 或 BPM 数值/字符串未闭合。
- 首个 BPM command 设置 NextBPM 的准确 substep 未闭合。
- command 在专用 active list 的驻留、UpdateBPM、inactive、callback、即时移除顺序未闭合。
- BPM change count、同批首个 command 或批次激活规则存在冲突。
- 60/120 只取得设置值而没有实际请求消费者证据。
- 自适应阈值、计数器持久性、增量顺序或 `101/21/6` 回退存在冲突。
- 两阶段调度的列表遍历、突变、AfterUpdate 或新组延迟顺序存在冲突。
- 暂停期间任一调度字段是否冻结无法确认。
- offset 允许范围、逐 1/60 秒或正负方向各自的跨 BPM 语义无法确认。
- 静态与动态证据冲突且尚未在 Reverse 复核。
- 采集导致原作控制流、BPM、delta、列表或对象状态发生改变。
- trace 丢事件、对象身份不稳定、字段读取失败却无法界定影响范围。
- 证据未提交、无完整哈希、无法由校验器复核，或依赖未跟踪 `runtime/tools/`。

## 20. 解除 S02 硬门的完成条件

只有同时满足以下全部条件，才能将 S02 标记完成并开始 S03：

1. 第 4–17 节全部必需项进入 Reverse 的一个明确提交。
2. 第 15 节样本矩阵全部闭合；静态可完全证明而无需动态触发的极端分支必须在 `closure.json` 单独说明。生产样本不可用或观察改变可达性的分支必须作为显式阻断边界保留，不能按“采集完成”处理。
3. 初始双时钟、launcher lead、current/next BPM 数值和原字符串全部闭合。
4. CC03 与 CC08 的完整对象生命周期、列表顺序、池复用和切换时机全部闭合。
5. 60/120 请求、双时钟逐子步、adaptive 1–4 子步、调度突变、暂停恢复和 offset 结果均可由校验器复核。
6. Reverse `closure.json` 不存在阻断 S03–S10 的 unresolved 项。
7. Reverse 最终提交除明确排除的 `.claude/` 与 `runtime/tools/` 外，不依赖未跟踪文件。
8. GarupaEditor 任务书填写最终 Reverse 锁定提交，并将新增 R 系列证据完整冻结到 `tmp/simulator-reverse-evidence/clock-scheduling/`。
9. Reverse 源文件、GarupaEditor 冻结副本、manifest 和 Git index 的 bytes/SHA-256 全部一致。
10. 在解除硬门前不以任何 GarupaEditor 代码或测试结果替代缺失原作证据。

## 21. 当前状态与已有试跑处理

- E01–E26 静态证据仍以 `74ab76f6838847d98aae1a15741a5f024e3774ff` 为源基线；当前运行时冻结提交为 `f71f73fd2e408cfc888c5bbcce0a59c8eb73b18d`。
- 锁定包版本为 `10.1.4 / 230`；`closure.json` 的 `version_10_1_4.sample_matrix` 是唯一 S02 门控矩阵，10.1.3 顶层矩阵仅作独立历史样本和跨版本佐证。
- 60/120 请求、普通零 BPM、CC03/CC08、三类暂停、正负 offset、跨 bar command、反向索引 Update 均已闭合；旧批次中关于这些项目的 `unresolved`/`partial` 只保留为历史记录，不代表当前状态。
- 慢帧 2/3/4 分支为 `observed-collector-induced`：可确认原作在被观测状态下的分支和守恒关系，但不能把采集器诱发的 delta 分布外推为未插桩客户端分布。
- `counter[3]` 的 6-frame 回退已动态确认；`counter[1]`/`counter[2]` 的 101/21-frame 阈值静态比较已确认，动态样本受观察扰动/运行时可达性限制，保持 fail-closed。
- HABAHIRO 行受限时活动谱面不可选择；30-slot BPM pool cursor-wrap 受当前生产谱面最多 16 条 BPM commands 限制。二者改列只读捕捉前提下无法明确的非阻断项：根据已有证据进行还原，无法依赖实体证据，不确保百分百还原。
- UI owner、持久字段、60/120 read site 已闭合；radio 到 persisted field 的具体 callback 未端到端观察，只作为设置写入链的解释边界，不推翻帧率请求结论。
- Reverse 未跟踪的 `runtime/tools/` 与 `runtime/captures/` 不属于证据链。后续不得用合成谱面、旧模拟器或未登记工具替代上述边界。
- Reverse 校验器仍原样输出 `S02 remains blocked`；GarupaEditor 不修改该冻结结论，但本地门控只保留低 bucket 动态触发边界，HABAHIRO 与 BPM pool cursor-wrap 不再阻断。

## 22. 已冻结中间运行时证据批次

以下 R01–R09 均锁定到 Reverse 提交 `2aee4dbe486be1feda9fdf28cb94d14204058f42`。它们可用于复核当前进度，但在第 20 节全部条件满足前不得复制为最终解锁证据或被 S03–S10 实现消费。

| ID | Reverse 相对路径 | SHA-256 | 状态 |
| --- | --- | --- | --- |
| R01 | `artifacts/investigations/clock-scheduling-runtime-oracle/README.md` | `D662BA7D5EF5385025FC7085A793A647F28C4ABE35F6A2FA6EC725A5AF29F169` | `confirmed-partial` |
| R02 | `artifacts/investigations/clock-scheduling-runtime-oracle/environment.json` | `AC20F0BD890555E40956C2E5D6F65D65BCD60E51DF3CA6925D644F1D2B8011D6` | `partial` |
| R03 | `artifacts/investigations/clock-scheduling-runtime-oracle/sample_manifest.json` | `FA50BDE3B6294092F8D798BFDD95AA2A53A0C4BC827A7D561EF0DAD9E0414F7B` | `partial` |
| R04 | `artifacts/investigations/clock-scheduling-runtime-oracle/summaries/initialization.json` | `927761F584AA39DB78EC6932CF58A4FAD177E3ABF889E166791DBC05B0BB496E` | `confirmed-60-cc03-cc08` |
| R05 | `artifacts/investigations/clock-scheduling-runtime-oracle/summaries/bpm_lifecycle.json` | `6DFF2BE87167F5DEB8622013506271BFDE61468C1772C01418CC1F6F352E992D` | `partial-reset-reuse-unresolved` |
| R06 | `artifacts/investigations/clock-scheduling-runtime-oracle/traces/raw/ikuoku-cc08-run-003.jsonl.gz` | `4F66364768D07900A4BAD9147FDBCCF3663D9F9265E943B4EB1CFB6ACDEEE27A` | `confirmed-cc08-raw` |
| R07 | `artifacts/investigations/clock-scheduling-runtime-oracle/sources/653_ikuoku_easy.bms.txt` | `4C2F8D202DED5DFD9C4144C0FE000B1E3524E0F25D3FEAF4DD102413F6CD6325` | `confirmed-runtime-bms` |
| R08 | `artifacts/investigations/clock-scheduling-runtime-oracle/closure.json` | `3BC26B4B416DFB64B520DF149AC652C4A6D06A6343786F2F47A2A6FC4E9D1F13` | `unresolved-fail-closed` |
| R09 | `artifacts/investigations/clock-scheduling-runtime-oracle/verify_runtime_oracle.py` | `D141A555872BFC23ADC3688AE1B3A6B9C3506AD769E38975FF03FBD10691CF03` | `confirmed-offline-verifier`（已被 R22 取代） |

## 23. 第二批运行时证据（提交 `3051532a`）

采集环境与第一批相同：`FICIPZUGEIQC4P7H`（OPPO A56 5G / PFVM10，LineageOS 20 GSI，Android 13，arm64），
`frida-server-17.15.3`（SHA-256 `6FC94038ACC834AFFF23AB18C71E3B05BE27A3E3BCB79A1A215B6C36AA973977`），
监听 `127.0.0.1:47913`（非默认端口，规避 libsoup 致命断言的 accept 竞态）。

### 23.1 采集器变更（影响证据可信度的前置条件）

按 `docs/RUNTIME_CAPTURE_STABILITY.md` 重构主机侧：`on_message` 只入队；序列化、哈希、落盘、
`script.post` 与设备输入全部移到写线程；按批而非按事件 flush。每条采集在
`capture_metadata.json.collector` 中记录 `max_queue_depth_batches` 与 `fault_count`；
七条采集全部为 `max_queue_depth_batches = 1`、`fault_count = 0`、`collection_complete = true`。

### 23.2 新增采集（R10–R16）

| ID | run_id | Reverse 相对路径 | SHA-256 | 事件数 | 覆盖项 |
| --- | --- | --- | --- | ---: | --- |
| R10 | `ikuoku-cc08-run-020-scheduling-60` | `artifacts/investigations/clock-scheduling-runtime-oracle/traces/raw/ikuoku-cc08-run-020-scheduling-60.jsonl.gz` | `0CAF4DEA8F56D2B98158FE6960F914A031065454D81A0E12F25B00A70618F1DC` | 47,587 | 60 请求、双时钟初始化、launcher lead、CC08 生命周期、自适应 2/3/4、历史回退、两阶段调度 |
| R11 | `ikuoku-cc08-run-021-pause-during` | `.../traces/raw/ikuoku-cc08-run-021-pause-during.jsonl.gz` | `D9D0FC2BCA70E6538B31A8230BBD8F83AD6897ACBD6AC78AA048C25370E2E4DA` | 57,369 | BPM 驻留中暂停/恢复 |
| R12 | `ikuoku-cc08-run-022-pause-bracket` | `.../traces/raw/ikuoku-cc08-run-022-pause-bracket.jsonl.gz` | `05EDE793D443B9DBBB54D0F2F83B0B75A3C0E0B5AFF70A396D6ED715D767F018` | 56,989 | BPM 激活前 / 切换后暂停/恢复 |
| R13 | `tentai-zero-run-023-warm-process` | `.../traces/raw/tentai-zero-run-023-warm-process.jsonl.gz` | `83F3DD7E3055250965D68901E7F34BE3AC81136AA1F05A5F146B878000F491C0` | 54,652 | 零 BPM-change 60 模式（热进程） |
| R14 | `tentai-zero-run-024-fresh-process` | `.../traces/raw/tentai-zero-run-024-fresh-process.jsonl.gz` | `B0C892FDB07E64A61E0AA680330BA8E7477154ACE05A43BA76BA825366233B0A` | 49,804 | 零 BPM-change 单步门（冷进程） |
| R15 | `ikuoku-cc08-run-025-offset-plus5` | `.../traces/raw/ikuoku-cc08-run-025-offset-plus5.jsonl.gz` | `6B3F0A9A8E33D363BE5415F25BB105B845B01D2898B0716778275E9E0F4B7CF4` | 55,065 | 正 offset 跨 bar 与跨 BPM |
| R16 | `ikuoku-cc08-run-026-offset-minus5` | `.../traces/raw/ikuoku-cc08-run-026-offset-minus5.jsonl.gz` | `01A2F4320A9EC569BF9B66EDE3B51A6B6E2904985AB0A566C109BC82982B429A` | 55,516 | 负 offset 借位 |

### 23.3 新增归纳与校验产物（R17–R22）

| ID | Reverse 相对路径 | SHA-256 |
| --- | --- | --- |
| R17 | `artifacts/investigations/clock-scheduling-runtime-oracle/summaries/pass2_adaptive_substeps.json` | `C9B3DBE8447700776829FD109EE9D5A6D8C5160203F822B91823178FA32981C4` |
| R18 | `artifacts/investigations/clock-scheduling-runtime-oracle/summaries/pass2_pause_resume.json` | `29C483BFEC4D9C08E3BD7771243739ED88D569AF770A013A7986F9789E963165` |
| R19 | `artifacts/investigations/clock-scheduling-runtime-oracle/summaries/pass2_judge_offset.json` | `79FC58F54436031C6572D4DF7260C7B0336D03D4604691C3647A7511EA17AE92` |
| R20 | `artifacts/investigations/clock-scheduling-runtime-oracle/summaries/pass2_initialization.json` | `D0228F841F753BB812CECCC87ABF16069BFE921A32CAB92E3ED9D9A2D9C17B95` |
| R21 | `artifacts/investigations/clock-scheduling-runtime-oracle/summaries/pass2_scheduling_order.json` | `47D4F402CF3C9576FEC7D864605EE17748F8A8A0C929BAB51EF2F386471F4AEA` |
| R22 | `artifacts/investigations/clock-scheduling-runtime-oracle/verify_runtime_oracle.py` | `69A2C667D685DAE552534A15FF1F76FD2CDA3822E87897BF9191D649873CA4BF` |

同批更新：`closure.json` = `76AB41AB5B2A6D878F86FBA4840B528F54E0B4E0B0CB82F25922712BCFE2E431`，
`sample_manifest.json` = `F1085489136F5053158A64409A44814BB337112C1BB2AC749DF1C2DB2B325E41`，
`README.md` = `583E2BE6DA4BB8F570F19B0DC3C2CA97EEC3E645960DFFD71A844BE57E004E53`，
`SHA256SUMS` = `2DC2E0B98568D8A2AA9CE292D3FCDD5644DF251968BF93AF4045F0BCE10A7E2C`（69 条）。

R22 离线输出 `clock scheduling runtime oracle: verified (pass 1 + pass 2); S02 remains blocked`，
不依赖设备、网络、GarupaEditor 或未跟踪的 `runtime/tools/`。

### 23.4 本批闭合的结论

- **第 11 节自适应回退的计数器映射被修正。** `ExecUpdate @ 0x37760C0` 比较的是 `NoteManager+0x78`
  处 `uint[4]` 的 `+0x24` / `+0x28` / `+0x2C`，即 `counter[1] > 100`、`counter[2] > 20`、
  `counter[3] > 5`；`counter[0]` 只在 `delta < 0.0179999992` 时自增，从不参与比较。
  六条采集全部在 `counter[3]` 达到 6 的那一帧回落到单步，其中 R11、R12 此时 `counter[2]` 仍为 1，
  排除了原先「`counter[2] >= 6` 对应 bucket 2」的读法。`101 / 21 / 6` 三个边界值不变。
  第 23 节形成时，旧版清单仍写作「`counter[0] > 100`、`counter[1] > 20`、`counter[2] >= 6`」
  并称第四计数器不比较；当前第 11 节已经按上述证据更正，实际只记录不比较的是**第一个**计数器。
- **第 11 节零 BPM-change 分支闭合，但有前置条件。** R14（冷进程首曲）3,100 帧对 3,100 子步、
  零自适应判定、零 bucket 自增；R13 同一谱面在已解析过 BPM-change 谱面的进程中取自适应路径 1,726 次。
  单步门读取的是进程累积的 `NoteManager+0x74`，因此复现该分支必须重启客户端。
- **第 13 节暂停/恢复三类样本全部闭合。** 三段冻结中 `InGameManager.ExecUpdate` 持续被调用
  （每段 2,036–3,780 次），而 `NoteManager.ExecUpdate` 完全未进入，时钟子步、BPM Update、
  Note Update、批次激活均为 0 次。恢复后的首帧是暂停前那一帧的直接后继，且只前进一个普通帧的量，
  没有补跑暂停期间的墙钟时间。观测到的路径为 `onExecutePause`（GameState 5，PauseState 0→1）→
  `onPauseSound`（GameState 5→7）→ `onClickResume`（PauseState 1→0）→
  `onFinishResumeCountdownAnimation`（PauseState 0→2）→ `resumeGame`（GameState 7→5）；
  `InGameStateController.ChangeGameState` 在任何一条采集中都未触发。
- **第 14 节正 offset 闭合。** R15 帧 991：第 0–3 步在 bar 15 以 BPM 99.5 每步前进 1.32667 刻度，
  第 4 步进位到 bar 16 并重新查得 BPM 95.5，第 5 步改以 1.27333 刻度前进——证明每步按当时位置
  重新查询 BPM，而不是固定使用调用时 CurrentBPM。R16 证明负方向的 bar 借位
  （bar 5 beat 0.45483 → bar 4 beat 191.12817）。

### 23.5 截至第二批时的未闭合项与边界（历史快照）

- 采集器仍将客户端拖慢到约 20 fps（p50 delta `0.0497`）。主机侧不再是瓶颈（队列深度恒为 1 批），
  代价来自 agent 在原作进程内的逐帧快照。因此 2/3/4 子步样本属于**采集诱发的慢帧**，
  不得据此声称未插桩客户端的 delta 分布；分支映射本身因每次判定都记录了自身的 Float32 输入、
  所选 bucket、计数器数组与输出而成立。
- 七条采集均使用原作自带的**オートライブ**，以便谱面在无人工输入下跑完。时钟、BPM 与 Note 调度
  走的仍是正常路径，差异只在判定输入来源，且该模式会隐藏判定显示。
- `LiveCoreSettings.get_IsHighFrequencyMode` 在本批任何一条采集中都未触发，
  且客户端设置界面（ライブ設定 / ライブ演出・音量設定 / ライブスキン設定 / システム・通知設定
  以及组队确认页的齿轮）中未找到帧率开关，`shared_prefs` 中也只有 Unity 自身的键。
  **120 模式仍为 unresolved。**
- 负 offset 没有任何一次调用跨越 BPM 变化；offset 允许范围未闭合（只验证了 ±5）。
- Note detail 采用 1/30 占空比，未捕到长 active list 的完整反序 Update，第 12 节的固定递减索引
  仍未闭合。

## 24. 因第 23 节修订而需要刷新的静态哈希

| ID | Reverse 相对路径 | 旧 SHA-256 | 新 SHA-256 |
| --- | --- | --- | --- |
| E04 | `artifacts/investigations/music-bar-division-adaptive-substeps/README.md` | `6720E2EDBD1470004B6437FF245402B30097DD93DCECC248E0DA7C0ABCEFE92B` | `1248714B2CBAB4A556F21A1E87FC39984E79C6F79E49CB6B48BF698049FFCC34` |
| E05 | `artifacts/investigations/music-bar-division-adaptive-substeps/closure.json` | `09A4B3639384887135D60CC296E2D590D550F12D647941C1C508B62610586C0E` | `6323B886C8621EB94BFE9C47284D487179DD173CD9FA2C51A361B38EB12370F1` |
| E06 | `artifacts/investigations/music-bar-division-adaptive-substeps/targets.tsv` | `F0972AD43B68999901B2406B368C070FD25FD6CF1F288745A6B0589EDCE181BF` | 未变 |
| E14 | `artifacts/investigations/runtime-integration-prototype/note_manager_adaptive_substeps.json` | `260ACB365EEAD55A0C1F8D9219F762CA9AC4CF656E597C892B459886388B4D05` | `EC5C0CD7938828D50D5704B0FD0DAA492864F79DAC74F0FE34CDAA0723E39E71` |

Reverse 侧同时修正了执行体 `runtime_integration.py::advance_note_manager_performance` 的判定条件
并重写了断言旧映射的测试（448 测试全绿）。E01–E03、E07–E13、E15–E26 未受影响。

## 25. 采集设备升级到 10.1.4 / 230 及其处理

采集设备在第二批采集结束后（2026-07-27 05:57 本地）自动把 `jp.co.craftegg.band` 更新到
**10.1.4 / 230**。第 4 节禁止跨包版本合并证据，因此必须显式处理。

### 25.1 既有证据未被污染

十条冻结采集（pass 1 两条 + supplemental 一条 + 第 23 节七条）的 metadata 全部记录
`10.1.3 / 229`，升级发生在最后一条跑完之后。`verify_runtime_oracle.py` 现按 manifest
逐条固定每条采集的包版本，并拒绝任何 manifest 未登记的 `traces/raw/` 轨迹。

### 25.2 重建基线的结论：算法面在两版之间未变

`artifacts/investigations/package-version-rebaseline-10-1-4/` 用四种互相独立的检查完成迁移：

| 检查 | 结果 |
| --- | --- |
| 70 个钩子按 `Owner$$Method` 重新解析 | 全部找到，**签名零变化** |
| 7 个指令探针 | 在各自函数内相同偏移处**逐字节相同** |
| 6 个 `.rodata` 常量 | 按上下文唯一重定位，位模式不变 |
| agent 读取的 8 个类型的字段 offset | **全部未动** |

方法地址位移只有三个取值（`-3772` ×39、`-3672` ×28、`-2628` ×3），`.rodata` 整体 `-960`。
`libunity.so` 两版字节一致；`libil2cpp.so` 有 1748/1829 个 64KiB 块不同，元数据与 Il2Cpp
版本仍为 31。

因此第 5–14 节所依赖的托管层方法集合、签名、字段布局、自适应阈值与探针指令在 10.1.4 上
与 10.1.3 一致。这**不**代表两版证据可以合并，只代表同一套采集工具在两版上都成立。

### 25.3 第 7 节 120 模式请求：已在 10.1.4 闭合

`InGameDirector.Awake` 内联读取 `LiveCoreSettings +0xA9`（`get_IsHighFrequencyMode` 恰为
`return *(uint8 *)(this + 169)`，从不被调用，这解释了为何属性 getter 钩子八条采集都没触发），
60 走 `0x3C`、120 走 `0x78`，再交给 `DeviceUtility.SetTargetFrameRate`。

设置项位于 **`ライブ演出・音量設定`** 页的 `フレームレート`（`120FPS` / `60FPS`），
UI 属主为 `LiveEffectVolumeTabPage`，持久化经 `CE.LiveCoreSettingsProtoData.set_HighFrequencyMode`。

`ikuoku-cc08-run-030-120-mode`（47,712 事件，零故障）在 `120FPS` 设置下于
`InGameDirector.Awake` 内发出**唯一一次** `targetFrameRate(120)` 请求，位置与 60 模式完全相同。
该请求只证明原作意图，不证明物理刷新率。

同一条采集在跨版本上复现了 10.1.3 的冻结值：消费 BMS 逐字节一致、launcher lead
`79.5999984741211`、起始 `99.5`/`"99.5"`、提交 `95.5`/`"95.5"`。

**未闭合**：`LiveEffectVolumeTabPage.<initializeHighFrequencyMode>b__57_0` 按名解析成功且签名
未变，但切换单选框时未产生事件。编译器生成的 lambda 名是按位置编号的，10.1.4 中同名 lambda
可能对应不同闭包。设置来源由读取点与 UI 属主闭合，不由该回调闭合。

### 25.4 新增证据（R23–R30，Reverse 提交 `803ac909`）

| ID | Reverse 相对路径 | SHA-256 |
| --- | --- | --- |
| R23 | `artifacts/investigations/package-version-rebaseline-10-1-4/README.md` | `5E37640F8F9F0B24E10B016606FE46E9361F4005606BE82EBC00FF44761E09B5` |
| R24 | `artifacts/investigations/package-version-rebaseline-10-1-4/version_map.json` | `3F001E628649F206BC88231FC4AF5427A9858C566E207D8BD24519F43A6B971C` |
| R25 | `artifacts/investigations/package-version-rebaseline-10-1-4/targets.tsv` | `2295CCD41B1660EB666613A8A36D354D7B763C9E2DFF83DE2C1B433011819019` |
| R26 | `artifacts/investigations/package-version-rebaseline-10-1-4/verify_version_rebaseline.py` | `516E366BBFABB59A9794A791EDBF53376DB50E23C6BC3BA4559DB1A745F8AFE2` |
| R27 | `artifacts/investigations/clock-scheduling-runtime-oracle/summaries/frame_rate_request_120.json` | `DADE17A35A87B32047358C03F5884EAEE9D823931F3C954FE1C5900308D7831F` |
| R28 | `artifacts/investigations/clock-scheduling-runtime-oracle/traces/raw/ikuoku-cc08-run-030-120-mode.jsonl.gz` | `5E3732041EC5255C22413FFE7D81808D25FDF81FF84187645878AD0CD61A8547` |
| R29 | `artifacts/investigations/clock-scheduling-runtime-oracle/closure.json` | `A6014BF296D23A1B10BBEC92C156A6F551DA3F027951904B95E224E45A3D694F` |
| R30 | `artifacts/investigations/clock-scheduling-runtime-oracle/verify_runtime_oracle.py` | `EA6BB3C4C4CCBBA9D10CABD4A5A8AA589D577E73DA5EF020359C931B9889003F` |

同批更新：`README.md` = `54234B26797E8FE1B2C27292B0F50BA910C3F711E3E4F985E4FDF0FAE7F7785F`，
`sample_manifest.json` = `622C49E39C281423E7DFB4E0DCE6DBE84ECB45C9D262674703CF429258F0B9A9`，
`SHA256SUMS` = `E9756F99B93485F30B49818F0D0E48C023A5FD6FD4A48B98FAA5AF741E8CD771`（77 条）。

10.1.4 采集独立存放于 `sample_manifest.json` 的 `version_10_1_4_runs` 与 `closure.json` 的
`version_10_1_4`，校验器断言它们不出现在 10.1.3 的 `samples` / `supplemental_runs` 中。

### 25.5 对本清单的影响

- 第 7 节的 120 分支：在 **10.1.4** 上闭合；10.1.3 上仍为 unresolved，两者不合并。
- 第 15 节样本矩阵：`same_nonzero_120` 记为 `unresolved-on-10.1.3-confirmed-on-10.1.4`。
- 第 20 节解锁条件：若最终锁定提交选在 10.1.4，则第 15 节其余各行需在 10.1.4 上重采；
  若锁定在 10.1.3，则 120 一行仍缺。这一取舍需要在填写最终提交前明确。

## 26. 锁定版本决定：10.1.4 / 230

已决定把本阶段最终证据锁定在 **10.1.4 / 230**，剩余样本矩阵各行在该版本上重采，而不是把设备
回退到 10.1.3。

### 26.1 两版证据的关系

- 10.1.3 / 229 的全部冻结采集（第 22、23 节的 R01–R22）**保持原样**，作为该版本自身的闭合样本
  保留，并作为跨版本佐证；不与 10.1.4 轨迹合并，符合第 4 节。
- 决定 S02 的样本矩阵改为 Reverse `closure.json` 的 `version_10_1_4.sample_matrix`；
  顶层 `sample_matrix` 降级为"10.1.3 这一版本的闭合样本"。
- `closure.json` 新增 `locked_package_version` 记录该决定、目标集重建证明路径与门控矩阵位置，
  校验器逐项断言。

### 26.2 10.1.4 早期冻结采集（Reverse 提交 `b3987c23`）

| run_id | SHA-256（gz 原始轨迹） | 事件数 | 覆盖 |
| --- | --- | ---: | --- |
| `ikuoku-cc08-run-030-120-mode` | `5E3732041EC5255C22413FFE7D81808D25FDF81FF84187645878AD0CD61A8547` | 47,712 | 120 请求、CC08 生命周期、双时钟初始化、launcher lead |
| `settings-run-031-high-frequency-toggle` | `6A039427B35B4FC95846784D926A6A80FC67381EBE9B9AD65D1B010D7BC365E1` | 176 | 帧率设置 UI 属主 |
| `ikuoku-cc08-run-032-scheduling-60` | `B86489435A71E2B38AFD16E5B1CA13EFD7C2611B4694ECA0BC4E855C4AACF17F` | 47,030 | 60 请求、CC08 完整生命周期、跨 bar、两阶段调度、自适应 2/3/4 与历史回退 |
| `ikuoku-cc08-run-033-pause-bracket` | `64ED5433D9D43624A8F38336AA905DB7A4A46ED99964D602DD0EE304C99740B8` | 56,799 | BPM 激活前暂停、切换后暂停 |

四条均为完整采集（`collection_complete`、写线程零故障、主机队列深度 ≤1 批），且逐项复现
10.1.3 的冻结形状。

同批产物：`closure.json` = `5992DC041D2781450F290615F6FA56014C1AE9F6F7C79D83E4F8240DD81AF260`，
`sample_manifest.json` = `FFDB615DFC1E77C26DCEF8B6C6B300207430C6E1C11072E1424BFE53661BC9F0`，
`README.md` = `B72D648B01BE6C1AE4CD52608FF144256682342A28EBD8BB750BA11862F8DB58`，
`verify_runtime_oracle.py` = `1B6F7DF4C722768F551C33EF295A4371CEF0A307E89BFECC4C9544D645C88D68`，
`SHA256SUMS` = `74E9F71167D84F566B49049F2E22E1D0F0FF7E8A45E25BE51F919F18D1D66703`（83 条）。

### 26.3 10.1.4 样本矩阵当前状态

| 行 | 状态 |
| --- | --- |
| `same_nonzero_120` | `confirmed` |
| `nonzero_cc08_60` | `confirmed` |
| `normal_zero_bpm_60` | `confirmed` |
| `nonzero_cc03_60` | `confirmed` |
| `cross_bar_bpm_command` | `confirmed` |
| `pause_before_bpm` | `confirmed` |
| `pause_during_bpm` | `confirmed` |
| `pause_after_bpm` | `confirmed` |
| `positive_offset_cross_bpm` | `confirmed` |
| `negative_offset_cross_bpm_bar` | `confirmed` |
| `reverse_index_update` | `confirmed` |
| `slow_frame_2_3_4` | `observed-collector-induced` |
| `fallback_101_21_6` | `partial-counter3-confirmed-counter1-counter2-runtime-unreachable` |
| `habahiro_zero_bpm_60` | `blocked-chart-unavailable`（限时活动专属，账号上不可选） |
| `bpm_pool_cursor_wrap_reuse` | `blocked-production-chart-unavailable` |

### 26.4 已解除的 `blocked-network` 历史状态

本节原先记录的 `blocked-network` 已被后续受控试验纠正，不再是当前门控状态。失败由
`オートライブ` 开启导致，而不是 Frida 或一般网络不可达：同一进程中关闭该开关后 live 可立即启动。
旧失败未提交 live、未消耗 LP，也未产生 gameplay 帧；该历史记录不能作为运行时证据。

修正后的 runs 034–060 均在 `オートライブ OFF` 下完成。生命值归零只截断无人操作的 live；需要覆盖
后段边界时采用同一 live 的合法继续流程。后续不应把本节旧网络诊断恢复为当前阻断理由。

**安全边界**：失败对话框的 `コンティニュー` 会消耗 50 星石，不得点击。若未来确需重新采集，应选择
`リタイア` 并重新开始；当前没有普通待采任务，不应为刷新本清单再次操作账号。

## 27. 最终静态批次与显式边界（Reverse 提交 `f71f73fd`）

### 27.1 新冻结运行与结论

| run_id | SHA-256（gz 原始轨迹） | 事件数 | 当前结论 |
| --- | --- | ---: | --- |
| `tentai-zero-run-034-fresh-process-manual` | `FAF6E3FE6DFF21EFD0C74C2FF75286D4035F28B2FE4D31B005FFE6D823F03519` | 26,072 | 普通零 BPM-change 冷进程单步门 confirmed |
| `ikuoku-cc08-run-035-pause-during-setup` | `5AC0835BA1A73E131C76FDDE406795BC25CCDD879B4620327F27194EDD2E23A0` | 45,027 | BPM object 驻留时暂停进入 |
| `ikuoku-cc08-run-036-pause-during-resume` | `C5287FFA535DF2CC75795D6287A900FFD2C9C90B546EC8DE0D863D6B0FBEAEA7` | 13,685 | 同进程、同对象恢复并提交；与 run 035 组成 split capture |
| `thesis-cc03-run-037-nonzero-60` | `6651D95895FFBF4891592D0C719698D226DD82B6D2CDC4D557C040E38DB9C45E` | 36,309 | 10.1.4 CC03 85→140 完整生命周期 |
| `ikuoku-cc08-run-057-offset-plus5` | `7934C7344AB194C09AFFAC319E59327A50D830203B16EA285FE32716A1ECDBFA` | 40,811 | `FastAbsolutePos(+5)` 跨 bar 15→16，并从 99.5 切换到 95.5 |
| `ikuoku-cc08-run-059-offset-minus5` | `DC1D2DA15DF3323B7F8E747F9494DF80B05F290E6B9B28F4B85E51700CE451A0` | 38,253 | `SlowAbsolutePos(-5)` 跨 bar 16→15，全程保持已提交的 95.5 |
| `ikuoku-cc08-run-060-full-note-detail` | `E9B671CE2AB7A67BE79A9BD9E814B4F8A4FFEF5758359BDD2D7BB827972E3103` | 22,854 | 16/16 多成员 substep 与主 active list 反序一致 |

runs 061–067 是 fallback 可达性调参样本：全部使用 25 ms batch flush，无 autoplay、无触摸注入。
重探针立即扰动到 bucket 2/3；轻探针持续处于 bucket 0，最轻配置仅出现两个孤立 bucket-2 frame，
始终没有 bucket-1 frame，也无法累积 21 个 bucket-2 frame。因此它们冻结的是观察/运行时可达性边界，
不是仍需继续试采的普通任务。

### 27.2 当前关键产物哈希

| Reverse 相对路径 | SHA-256 |
| --- | --- |
| `artifacts/investigations/clock-scheduling-runtime-oracle/README.md` | `208AEE7F6CCCD105E992AC8470348410EFC4B162338CC145B5135D408B8F5DF7` |
| `artifacts/investigations/clock-scheduling-runtime-oracle/closure.json` | `F6262F123FD0C65129CD63612B304F082E577C6A398A302A6633EC3A3AE29AE4` |
| `artifacts/investigations/clock-scheduling-runtime-oracle/sample_manifest.json` | `6BC6B9F64F4DF5E8512A3D60B922D00FF4FDF29F99DA9CF86D72E2C8A8C5D224` |
| `artifacts/investigations/clock-scheduling-runtime-oracle/summaries/judge_offset_10_1_4.json` | `72ECA19B327A87D354DDEEA05AE280508D25270E267F4BF549EDAF802B7087D4` |
| `artifacts/investigations/clock-scheduling-runtime-oracle/summaries/reverse_index_update_10_1_4.json` | `E9FE9A8E1C2D4ED41C4FBA47AD986EEA268FC634AA7C979C11478C47C616BC9A` |
| `artifacts/investigations/clock-scheduling-runtime-oracle/summaries/cached_bpm_candidates_10_1_4.json` | `D2D1DA63569E8DC09BAB1439A89F03E2D0F9A8D1900FE2614E8085C453874BBB` |
| `artifacts/investigations/clock-scheduling-runtime-oracle/summaries/pause_during_bpm_10_1_4.json` | `A61535952FECCFFB935F671E2D44CC6B38AECC70BCAFF9FD62B90CEB8B1490E4` |
| `artifacts/investigations/clock-scheduling-runtime-oracle/verify_runtime_oracle.py` | `FC03EAA8E6B3C3D5883AB1AA57CA1016146DD43C915C168CABBB0073E213B7F7` |
| `artifacts/investigations/clock-scheduling-runtime-oracle/SHA256SUMS` | `AF04F94BA3BBA7EB59048DCD9409F6739D5C1186E6E69DDCEAF84AC54ED388C8`（108 条） |

`SHA256SUMS` 的 108 条记录是包内文件的权威逐文件清单；本节只列门控和结论所需的关键入口，
避免重复一份容易再次滞后的完整 manifest。

### 27.3 当前门控与非阻断保真度例外

1. `fallback_101_21_6` 是当前唯一阻断项：`counter[3]` 的 6-frame 分支动态 confirmed；`counter[1]`/`counter[2]` 的比较与阈值静态 confirmed，但动态触发受观察扰动/运行时可达性限制。
2. runs 061–067 已确认具体原因：重探针立即把帧扰动到 bucket 2/3；轻探针持续落在 bucket 0，最多只有两个孤立 bucket-2 frame 且没有 bucket-1 frame。因此无法同时保留必要观测并累积 101 个 bucket-1 或 21 个 bucket-2 frame；这不是阈值或映射未知。
3. `habahiro_zero_bpm_60` 为非阻断保真度例外：`786 miracle_april` SPECIAL 为限时活动谱面，当前账号不可选择；根据已有证据进行还原，无法依赖实体证据，不确保百分百还原。
4. `bpm_pool_cursor_wrap_reuse` 为非阻断保真度例外：完整缓存扫描覆盖 81 个 musicscore bundles、4,176 个 BMS；单谱最大 16 条，不足以触发第 31 次 acquire；根据已有证据进行还原，无法依赖实体证据，不确保百分百还原。
5. `slow_frame_2_3_4`：原作分支在采集器诱发慢帧下可复核，但该 delta 分布不能外推为未插桩客户端分布。
6. 帧率 UI 写入链：60/120 read site、持久字段和 UI owner 已闭合；radio→persisted field 的具体 callback 未端到端观察，仅为解释边界。
7. reverse-index 的主列表顺序已闭合；与主列表无指针对应关系的 nested child update 具体来源仍属解释边界，不改变 16/16 结论。

除以上明确声明的边界外，没有剩余普通采集或文档回填任务。HABAHIRO 与 BPM pool cursor-wrap 不再参与门控；低 bucket 动态触发边界仍按第 20 节阻断，
S02 仍保持 `blocked`，S03–S10 继续 fail-closed；不得把“普通任务已完成”误写成“动态证据全部闭合”。
