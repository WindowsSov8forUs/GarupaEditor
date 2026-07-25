# 模拟器第一切片实施任务书

## 1. 文档身份

- 目标分支：`codex/refactor-simulator-implementation`
- 上级计划：`tmp/simulator-reconstruction-plan.md`
- 唯一原作证据仓库：`HOST________\VSCode\GirlsBandParty-Reverse`
- 锁定证据提交：`326b305f14121d7a0e7e046410dac993147360cb`
- 锁定游戏样本：`jp.co.craftegg.band` 10.1.3（version code 229，`arm64-v8a`）
- 第一切片目标：建立原作引擎对象边界与确定性生命周期框架，不交付可见画面、音频、真实输入或主程序入口。
- 第一切片状态：T01–T11 已完成，验收结果见 `tmp/simulator-first-slice-acceptance.md`。

本任务书是第一切片的唯一执行依据。实施者不得从已删除的 GarupaEditor 模拟器、常见音游架构、个人经验或方便实现的默认值补齐原作行为。

### 1.1 执行进度

| 任务 | 状态 | 最近批次 | 结果 |
| --- | --- | --- | --- |
| T01 冻结第一切片证据包 | 已完成 | 2026-07-26 G02/G03 闭合批 | 已冻结 E01–E21、manifest、夹具目录和证据缺口 |
| T02 建立目录与依赖边界 | 已完成 | 2026-07-26 第二批 | 已建立 host、engine、backends、testing 与隔离类型检查 |
| T03 定义证据门和宿主 API | 已完成 | 2026-07-26 第二批 | 已建立结构化证据结果和可移植宿主生命周期接口 |
| T04 建立原作管理器对象图 | 已完成 | 2026-07-26 第二批 | 已建立首批原作 owner、所有权和行为证据门 |
| T05 建立音符类型与状态框架 | 已完成 | 2026-07-26 第二批 | 已建立 Front/After、Long/Slide/Flick 派生族和四态分派 |
| T06 恢复 SetupNotes、对象池和活跃列表 | 已完成 | 2026-07-26 G02/G03 闭合批 | 已按预构造 informationList 原序建立分族池、环形游标和激活/失活列表回调 |
| T07 恢复确定性子步调度 | 已完成 | 2026-07-26 G02/G03 闭合批 | 已恢复双时钟、自适应子步、固定反向 Update，并关闭合成跨 Note 移除边界 |
| T08 建立暂停与恢复框架 | 已完成 | 2026-07-26 第三批 | 已建立冻结调度的暂停门和抽象记录后端状态广播 |
| T09 建立 OneFrameData 容器框架 | 已完成 | 2026-07-26 第四批 | 已建立控制器独占容器池、获取/占用/收集与统一 Reflect 边界 |
| T10 建立记录后端和快照 | 已完成 | 2026-07-26 第四批 | 已建立五类无副作用记录端口和稳定第一切片快照 |
| T11 隔离测试和验收 | 已完成 | 2026-07-26 G01/G06 闭合批 | 已建立无新增测试框架依赖的隔离入口、18 项定向测试和验收记录 |

### 1.2 批次记录

#### 2026-07-26 第一批：T01 证据冻结

- 逆向仓库 HEAD 已确认等于 `f4392a327f536275cf1f1733e27b778ee2ce600c`。
- E01–E16 已按源目录结构复制到 `tmp/simulator-reverse-evidence/first-slice/artifacts/`。
- `manifest.json` 已记录源路径、复制路径、完整 SHA-256、确认状态和消费任务。
- `.gitattributes` 已将临时证据包标记为 `-text`，并把 CRLF 的 CR 视为行尾，防止换行转换破坏字节级哈希且保留差异检查。
- `OPEN_GAPS.md` 已登记 G01/G06 闭合证据，并继续保留 G02–G05 开放边界。
- `fixtures/README.md` 已明确 T01 不生成行为夹具，后续夹具不得来自旧模拟器。
- `verify.mjs` 已提供源文件、复制文件和 Git 暂存区的可重复 SHA-256 校验。
- 本批只进行证据哈希、manifest、路径和差异检查，不运行构建或测试。

#### 2026-07-26 G01/G06 闭合批：音乐时钟与自适应子步

- Reverse 在 `0ad31d30ead506913406006c4417047cf61e95a4` 闭合 `MUSIC_BAR_DIVISION_COUNT = 192`、双时钟推进、批次绝对位置和音符组激活窗口。
- 同一证据包闭合 BPM 变化计数门、四个持久 `uint` 计数器、递增后 `101/21/6` 回退和 `ExecuteFrame` 平分。
- E14–E16 已冻结到临时证据包；manifest 锁定提交更新为 `0ad31d30ead506913406006c4417047cf61e95a4`。
- 实现和快照已移除 G01/G06 开放状态，保留 G02–G05。
- 定向测试由 13 项扩展为 18 项；仍不运行 GarupaEditor 整体构建。

#### 2026-07-26 G02/G03 闭合批：等位置顺序与活跃列表突变

- Reverse 在 `326b305f14121d7a0e7e046410dac993147360cb` 闭合按钮组首次出现顺序、组内绝对位置排序和相同按钮同位置合并规则。
- E17–E21 已冻结到临时证据包；manifest 锁定提交同步更新，仍排除未跟踪 `runtime/tools/`。
- 第一切片继续直接消费预构造 `NoteBatchInformation.informationList`，删除无原作字段依据的 `sourceOrder`，不执行 lane、button、位置或类型排序。
- G03 以第一切片调用图内的否定结论闭合：保留实时列表、固定递减索引、自移除和下一子步 Count 刷新，不暴露伪造的跨 Note 移除入口。
- 快照开放缺口缩减为 G04/G05；仍不实现属于后续判定/输入切片的多方向侧链消费行为。

#### 2026-07-26 第二批：T02–T05 类型与宿主边界

- 已建立 `src/simulator/host`、`engine`、`backends` 和 `testing` 四个职责边界。
- 已建立 `createSimulatorEngine` 以及 `initialize`、`step`、`pause`、`resume`、`snapshot`、`dispose` 宿主接口。
- 已建立 `ok` / `evidence-required` 结果、证据引用和证据绑定值；缺少来源的关键输入失败关闭。
- G01 已由 E14–E16 闭合；宿主显式接收带证据的主/发射器初始位置与 BPM，不设置调用者默认值。
- 预构造批次的 bar、分数位置、Note family 与类型字段逐项要求证据绑定；宿主 `snapshot` 在 T10 前继续返回证据门。
- 已建立 `InGameManager`、`InGameMusicScoreController`、`NoteManager`、`SlideNoteManager`、`InGameOneFrameJudgementController`、`InputManager` 和 `GamePlayButton` 框架边界。
- 已建立 `NoteBase`、`NoteFrontBase`、`NoteAfterBase` 以及 Long、Slide、Flick、Directional 和 Multiple Directional 类型；未由冻结证据证明的二级继承未被固化。
- OneFrame 控制器本批只进入对象图，容器初始化与调用顺序继续由 T09 阻断。
- 已按 E03 恢复 Move `0`、Wait `1`、Stop `2`、Deactive `3` 分派；具体行为继续返回证据门。
- 已增加模拟器隔离 `tsconfig.json` 和可重复禁止依赖扫描，当前未导入 React、Pixi、Tauri、DOM、主程序或编辑器谱面模型。
- 本批验证为 `npx.cmd tsc -p src/simulator/tsconfig.json`、`node src/simulator/testing/verifyDependencies.mjs`、证据包校验和 `git diff --check`；未运行整体构建。

#### 2026-07-26 第三批：T06–T08 池化、调度与暂停

- `SetupNotes` 现按预构造夹具中的 Note family 建立互相分离的池；池容量取本夹具该 family 的实例总数，只作为第一切片有界载体，不声明等于原作运行时容量。
- 每个分族池持有独立环形游标，按当前游标向前寻找 Deactive 对象；成员严格依预构造 `informationList` 的现有顺序立即绑定、激活和追加，不执行 lane、button、位置或类型排序。
- G02 已由 E17–E20 闭合；BMS 工厂不在第一切片实现范围，因此宿主不复制原作上游排序器，也不要求无原作字段依据的 `sourceOrder`。
- `NoteBase` 已分离稳定池对象 ID 与当前绑定夹具 ID；Move 边界去重追加到活跃列表尾部，Deactive 边界即时移除，池继续持有对象。
- `ExecUpdate` 已按 E03 的 `<0.018`、`<0.033`、`<0.05` 阈值选择 1–4 子步，并在每个子步按音乐推进、固定递减索引 Update、存活对象 AfterUpdate、当前单组激活的顺序执行。
- 每个子步重新读取活跃列表 Count；同一遍历中的即时自移除作用于实时列表和保留的递减索引。G03 已确认第一切片没有可表示的跨 Note 移除调用者，后续判定切片必须连同真实调用时机另行引入。
- 调度器记录稳定的 frame、music-advance、note-update、note-after-update、note-activate 轨迹；公开宿主快照仍由 T10 阻断。
- G01 已按 `MUSIC_BAR_DIVISION_COUNT = 192` 恢复主/发射器 Float32 时钟、批次 Int32 绝对位置和开/闭激活窗口。
- G06 已恢复四个持久 `uint` 计数器、BPM 变化计数门、递增后 `101/21/6` 回退边界，以及 `deltaTime`/`ExecuteFrame` 同步平分。
- `pause` 只设置宿主调度门并向可移植生命周期记录端口广播 `paused`；`resume` 只解除门并广播 `running`，均不修改音乐、BPM、组游标、活跃列表或池。
- 生命周期广播是 GarupaEditor 测试端口，不使用或命名原作状态 `5/7`、暂停状态 `1/2` 或接口槽 `26–32`，具体记录实现留给 T10。
- 本批定向验证为不入库的 T06–T08 行为探针、模拟器隔离 TypeScript 类型检查、禁止依赖扫描、冻结证据包校验和 `git diff --check`；T11 前未新增完整测试套件，也未运行整体构建。

#### 2026-07-26 第四批：T09–T10 帧容器、记录后端与快照

- 已建立 `OneFrameDataPoolProfile`，由宿主夹具提供带 E02/E08 引用的非负容量；实现不选择或宣称原作池大小。
- `InGameOneFrameJudgementController` 独占容器分配、占用状态、收集顺序和回收；对外只提供稳定 `containerId` 句柄，不暴露可变内部集合。
- `NoteBase.RegisterCallbackGetUsableOneFrameData` 已在 `SetupNotes` 中统一安装；Note 只能经回调请求可用容器，不持有控制器或池集合。
- 测试专用 `stageFixture` 只建立 `IsUse`/Reflect 所需占用状态并要求显式 E08 引用，不填充分数、Combo、Power、判定、HUD 或音频字段。
- 完整 `OneFrameData.Setup` 业务路径继续由 `one-frame.setup-business-data` 返回 `evidence-required`，不得通过占用夹具伪装为原作判定结果。
- `ReflectOneFrameData` 按控制器池顺序收集当帧占用容器、记录单一批次轨迹并统一清除占用；不执行 E08 中后续分数、生命、Combo、显示或音频消费。
- `InGameManager.initialize` 先建立 OneFrame 容器，再安装 Note 回调；成功 step 在 Note 调度完成后进入统一 Reflect，暂停 step 不产生 Reflect。
- 已建立 renderer、audio、input、resources 和 lifecycle 五类无副作用记录端口；事件只包含从零递增序号、稳定端口名、动作和可选字符串详情。
- `SimulatorSnapshot` 包含管理器状态、调度与 OneFrame 轨迹、活跃顺序、池占用、后端事件和 G04/G05 缺口；G01/G06 的时钟与计数器状态进入管理器快照。
- 快照是第一切片测试设施，不包含编辑器载荷、窗口标识或 UI 布局，也不成为未来主程序进入模拟器的协议。
- 本批定向验证为不入库的 T09–T10 行为探针、模拟器隔离 TypeScript 类型检查、禁止依赖扫描、冻结证据包校验和 `git diff --check`；未运行整体构建。

#### 2026-07-26 第五批：T11 隔离测试和验收

- 已增加 `npm.cmd run simulator:test:first-slice`，使用项目现有 TypeScript 编译器把测试编译到系统临时目录，由 Node 执行后自动清理；未引入 Vitest、Jest 或模拟器运行依赖。
- 测试范围只包含 `src/simulator` 与 `src/simulator/testing`，不加载 React、Pixi、Tauri、DOM、编辑器谱面、窗口协议或主程序模块。
- 已建立 18 项独立断言组，新增覆盖 192 刻度双时钟、激活窗口、`101/21/6` 历史回退、无 BPM 变化固定单步和 `ExecuteFrame` 平分。
- 测试入口末尾强制执行禁止依赖扫描；任何测试或依赖边界失败均返回非零状态。
- `tmp/simulator-first-slice-acceptance.md` 已逐项记录任务书要求、提交边界、验证命令、结果、未运行范围、G01/G02/G03/G06 闭合和 G04/G05 保留证据门。
- 最终验收命令为第一切片定向测试、模拟器隔离 TypeScript 类型检查、禁止依赖扫描、证据包工作树与 Git 索引哈希校验以及 `git diff --check`。
- 未运行 `npm run build`、Vite/Tauri 构建、主程序测试或完整模拟器联调；第一切片完成不承诺程序整体可运行。

## 2. 固定范围

### 2.1 纳入范围

- 可移植宿主 API 与原作引擎模型之间的隔离边界。
- 原作管理器和音符实体的对象所有权框架。
- `SetupNotes`、活跃列表、对象池和生命周期回调框架。
- 已确认的子步选择、Update、AfterUpdate、音符组激活顺序。
- Move、Wait、Stop、Deactive 状态分派框架。
- 暂停冻结与恢复续跑边界。
- `OneFrameData` 容器所有权和统一 Reflect 边界。
- 记录型空后端、状态快照、调用轨迹和证据缺口输出。
- 仅面向 `src/simulator` 的隔离类型检查和测试。

### 2.2 排除范围

- `App.tsx`、`BuiltInSimulatorWindow`、`ChartEditorController`、移动端路由和窗口通信。
- GarupaEditor 谱面类型到模拟器输入的适配。
- BMS 文本解析和 `NoteBatchInformationListFactory` 的实际实现。
- Auto Live、真实触摸、判定、分数、生命、技能和 Fever 行为。
- Pixi 绘制、Web Audio 播放、资源加载和 UI。
- Unity PlayerLoop 中相对其他 MonoBehaviour 的精确相位。
- CRIWARE、Unity GPU、原生音频设备和实体设备延迟。
- GarupaEditor 整体构建和完整模拟器联调。

## 3. 强制执行规则

1. 每个原作类、字段职责、状态和调用顺序必须指向第 4 节中的锁定证据。
2. IL2CPP 元数据确认的类型和方法名可以作为原作名称；语义重建的字段名必须标记为 `inferred`。
3. 未闭合能力不得提供默认实现，统一产生 `evidence-required` 结果。
4. Python 原型只能生成或验证离线夹具，不能成为 GarupaEditor 运行依赖。
5. `engine` 层不得导入 React、Pixi、Tauri、DOM、编辑器谱面类型或窗口协议。
6. 第一切片的记录后端不得产生视觉、音频或输入副作用。
7. 未列入本任务书的行为必须先补充逆向证据和任务书，之后才能实施。

## 4. 锁定证据清单

所有路径均相对于 `HOST________\VSCode\GirlsBandParty-Reverse`。实施时复制到临时证据包的文件必须保持下表 SHA-256；不匹配时立即停止。

| 编号 | 原作证据 | SHA-256 | 第一切片用途 |
| --- | --- | --- | --- |
| E01 | `artifacts/rhythm/rhythm_owner_completion.tsv` | `8944D61D770541EF6F74AE9CC0BF8135530B034C6D71F5A53AF02ED53D2CE819` | 确认原作 owner、领域分层和方法闭合度 |
| E02 | `artifacts/rhythm/rhythm_seed_targets.tsv` | `EEF390E058125BB95A753BF6E30CCC30096F72A3C169704996F7E2AEE0F973ED` | 确认 Note、Slide、OneFrame 关键方法与 RVA |
| E03 | `artifacts/investigations/note-scheduling-clock/README.md` | `CB13700C9A3B8CA4DC66DE2AFCD923A7917868260385E731F5BE5262FF7CA946` | 子步阈值、音乐位置先行、四态分派和 AfterUpdate 边界 |
| E04 | `artifacts/investigations/simultaneous-note-ordering/README.md` | `A15D27EDD7FB1368760E196789A35D5486F804C856F42BAE40FDB5FB5FAD3E95` | 音符组激活、活跃列表顺序和新组延迟一子步 |
| E05 | `artifacts/investigations/runtime-integration-prototype/note_manager_two_phase_substep_order.json` | `774C1C39644EE937E47FE64171E5715AF915A194E9EB8A59FDA44F1F664CB177` | 每个子步的 Update/AfterUpdate 两阶段顺序 |
| E06 | `artifacts/investigations/runtime-integration-prototype/multiple_flick_active_list_order.json` | `EC64154569BA4B30D644D27E839BEABA5357A6554FAAEA95080295B118ABB391` | `SetupNotes` 激活/失活回调和列表追加/移除 |
| E07 | `artifacts/investigations/runtime-integration-prototype/note_manager_active_list_mutation.json` | `E1B8E48695F0BD7EFC0C3750BC7ADAF113533326DC98A8FB685FC70B787E7BFD` | 反向遍历中的即时列表突变与下一子步 Count 刷新 |
| E08 | `artifacts/investigations/judgement-result-pipeline/README.md` | `150A105CD75CFBB62D39F54CD57BC0D3A8A2ACDCD7BA3510350FE6C5CBC47DC7` | `OneFrameData` 获取、填充、收集和 Reflect 边界 |
| E09 | `artifacts/investigations/application-pause-resume/README.md` | `B630C31E80918685C45E7B9C643C5D24ADE7B6C4F2451CE4640C27A440C5053E` | 暂停/恢复顺序和不修改运行进度的边界 |
| E10 | `artifacts/investigations/bms-note-batch/README.md` | `37B64F06EDFBC7D8F92053F82CD18D672A47B8D8089B1C5B0DCFF4D35ACC1F22` | 预构造 `NoteBatchInformationList` 夹具的结构边界 |
| E11 | `artifacts/investigations/runtime-integration-prototype/targets.tsv` | `8BCB3052C44DEFB5884E717BD96A71A2CE698D6C0B47EDAB17AAC52B745F679D` | 总体实现行为到原作证据的路由索引 |
| E12 | `artifacts/investigations/touch-note-arbitration/README.md` | `0558A928918794D603368A5CA4813D44FF9B957EDF5C50C30809C85605C2E489` | 仅确认输入管理边界；第一切片不得实现触摸行为 |
| E13 | `artifacts/investigations/touch-hold-release/README.md` | `08238B2199D22C4EAB53168B46E2341FCB25A82B0B3660A7888AD96850AD49B0` | 仅确认 Long/Slide/Flick 派生职责；第一切片不得实现判定行为 |
| E14 | `artifacts/investigations/music-bar-division-adaptive-substeps/closure.json` | `09A4B3639384887135D60CC296E2D590D550F12D647941C1C508B62610586C0E` | G01/G06 机器可读闭合事实 |
| E15 | `artifacts/investigations/music-bar-division-adaptive-substeps/README.md` | `6720E2EDBD1470004B6437FF245402B30097DD93DCECC248E0DA7C0ABCEFE92B` | 音乐刻度、激活窗口和自适应子步闭合报告 |
| E16 | `artifacts/investigations/music-bar-division-adaptive-substeps/targets.tsv` | `F0972AD43B68999901B2406B368C070FD25FD6CF1F288745A6B0589EDCE181BF` | G01/G06 原作方法与证据路由 |
| E17 | `artifacts/investigations/equal-position-and-cross-note-mutation/closure.json` | `3DF63B02A1A7031635E5A23A685D39EC7596769F421562B9B2F8A8FDE4BA2992` | G02/G03 机器可读闭合事实 |
| E18 | `artifacts/investigations/equal-position-and-cross-note-mutation/README.md` | `7ADA4FD567B8B5C142A98AE046BC2E5C5A300A97BB658A2D6C21C3E623D67E9E` | 等位置构造顺序与跨 Note 突变边界报告 |
| E19 | `artifacts/investigations/equal-position-and-cross-note-mutation/targets.tsv` | `142DCCF7AFAF8981606D042484F64A753A8C48FB042ABFDC1D128D4445829457` | G02/G03 原作方法与证据路由 |
| E20 | `artifacts/investigations/equal-position-and-cross-note-mutation/decompiled/native_ranges.txt` | `592D03A9CDB868161AB671099AD822A38228B174666BCF30B345E4DF41DE1ABE` | G02/G03 锁定 RVA 原始指令清单 |
| E21 | `artifacts/investigations/equal-position-and-cross-note-mutation/decompiled/xrefs.json` | `CF707F476EBCE9A8464DBD27343B1CD20DB60CDE79E4B41FCD9BBE6BD42D9DA1` | 解析入口与状态变更直接交叉引用 |

逆向仓库当前存在未跟踪目录 `runtime/tools/`。该目录不属于锁定提交，禁止复制、引用或据此作出实现判断。

## 5. 目标目录结构

第一切片后续实现必须按以下边界落位；可以增加同层文件，但不得把不同层职责混合。

```text
src/simulator/
  host/
    createSimulatorEngine.ts
    contracts.ts
  engine/
    evidence.ts
    lifecycle.ts
    data/
    managers/
    notes/
  backends/
    contracts.ts
    recordingBackend.ts
  testing/
    fixtures/
    traceAssertions.ts
  README.md

tmp/simulator-reverse-evidence/first-slice/
  manifest.json
  artifacts/
  fixtures/
  OPEN_GAPS.md
```

## 6. 宿主接口决策

宿主接口是 GarupaEditor 的可移植适配边界，不属于原作类模型。第一切片固定以下公共能力：

```text
createSimulatorEngine(input, backends)
SimulatorEngine.initialize()
SimulatorEngine.step(deltaTimeSeconds)
SimulatorEngine.pause()
SimulatorEngine.resume()
SimulatorEngine.snapshot()
SimulatorEngine.dispose()
```

### 6.1 输入边界

- `input` 只接收预构造的 `NoteBatchInformationList` 夹具、证据绑定的时钟配置和第一切片所需的管理器构造参数。
- 不接收 `ChartNote`、BPM/SV 编辑器模型、React state、Tauri event 或窗口请求 ID。
- 原作数值尚未闭合时，输入必须携带证据引用；禁止在构造器内设定经验默认值。

### 6.2 结果边界

所有可能触及未闭合能力的操作返回结构化结果：

```text
ok(value)
evidence-required(capability, requiredEvidence, boundary)
```

- `capability` 是稳定的模拟器能力标识。
- `requiredEvidence` 指向缺失调查或实体设备采集目标。
- `boundary` 描述已确认行为停止在哪里。
- 不允许自动降级、静默忽略或调用旧模拟器逻辑。

## 7. 详细实施任务

### T01：冻结第一切片证据包

**目标**

把实现实际使用的最小证据复制到当前项目，确保第一切片不随相邻仓库变化。

**产物**

- `tmp/simulator-reverse-evidence/first-slice/manifest.json`
- `tmp/simulator-reverse-evidence/first-slice/artifacts/`
- `tmp/simulator-reverse-evidence/first-slice/fixtures/`
- `tmp/simulator-reverse-evidence/first-slice/OPEN_GAPS.md`

**落地步骤**

1. 验证逆向仓库 HEAD 严格等于锁定提交。
2. 验证 E01–E21 的完整 SHA-256。
3. 仅复制第一切片实际引用的最小文件，不复制完整调查目录或本地原始样本。
4. `manifest.json` 为每项记录源提交、源相对路径、复制后路径、SHA-256、确认状态和消费任务。
5. `OPEN_GAPS.md` 初始化记录：`UnitsPerBar` 名称/值边界、相同位置成员上游排序、跨 Note 低索引移除实例、Unity PlayerLoop 相位、暂停状态精确更新门条件。

**原作证据**

- E01–E21。

**验证**

- 重新计算复制后文件 SHA-256，必须与第 4 节一致。
- manifest 的证据条目中不得引用 `runtime/tools/` 或旧 GarupaEditor 路径；源信息可以把 `runtime/tools/` 记录为明确排除项。

**停止条件**

- 逆向 HEAD 或任一 SHA-256 不匹配。
- 所需事实只存在于未跟踪文件、旧模拟器或无来源口述中。

### T02：建立目录与依赖边界

**目标**

创建宿主、原作引擎和后端三层空框架，并让依赖方向只能从宿主/后端指向引擎契约。

**产物**

- 第 5 节规定的 `host/`、`engine/`、`backends/`、`testing/` 目录与导出边界。
- 模拟器隔离 TypeScript 配置和测试入口。

**落地步骤**

1. `engine` 只使用 TypeScript 标准语言能力。
2. `backends` 实现 `engine` 所需端口，但不得让 `engine` 导入后端类型。
3. `host` 组合 `engine` 与 `backends`，不接入主程序。
4. 添加静态依赖测试或导入扫描，拒绝 React、Pixi、Tauri、DOM、`src/app` 和 `chartCore`。

**原作证据**

- E01、E02 用于确定原作领域边界。
- 宿主和后端分层是可移植实现边界，不宣称来自原作。

**验证**

- 模拟器隔离类型检查通过。
- 禁止依赖扫描通过。

**停止条件**

- 为了让框架编译必须修改主程序入口或恢复旧协议。

### T03：定义证据门和宿主 API

**目标**

落实第 6 节接口，并确保未确认能力失败关闭。

**产物**

- `createSimulatorEngine`。
- `SimulatorEngine` 生命周期接口。
- `ok` / `evidence-required` 结果类型。
- 证据引用和值来源类型。

**落地步骤**

1. 定义预构造批次、时钟配置和后端端口输入。
2. 所有证据敏感数值必须携带来源标识，不提供默认值。
3. `initialize` 只构造第一切片对象图。
4. `step` 只驱动已确认调度框架。
5. 未实现的 BMS、输入、判定、渲染、音频和主程序适配返回 `evidence-required`。
6. `dispose` 必须幂等，并释放由模拟器创建的容器和后端订阅。

**原作证据**

- E03–E11 确定可暴露的已确认运行边界。
- 宿主 API 本身是项目接口，不作为原作证据声明。

**验证**

- 缺少证据绑定参数时构造失败关闭。
- 重复 `dispose` 不改变已释放状态或产生新事件。

**停止条件**

- 任一宿主字段只能通过现有编辑器载荷才能取得。

### T04：建立原作管理器对象图

**目标**

恢复第一切片所需原作 owner 的存在、职责和依赖，不提前实现后续行为。

**产物**

- `InGameManager`
- `InGameMusicScoreController`
- `NoteManager`
- `SlideNoteManager`
- `InGameOneFrameJudgementController`
- 输入管理与 GamePlayButton 的端口占位，不实现行为。

**落地步骤**

1. 依据 E01/E02 建立确认过的类名和方法边界。
2. `InGameManager` 只负责第一切片管理器组合、生命周期分发和状态持有。
3. `NoteManager` 持有预构造批次、活跃列表、对象池和 `SlideNoteManager`。
4. `InGameOneFrameJudgementController` 持有 OneFrame 容器池。
5. 任何无法由证据证明的字段使用中性内部名称，并在证据登记中标记 `inferred`，不得写成原作字段名。

**原作证据**

- E01、E02、E03、E08。

**验证**

- 对象图快照确认单一所有者和无循环构造依赖。
- 构造顺序与任务夹具一致。

**停止条件**

- 需要猜测原作 owner 或把后端对象塞入原作管理器字段。

### T05：建立音符类型与状态框架

**目标**

恢复 `NoteBase` 状态分派和已确认派生类型边界，不实现具体判定。

**产物**

- `NoteState`：Move `0`、Wait `1`、Stop `2`、Deactive `3`。
- `NoteBase.ExecuteUpdate` 与 `ExecuteAfterUpdate` 框架。
- Long、Slide、Flick、After、Multiple Directional 等证据确认的派生类型骨架。

**落地步骤**

1. `ExecuteUpdate` 按状态调用 Move/Wait/Stop；Deactive 不更新。
2. Move/Wait/Stop 后调用 `OnUpdate` 端口。
3. `ChangeState` 只在激活/失活边界调用已安装回调。
4. Long 的单一 after-note 所有权与 Slide 的 after-note 列表所有权分离。
5. 派生类所有尚未闭合的方法返回 `evidence-required`。

**原作证据**

- E02、E03、E12、E13。

**验证**

- 四态分派轨迹精确匹配 E03。
- Deactive 不产生 Update 或 AfterUpdate。
- 第一切片测试不得出现判定结果、分数或音效事件。

**停止条件**

- 必须借用旧模拟器 note type 或状态枚举才能继续。

### T06：恢复 SetupNotes、对象池和活跃列表

**目标**

恢复第一切片所需的池化对象选择、激活顺序和列表回调所有权。

**产物**

- 预构造 `NoteBatchInformationList` 夹具加载器。
- 按音符族分离的池和游标。
- `OnActivate` 去重追加与 `OnDeactivate` 即时移除。
- 活跃顺序和池占用快照。

**落地步骤**

1. 使用 E10 允许的预构造对象，不解析 BMS。
2. 依组成员源顺序选择池对象并立即激活。
3. 激活回调仅在列表不包含对象时追加到尾部。
4. 失活回调立即从活跃列表移除。
5. 不按 lane、button 或时间重新排序相同位置成员。
6. 不实现同步线、触摸候选或具体资源选择，只保留证据要求的引用位置。

**原作证据**

- E04、E06、E07、E10、E17–E20。

**验证**

- `[A, B, C]` 依源顺序激活并追加。
- 重复激活不产生重复成员。
- 失活立即改变活跃列表，池对象仍由池持有。

**停止条件**

- 夹具没有显式源顺序，或需要推断等位置成员排序。

### T07：恢复确定性子步调度

**目标**

恢复已确认的每帧子步数和每个子步内的调用顺序。

**产物**

- 1–4 子步选择器。
- 音乐控制器先行、反向 Update、存活对象 AfterUpdate、音符组激活的调度器。
- 子步调用轨迹。

**落地步骤**

1. 按 E14 的 Float32 阈值选择初始子步：`<0.0179999992` 为 1，`<0.0329999998` 为 2，`<0.0500000007` 为 3，其余为 4。
2. BPM 变化计数至少为一时，先递增对应持久 `uint` 计数器，再按 `>100`、`>20`、`>=6` 强制单步；第四计数器不直接触发回退。
3. 按最终子步数同时平分 Float32 `deltaTime` 与 `ExecuteFrame`；无 BPM 变化时固定单步且不递增计数器。
4. 每个子步先推进 `InGameMusicScoreController`。
5. 从活跃列表 `Count - 1` 开始使用固定递减索引调用 `ExecuteUpdate`。
6. Update 后立即把当时仍非 Deactive 的对象追加到临时 After 列表。
7. 正向遍历临时列表调用 `ExecuteAfterUpdate`。
8. 最后只处理当前一个音符组；新激活对象下一子步才更新。
9. 每个新子步重新读取活跃列表 Count。

**原作证据**

- E03、E04、E05、E07、E14–E21。

**验证**

- 四组 deltaTime 边界测试。
- `101/21/6` 次历史回退、第四计数器无直接回退和无 BPM 变化固定单步。
- 最终子步数同时平分 `deltaTime` 与 `ExecuteFrame`。
- 同时组 `[A, B, C]` 下一子步产生 `C, B, A` Update 和 AfterUpdate。
- Update 中失活的 B 不进入 AfterUpdate。
- 当前反向遍历自移除后，下一子步不再出现该对象。
- 对跨 Note 低索引移除只验证已确认的数据结构后果，不制造原作调用场景。

**停止条件**

- 测试需要定义 Unity PlayerLoop 精确相位。

### T08：建立暂停与恢复框架

**目标**

确保暂停冻结调度，恢复后从原状态继续，而不是重放或重建。

**产物**

- 暂停状态。
- 后端暂停/恢复广播轨迹。
- 暂停前后状态一致性快照。

**落地步骤**

1. `pause` 设置宿主门并按证据顺序通知记录后端。
2. 暂停期间 `step` 不推进音乐位置、不调用 Note Update、不改变组游标或池。
3. `resume` 恢复门，下一次 `step` 从保留状态继续。
4. 不实现暂停 UI、倒计时、具体音频设备调用或未确认接口槽名称。

**原作证据**

- E09；E03 用于确认恢复后继续进入现有调度器。

**验证**

- 暂停前后音乐位置、BPM、组索引、活跃列表和池占用完全相同。
- 恢复后的首个 step 延续原调用顺序。

**停止条件**

- 必须为状态值 `5`、`7` 或接口槽 `26–32` 猜测原作枚举/方法名。

### T09：建立 OneFrameData 容器框架

**目标**

恢复 OneFrame 容器池的所有权和统一 Reflect 阶段，不实现业务计算。

**产物**

- OneFrame 容器池。
- 可用容器获取、存在性检查、收集和 Reflect 接口。
- Reflect 调用轨迹。

**落地步骤**

1. 依据 E02/E08 建立控制器方法边界。
2. 容器只能由 `InGameOneFrameJudgementController` 分配和回收。
3. Note 只能通过回调请求可用容器，不直接持有控制器内部集合。
4. Reflect 只记录批次和调用顺序，不修改分数、Combo、生命、HUD 或音频。
5. 任何需要填写未实现业务字段的调用返回 `evidence-required`。

**原作证据**

- E02、E08、E11。

**验证**

- 获取、占用、存在性检查、批量 Reflect 和回收顺序测试。
- 同一帧多个容器只通过统一 Reflect 边界暴露。

**停止条件**

- 为了完成容器测试必须实现判定、分数或显示逻辑。

### T10：建立记录后端和快照

**目标**

为第一切片提供无副作用的可观察性。

**产物**

- 记录型渲染、音频、输入和资源端口。
- `SimulatorSnapshot`。
- 稳定的调用轨迹格式。

**落地步骤**

1. 后端只记录生命周期和端口请求，不访问 DOM、Canvas、AudioContext 或设备输入。
2. 快照包含管理器状态、调用轨迹、活跃顺序、池占用、OneFrame 占用和证据缺口。
3. 快照不得包含编辑器载荷、窗口标识或未来 UI 布局。
4. 调用轨迹使用稳定事件名，测试不得依赖对象内存地址或随机 ID。

**原作证据**

- E11 用于把记录事件映射回证据消费者。
- 记录后端和快照属于测试设施，不宣称是原作结构。

**验证**

- 相同夹具和 step 序列产生完全一致的快照。
- 快照序列化不触发任何后端行为。

**停止条件**

- 为了观察状态必须暴露原作管理器可变内部集合。

### T11：隔离测试和验收

**目标**

只验证第一切片框架和已确认生命周期，不承诺 GarupaEditor 整体运行。

**产物**

- 模拟器隔离 TypeScript 配置。
- 第一切片定向测试套件。
- 证据包哈希检查脚本或等价测试入口。
- 第一切片验收结果记录。

**落地步骤**

1. 建立只包含 `src/simulator` 与模拟器测试夹具的类型检查范围。
2. 建立禁止跨层导入的静态检查。
3. 按下列必测场景分别建立确定性测试，不把多个证据边界压缩成单一端到端断言。
4. 测试失败时先核对证据、夹具和实现边界，不通过扩大近似行为消除失败。
5. 汇总定向测试、哈希检查和 `git diff --check` 结果，不执行主程序整体构建。

**原作证据**

- E01–E11、E14–E21 覆盖对象图、调度、状态、暂停、音乐时钟、自适应子步、等位置顺序、列表突变和 OneFrame 框架。
- E12/E13 只用于验证输入和派生职责仍被证据门阻断。

**必测场景**

1. 管理器对象图构造和单一所有权。
2. 初始化、step、pause、resume、dispose 顺序。
3. 四档子步选择边界。
4. 同时音符组激活后延迟一个子步。
5. 活跃列表反向 Update 和 AfterUpdate 顺序。
6. Update 中 Deactive 对 AfterUpdate 的过滤。
7. 列表自移除在当前与下一子步的表现。
8. 暂停期间时钟、游标、列表和池完全冻结。
9. OneFrame 容器获取、Reflect 和回收。
10. 未闭合能力统一返回 `evidence-required`。
11. `engine` 禁止导入 React、Pixi、Tauri、DOM、主程序或编辑器谱面模块。
12. `dispose` 幂等。

**验收命令范围**

- 证据包哈希验证。
- 模拟器隔离 TypeScript 类型检查。
- 第一切片定向测试。
- `git diff --check`。

第一切片完成前不运行 `npm run build`、Tauri 构建或主程序整体测试。

**验证**

- 所有必测场景通过。
- 所有证据文件哈希与第 4 节一致。
- 隔离类型检查和禁止依赖扫描通过。
- `git diff --check` 通过。
- 验收记录明确声明未运行整体构建或完整模拟器测试。

**停止条件**

- 任一测试只能通过猜测值、补写未确认行为或接入旧模拟器。

## 8. 后续实现提交边界

第一切片实施必须按以下五个行为边界提交，不得按文件数量随意合并：

1. `docs(simulator): 固定第一切片原作证据`
   - T01 证据包、manifest、夹具来源和 OPEN_GAPS。
2. `refactor(simulator): 建立原作引擎类型与宿主边界`
   - T02–T05 目录、结果类型、宿主 API、管理器和音符状态框架。
3. `feat(simulator): 恢复第一切片确定性调度`
   - T06–T08 SetupNotes、对象池、活跃列表、子步、暂停。
4. `feat(simulator): 建立帧容器与记录后端`
   - T09–T10 OneFrameData、记录端口和快照。
5. `test(simulator): 覆盖第一切片生命周期框架`
   - T11 隔离配置、夹具和测试。

每个提交前只验证该提交覆盖的定向范围；整体联调仍按上级计划另行触发。

## 9. 第一切片完成定义

同时满足以下条件才可声明第一切片完成：

- E01–E21 已锁定、复制并在 manifest 中可追溯。
- 宿主、原作引擎和后端依赖方向符合第 5 节。
- 管理器对象图和音符状态框架可由预构造夹具初始化。
- 已确认调度、列表突变、AfterUpdate、暂停和 OneFrame 容器测试全部通过。
- 所有未闭合行为均返回 `evidence-required`，没有经验默认值或静默降级。
- 没有修改模拟器入口、主程序、编辑器谱面模型或窗口通信。
- 五个后续实现提交保持原子化且各自可审计。

第一切片完成不代表模拟器可运行，也不代表原作判定、渲染、音频或完整 PlayerLoop 已恢复。
