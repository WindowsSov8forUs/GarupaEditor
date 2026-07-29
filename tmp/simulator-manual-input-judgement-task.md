# 模拟器手动输入与判定阶段任务书

## 1. 阶段身份与当前状态

- 阶段：模拟器彻底重构实施块4——手动输入与判定。
- 上游：第一切片、谱面构造、时钟与调度、Auto Live均已关闭。
- Auto Live最终状态提交：GarupaEditor `bdb11c399124f23b858cc29f67084e5f40560b07`。
- 锁定原作样本：`jp.co.craftegg.band` 10.1.4（version code 230，`arm64-v8a`）；锁定`libil2cpp.so` SHA-256：`815DF62582B35F3EF2223AB033FAC6DC909DE492D548DD28950BF1F98F058D8F`。
- 当前Reverse证据提交：`ce5353fdc54a3ba8188f3dccd4accdc6c2ef4ce2`，已推送`origin/main`且远端差异`0 0`。
- 当前状态：**M00–M02、V01及D01–D15证据门已完成；Reverse 10.1.4契约、5条R1 raw trace与MJ01–MJ26已冻结为141项source/copy可校验证据，`manual_input_gate=closed`且`blocking_findings=[]`。这只解除M03实施硬门，不表示任何手动输入生产代码已实现或验收。Reverse既有大量用户修改继续全部排除，只消费Git对象库中的已提交证据。S01–S73仍仅是10.1.3/229历史迁移清单，生产依据为R01–R17。**
- 证据包：`tmp/simulator-reverse-evidence/manual-input-judgement/`，M01/M02静态、R1与fixed-oracle批均已冻结。
- 计划验收记录：`tmp/simulator-manual-input-judgement-acceptance.md`，M11时创建。

### 1.1 阶段目标

本阶段只恢复已确认的原作托管层手动输入与判定行为：

1. 一个外层帧中的触点枚举、phase分发和finger到button关联。
2. `GamePlayButton`到`NoteManager`的lane/button候选仲裁、wide-note覆盖和单一note获取。
3. 普通Note的Perfect/Great/Good/Bad/None窗口与Fast/Slow。
4. Normal、Flick、Directional Flick和Multiple Directional Flick的手动开始/移动完成。
5. Long与Slide的finger所有权、hold/move、方向/距离阈值、物理或合成release和尾判。
6. Long/Slide正常超时Miss、invisible Slide节点跳过和父拥有子图状态转移。
7. 已闭合字段进入五槽OneFrame池，并在同一外层帧按原作顺序统一Reflect。
8. 以已提交静态证据和实体设备/独立harness固定输入轨迹建立可重复oracle。

“完成手动输入与判定”不表示已经恢复分数、生命、技能、Fever、判定音、Hold音效、粒子、渲染、Unity Raycast、DOM/Tauri输入适配或主程序接入。

### 1.2 锁定决策

1. GirlsBandParty-Reverse仍是唯一行为依据；旧模拟器、通用音游窗口、浏览器Pointer经验和主观手感均禁止作为来源。
2. 当前阶段只接受10.1.4/230版本匹配证据。10.1.3/229的地址、函数体、字段、常量和实体轨迹只能用于列出迁移目标；即使名称、签名或部分指令相同，也不得跨版本晋升或合并oracle。
3. `manual`继续是显式模式；不得因提供touch而把Auto Live切换为manual，也不得让manual无输入时自动Force Perfect。
4. 原作`InputManager.ExecInput`每个外层manager update至多消费一次输入帧，并发生在NoteManager Update与OneFrame Reflect之前；adaptive子步不得重复消费同一输入帧。
5. 宿主输入API是GarupaEditor可移植边界，不冒充Unity API；输入payload、lane解析和坐标空间必须在M02闭合后由M03一次锁定，禁止先设计方便实现的默认接口。
6. 生产owner不得信任调用者提供的note对象、pool ID、OneFrame handle、候选结果、判定结果、BPM、adjusted position、group count或finger ownership；这些值必须由引擎owner计算或通过owner-issued capability取得。
7. 外部输入只能提供已证实的原始事实：finger、phase、坐标及M03锁定的lane-resolution边界；不得由测试直接指定“命中note”“Perfect”“当前Slide节点”或期望回调顺序。
8. `Began`建立的finger→button和finger→note身份由InputManager/GamePlayButton拥有；Moved/Stationary/Ended只能消费该owner状态。相同整数fingerId来自不同引擎、不同session或伪造button handle不得共享能力。
9. 输入事件与一次`step`形成整体事务边界。portable输入/所有权/图验证失败必须发生在clock、scheduler、finger、note、OneFrame和backend mutation之前；原作已确认的中途mutation/异常只能按对应实体证据保留。
10. timeout由现有production adjusted music position、BPM和Note状态机驱动；测试不得注入expected BPM、私有cursor、预计算result或直接写NoteState。
11. movement比较保持原作Float32、严格`>`/`<`/`<=`及screen-to-world distance rate链；不得将`0.04`、`0.01`、`8.0`改成像素阈值、clamp或epsilon近似。
12. stage 5的Score/Power/Life/Skill/Fever与stage 7的音频仍缺席。手动判定只可扩展已闭合的judgement projection，不得用零值伪造完整`OneFrameData`业务字段。
13. `Canceled`、finger越界、非有限坐标、foreign capability和later-invalid touch按M02 portable contract在owner mutation前返回`evidence-required`；相等候选保持owner scan首个严格更优项。Unity Raycast/Camera细节仍由owner-issued resolver边界隔离，不作原作API声明。
14. `RefreshAfterMoveTime`、seek/回退与16秒无输入恢复不是普通触摸/timeout路径；除非M02另行闭合，否则继续排除。
15. 证据批、生产实现批、定向测试批和最终独立验收批必须分离；任何修复批绿色结果都不能直接关闭阶段。
16. 每次验收必须映射“任务要求→已提交证据ID/portable边界→生产调用路径→独立实际观察”，并枚举`producer × owner × consumer × lifecycle × failure point × mutation`。

### 1.3 执行进度

| 任务 | 状态 | 完成标准 |
| --- | --- | --- |
| M00 建立阶段任务书 | **已完成** | 范围、候选证据、硬门、oracle、实施批次和完成矩阵写入本文档 |
| M01 晋升并修正静态证据 | **已完成** | 10.1.4的118方法/14 type/13 enum、独立Slide Wait/Flick Began与Slide band构造已提交并冻结 |
| M02 建立实体/固定事件oracle | **已完成** | 5条R1、MJ01–MJ26、D03–D15、portable contract及141项source/copy verifier通过 |
| M03 锁定输入数据与宿主边界 | **已完成** | 显式不可变input frame、owner-issued button能力、生命周期和失败优先级闭合 |
| M04 恢复输入分发与候选仲裁 | **已完成**：phase/owner、ordinary strict scan与Slide current/near-line owner测试通过 | phase、finger/button/note owner、wide/ordinary/Slide/tie行为匹配 |
| M05 恢复窗口与Single/Flick判定 | **已完成**：Normal/Flick/Directional、Single timeout、单manual OneFrame及定向测试通过 | GetResult/JudgeNote、Normal/Flick/Directional的边界bits与事件顺序匹配 |
| M06 恢复Multiple手动判定 | **已完成**：真实touch、count/side/finger owner、type10、duplicate与production group测试通过 | 真实touch方向、count阈值、side owner、finish/deactivate匹配 |
| M07 恢复Long手动状态机 | **已完成**：Began/hold/move/release/grace/type2/4/5/6/7及MJ11–MJ15测试通过 | Began/Hold/Moved/Ended、合成release、grace、头尾与finger清理匹配 |
| M08 恢复Slide手动状态机 | **已完成**：head/intermediate/end、band/cursor/near-line、invisible/release及MJ18–MJ22通过 | head/intermediate/end、band cursor、release/miss/invisible推进匹配 |
| M09 恢复自然timeout Miss | 进行中：production完成，MJ16/MJ17/MJ23/MJ24独立测试提交待完成 | Long start/end、Slide wait/stop及同帧Miss顺序匹配 |
| M10 接入调度、OneFrame与原子边界 | 进行中：manual多reservation与deactivation cleanup owner已接入，系统矩阵待完成 | 每外帧一次输入、adaptive/pause/fault/dispose、五槽与批原子性闭合 |
| M11 production oracle与独立验收 | 未开始 | 完整回归、production chart、证据验证和组合矩阵无开放阻断 |

### 1.4 初始批次记录

#### 2026-07-29 第一批：M00任务书与证据候选盘点

- 完整重读`tmp/simulator-reconstruction-plan.md`的实施块4、Auto Live持续边界及当前input空实现。
- 只通过`git show HEAD:path`、`git cat-file`和`git grep HEAD`读取Reverse提交对象；当前Reverse脏工作树未作为证据、未恢复、未暂存。
- 盘点`touch-note-arbitration`、`touch-hold-release`、`timeout-flick-paths`、`judgement-result-pipeline`及Auto Live supplement的60个直接候选文件，并独立计算Git blob字节数和完整SHA-256。
- 额外定位10个global note bundle切片，作为M01必须重新导出为独立冻结文件的候选；当前bundle slice index不能直接替代最终证据包。
- 发现静态证据内部冲突：`timeout-flick-paths/decompiled/status.tsv`显示`NoteSlide.WaitState`请求结束`0x321c4e4`但实际扩到`0x321c558`；`execOverWaitState`请求起点`0x321c4e4`但实际起点`0x321c2d0`，两份C正文除边界头外字节相同。这与README/targets“独立边界”声明冲突，登记为D01 required-before-code。
- 未修改生产代码、package scripts、测试、主程序、渲染或音频。

#### 2026-07-29 第二批：游戏样本版本锁定更正

- 用户明确实机游戏已更新且不能只读回退；手动输入阶段锁定样本从10.1.3/229更改为当前最新10.1.4/230。
- Reverse提交内P01–P05确认10.1.4 `libil2cpp.so` SHA-256为`815DF62582B35F3EF2223AB033FAC6DC909DE492D548DD28950BF1F98F058D8F`，并明确两个版本的证据不得互相视为有效或合并。
- 时钟任务已在10.1.4上完成版本迁移后的重新取证并关闭，保持有效且不重开。其rebaseline/重取证范围包含时钟采集所需70个hook、7个probe、6个常量和8个type，但没有覆盖手动输入S01–S73，因此不能据此宣称手动方法在10.1.4行为相同。
- S01–S73保留为10.1.3历史迁移清单及旧blob审计记录，整体降级为不可消费候选。新增V01整阶段版本重基线硬门；M01须在10.1.4重新解析每个手动方法、字段、常量与边界，M02全部实体轨迹也须来自10.1.4。
- Reverse main经Windows `git ls-remote`确认远端仍为`c2dc5c7f`；当前脏工作树继续完全排除。

#### 2026-07-29 第三批：10.1.4手动静态契约

- 在Reverse按managed `Owner$$Method`重新解析10.1.3迁移目标及补充边界，未使用统一RVA delta；锁定目标binary与metadata哈希。
- 最终103/103方法唯一映射且签名、全局下一入口边界长度一致；每个目标均导出10.1.4独立ARM64 TSV。PC-relative差异保持指令类，其余差异经verifier证明只位于IL2CPP全局表unsigned imm12位，opcode/register/access width不变。
- 12个owner type全部字段布局一致，13个输入/判定enum数字身份一致；`InputManager` finger数组长度15、`NoteBase.fingerId +0xC0`、`GamePlayButton`触点数组`+0x60/+0x68`及Slide十组lane-band构造均由当前版本直接指令/metadata锁定。
- 10.1.4独立恢复`NoteSlide.WaitState 0x321B414–0x321B628`（532字节）和`execOverWaitState 0x321B628–0x321B69C`（116字节），二者hash、边界和正文均独立，未消费10.1.3污染的merged cfunc；D01关闭。
- 当前版本直接确认Flick `>0.04`、Directional `>0.01`、Long/Slide grace `8.0`、60FPS窗口exclusive `+3/+6/+7/+8`及`MissSecondInterval` bits `0x3E5DDDDE`。
- 初版静态提交`11b8250853ca12a2106c66245724467701d9eb23`已推送并冻结；最终补充由第四批`4bda0f3a`覆盖。
- 未修改任何Garupa生产代码或手动输入测试入口。

#### 2026-07-29 第四批：10.1.4 R1与MJ01–MJ26

- R1采集器只安装观察hook和读取字段，不替换返回、不写游戏内存、不修改APK；每条正式raw内嵌plan与capture script完整SHA-256，partial/process-ended试验未进入证据。
- song 653`幾億光年`Easy记录Touch phase 0/1/2/3、Float32 bottom-left坐标、InputManager分发与GamePlayButton复用；Hard记录Long index6/button6的Good/Slow头`noteType=4`、physical None release→Miss `noteType=1`、absolutePos336与finger -1；独立Hard no-input记录Long start同outer-frame双Miss双槽单Reflect；Expert no-input记录Slide root/after Miss顺序。
- Linux MT控制记录finger0/1分别Began/Moved/Stationary/Ended及稳定枚举顺序；临时SELinux Permissive只包围input-device注入并在`finally`恢复，采后独立确认为Enforcing。该控制不写目标进程内存。
- 纠正静态摘要：`0x15366A8`为Float32 `1/60` bits `0x3C888889`，不是60.0；verifier直接读取10.1.4 ELF断言。Flick、Directional、Miss interval分别为`0x3D23D70A`、`0x3C23D70A`、`0x3E5DDDDE`。
- committed clock 10.1.4 scanner锁定musicscore660及Easy/Hard/Expert TextAsset SHA；fixed oracle固定portable frame/resolver/transaction/lifecycle contract和MJ01–MJ26，所有`unknown_fields=[]`。
- Reverse最终提交`4bda0f3ad2fb84ef972bf352e78aac57dad44c8b`已推送且远端`0 0`；静态verifier与runtime verifier均通过，`manual_input_gate=closed`、`blocking_findings=[]`。
- Garupa冻结包升级为126项最终source/copy条目；暂存后必须再执行`verify.mjs --index`。未修改任何`src/simulator/**`生产代码。

#### 2026-07-29 第五批：M03输入数据与宿主边界生产实现

- 新增DOM/Pixi/Tauri无关的`ManualInputFrame`、phase 0–3、bottom-left exact Float32 position及opaque button resolution类型；manual活动外帧必须显式传`touches`，Auto Live保持可省略。
- 每个`InputManager`私有`WeakMap` owner签发位置绑定的空handle；跨engine、plain object、位置不匹配、同帧alias和跨帧重复消费均失败关闭。整帧全部touch验证后才一次标记resolution已消费并stage immutable copy。
- finger限制0..14，Canceled/非有限或非Float32坐标、重复finger-phase、非Began重绑、later-invalid均在clock/scheduler/finger/note/OneFrame/backend之前拒绝；snapshot仅输出raw trace、resolved布尔投影与owner计数，不暴露capability/button对象。
- `step(delta, inputFrame?)`先返回latched fault/非initialized生命周期；pause不preflight、不stage、不消费。活动帧先复用纯delta校验，再prepare input，InputManager每outer-frame至多消费一次，adaptive子步不重复。
- isolated production TypeScript与testing TypeScript均通过；兼容工作树上first-slice 17、clock 15、Auto Live AL01–AL22回归通过。定向MJ01/MJ07/MJ25/MJ26测试按提交纪律留到独立测试批。

#### 2026-07-29 第六批：M03定向测试

- 新增`simulator:test:manual-input-boundary`，先从冻结oracle直接确认MJ01/MJ07/MJ25/MJ26、finger 0..14、phase 0..3/Canceled 4及whole-frame transaction原文，再编译执行production调用路径。
- MJ01验证manual缺帧零mutation、显式空touch帧一次消费、无input backend副作用；MJ07验证Began capability后Moved/Stationary/Ended保持0/1/2/3且caller position/array alias不能改prepared copy。
- MJ25验证pause不解析malformed frame，resume恢复显式帧门，Auto Live real touch零mutation拒绝，disposed及latched fault优先于NaN delta和malformed shape。
- MJ26验证host forged capability全域零mutation，以及direct owner的cross-owner、plain/alias、重复finger-phase、later-invalid、位置不匹配、跨帧重复消费、finger越界、Canceled、NaN和非exact-Float32。
- snapshot连续读取deep-equal且序列化结果不含capability/button owner。定向5项、dependency verifier、first-slice 17、clock 15、Auto Live AL01–AL22均通过。

#### 2026-07-29 第七批：M04整帧dispatch事务基础

- 将resolution owner的pure `preflight`与`commit`拆分：preflight生成owner登记的immutable prepared-frame且不消费handle；只有同owner、initialized、未dispose的exact prepared identity可commit。
- `InputManager`增加单一engine-owned dispatcher注册边界。非空manual frame先完成raw/capability preflight，再要求dispatcher对caller原序全部touch生成等长plan，最后才统一消费resolution并stage；缺dispatcher、plan漏项或后项失败均零消费、零pending、零trace。
- `execInput`只提交已preflight plan，随后记录不含capability/button对象的trace；dispatcher commit不允许返回可失败结果，避免输入开始后再引入portable validation。
- 本批只建立M04事务承载层，不宣称已恢复InputManager phase分发、GamePlayButton数组或NoteManager候选；这些仍处于M04后续批，禁止用no-op dispatcher进入production host。
- production与testing TypeScript通过；M03定向兼容测试已在工作树扩展为6项，按生产/测试分离纪律留待下一提交。

#### 2026-07-29 第八批：M04事务基础定向测试

- 既有M03非空帧测试显式注册production形状的dispatcher，确认Began/Moved/Stationary/Ended每个外帧只commit一次；owner direct case改为断言pure preflight不消费、explicit commit才将count从0变1。
- 新增无dispatcher与dispatcher漏项两条later-failure路径：已签发resolution在两类失败后均保持unused，pending/trace/owner snapshot全对象deep-equal；错误plan的commit函数若被误调用会直接抛错。
- 定向测试现为6项，冻结MJ contract检查与dependency verifier继续通过；production文件未在测试提交中修改。

#### 2026-07-29 第九批：M04 phase/owner与ordinary candidate生产实现

- host为每个engine创建唯一`GamePlayInputDispatcher`并注册到InputManager；dispatcher固定15个finger owner槽和ButtonType 0..15的16个GamePlayButton，resolver只可取得dispatcher-own button对象。
- preflight按caller touch原序在clone投影上执行：Began使用本帧resolution并投影finger→button，Moved/Stationary/Ended只复用已有/本帧先前owner；foreign GamePlayButton在任何commit前拒绝。commit严格重放已登记plan，不重新解析caller数据。
- GamePlayButton固定15槽began-position与touch-note owner；Began按`NoteManager.activeNotes`正序、`NoteBase.IsContainsButton`和Float32 `abs(absolutePos-musicPos)`严格`<`选择ordinary首个更优候选。wide buttonTypes由chart owner读取；equal distance保留首个active。
- note finger检查保持原作顺序：先执行concrete family pure judgement preflight，再检查投影finger `<0`；同帧后续竞争者不重绑。成功commit顺序为button mapping→began position→note finger→button touch-note→concrete virtual commit。
- NoteBase新增finger owner、button containment和三类pure-preflight/void-commit虚边界；未恢复family统一失败关闭。snapshot仅暴露button type、finger、note index与position，不暴露对象/capability。
- Slide候选遇到current-node/near-judge-line需求统一`manual.slide-candidate-position-unimplemented`，禁止用root `absolutePos`近似；ordinary最终None过滤仍等待M05 exact `CalcNoteResultType`。因此M04保持进行中。
- isolated TypeScript、first-slice 17、Auto Live AL01–AL22与manual boundary 6项通过；M04 MJ03–MJ07定向测试留到独立测试提交。

#### 2026-07-29 第十批：M04 phase/ordinary定向测试

- 新增`simulator:test:manual-input-dispatch`，先从冻结oracle直接确认MJ03–MJ07无unknown、strict equal不替换、cross-family无synthetic tie-break、resolver-only provenance、首touch finger owner及后续phase不重绑。
- 使用production NoteManager active list、GamePlayInputDispatcher和InputManager plan/commit路径；测试note只提供family pure judgement结果与commit记录，不传候选、expected distance或私有owner。
- equal-distance双ordinary验证首个active；wide `[1,2]`同帧finger0/finger1竞争验证两个button owner均保留而note只绑定finger0，且两个pure judgement发生在finger检查前、只有一个commit。
- Moved/Stationary/Ended验证复用Began button/note并向family保留raw phase 1/2/3；None结果不绑定note但保留resolved button owner。
- later第二family拒绝与跨dispatcher foreign GamePlayButton均验证resolution未消费、finger/button/note/trace全域零mutation。定向5项与dependency verifier通过。
- `firstSlice.test.ts`仅适配direct GamePlayButton构造必须显式ButtonType；production文件未在测试提交中修改。

#### 2026-07-29 第十一批：M05 Float32判定纯内核

- 新增DOM/Note对象无关的`manualJudgement.ts`，固定NoteResultType `-1..4`与JudgeTiming `0..2`数字身份。
- `GetSecWithDistance`严格按ARM64 Float32顺序执行`f32(f32(f32(240 / bpm) * distance) / 192)`；distance/BPM必须是exact finite Float32且BPM>0。
- `GetResult`使用bits `0x3C888889`的Float32 `1/60`相除，执行away-from-zero midpoint rounding，再按strict exclusive `< sweet+3/+6/+7/+8`映射Perfect/Great/Good/Bad/None。
- `JudgeNote`先以Float32 `abs(notePos-currentPos)`换秒；仅Perfect timing=None，其余结果按`notePos-currentPos > 0`为Fast，否则Slow，与MJ02 raw None仍为Fast的实体oracle一致。
- 所有非Int32 sweetFrame、非exact Float32、非有限位置、非正BPM在运算前失败关闭；本批不接Note family、不分配OneFrame、不写finger/state。
- production TypeScript通过；工作树独立runner已逐项重放MJ02全部12行并验证3类非法输入，按提交纪律留到下一测试批。

#### 2026-07-29 第十二批：M05判定纯内核定向测试

- 新增`simulator:test:manual-judgement`，从冻结oracle直接读取MJ02并锁定algorithm原文、12个diff bits、rounded frame、raw result与JudgeTiming；不从TypeScript实现生成期望。
- production `getManualNoteResult`逐行匹配12/12；以BPM120和独立distance反构造调用production `judgeManualNote`，逐行匹配raw/timing。
- 额外验证Perfect→None timing、note在current后方→Slow，以及非exact `0.1`、BPM0、NaN position三类失败关闭；dependency verifier通过。
- production文件未在测试提交中修改。

#### 2026-07-29 第十三批：阶段README状态同步

- 修正`src/simulator/README.md`中“M04未实现”的过时描述：明确M04事务/phase/ordinary已完成、Slide near-line仍失败关闭，M05仅纯Float32窗口完成而family/OneFrame未实现。
- 本批不修改生产行为或测试。

#### 2026-07-29 第十四批：M05 Normal Began与manual OneFrame生产实现

- `NoteManager`为每个pooled note登记manual runtime，只暴露owner-adjusted music position与current BPM；production host将同一NoteManager source identity登记为OneFrame manual owner。
- NoteNormal pure preflight调用M05 Float32 `JudgeNote(sweetFrame=0)`；raw None只返回候选拒绝，不预留slot、不写finger/state。raw Bad/Good/Great/Perfect在GamePlayButton完成projected finger `<0`检查后才预留OneFrame，保持“concrete judgement先于finger检查、OneFrame晚于owner竞争”的证据顺序。
- dispatcher为每个non-empty outer frame创建局部manual judgement transaction；后项失败调用abort并丢弃全部局部reservation。commit plan只能由原transaction单次消费，全部touch commit后finish；resolution消费、button/finger/note与OneFrame仍由同一整帧preflight覆盖。
- OneFrame controller从owner source/raw result/raw timing派生buttonTypes、note type0、adjusted identity、`Great/Perfect +1`、其余`-1`及Miss/Perfect timing清零；R14实体Good/Slow与Miss均确认raw=adjusted，当前类型中不存在active situation-skill transform owner。
- 本批只接受Normal source；Flick/Directional仍保留family evidence-required。为不提前冒充M10 simultaneous aggregation，同一outer frame第二个manual OneFrame reservation在任何commit前`one-frame.multiple-manual-judgements-unimplemented`失败关闭。
- Normal commit顺序为button/finger owner→owner-bound OneFrame setup→Note Deactive/finger清理；score/power/life/skill/audio/render字段继续在类型上缺席。
- isolated testing TypeScript、first-slice 17、Auto Live AL01–AL22及manual dispatch 5项通过；测试桩接口适配与Normal定向测试留到独立测试提交。

#### 2026-07-29 第十五批：M05 Normal定向测试

- 新增`simulator:test:manual-normal`，先直接读取冻结R14/MJ11：确认Long Good实体`raw=adjusted=2`、`addCombo=-1`、Slow，以及Miss实体`raw=adjusted=0`、timing清零；不由production实现生成期望。
- production图使用真实BPM120/music position0和chart absolutePos生成判定：position2→Perfect、10→Good、13→None；测试不注入result/timing/slot/note owner。
- Perfect验证preflight无controller mutation、commit严格get-usable→setup-manual、slot0闭合字段、active removal与finger清理；Good验证raw/adjusted identity、Fast、combo -1及单entry aggregate。
- None验证只保留Began finger→button，不绑定touch-note、不预留OneFrame且note继续active。
- 两个不同button的Perfect同帧验证第二reservation在preflight失败，两个resolution均未消费，dispatcher finger、NoteManager snapshot、OneFrame slot/trace全部零mutation。
- 原M04测试桩只适配新的owner-produced Began plan接口；production文件未在测试提交中修改。Normal定向4项与dependency verifier通过。

#### 2026-07-29 第十六批：Flick movement边界复核与README同步

- 冻结10.1.4 `calculateScreenPosToWorldDistanceRate`确认raw screen position先经Camera ScreenToWorldPoint，再除全局scale与calculated-data scale；Flick/Directional严格阈值消费的是该rate，不是像素距离。
- portable contract只允许raw Float32 screen position进入resolver并取得GamePlayButton capability，当前host没有证据允许的Camera/scale owner或movement-rate capability。因此Flick/Directional继续在concrete family preflight失败关闭，不以像素delta、固定屏高、clamp或epsilon替代。
- 同步`src/simulator/README.md`：Normal/单manual OneFrame已实现；Flick/Directional、Slide near-line与M10 simultaneous aggregation仍未实现。
- 本批不修改生产行为或测试。

#### 2026-07-29 第十七批：M03/M05 portable geometry owner生产边界

- 修复public host无法签发manual button capability的根边界：`SimulatorEngine.resolveManualInputButton(rawPosition)`只接收exact finite Float32 raw screen position；生命周期/fault/pause/manual-mode验证先于geometry backend。
- 新增`SimulatorManualInputGeometryBackend`可信宿主端口，分别拥有raw position→ButtonType、ScreenToWorld、camera/gameplay normalization与target containment；caller仍不能提供button type、world rate、note、result、timing或Slide cursor。
- geometry解析成功后，host从当前dispatcher取得canonical GamePlayButton，再由当前InputManager session签发位置绑定opaque capability；null lane保持显式null。Auto Live、foreign/out-of-domain lane及recording backend均失败关闭。
- NoteManager把同一geometry owner登记到每个concrete note manual runtime，为Flick/Long/Slide后续screen-to-world rate和containment提供owner；direct manager和recording backend不设置默认lane/scale，统一evidence-required。
- production/testing TypeScript、first-slice 17、Auto Live AL01–AL22及manual boundary 6项通过；public resolver定向测试留到独立测试提交。

#### 2026-07-29 第十八批：public geometry owner定向测试

- manual boundary扩为7项：created/paused/disposed与Auto模式在geometry callback前拒绝，NaN在callback前拒绝，recording backend明确unavailable。
- owner backend只从raw position返回lane；host验证0..15并取得当前dispatcher canonical button，再由InputManager签发capability。null不签发，越界lane不增加issued count。
- 测试geometry的movement/normalization/containment方法若被button resolver误调用会抛错，证明lane签发未混入下游判定或movement事实。
- production文件未在测试提交中修改；manual boundary 7项与dependency verifier通过。

#### 2026-07-29 第十九批：Flick Began 10.1.4静态补充证据

- 实施复核发现原103方法清单缺少concrete owner实际消费的`NoteFlickBase.ExecTouchBegan`，立即停止Flick生产实现；未把10.1.3 method index或本地dump正文当作目标版本行为。
- Reverse extractor按managed identity在锁定10.1.4 binary/metadata独立解析`0x3A768C0–0x3A76908`：None在mutation前返回；非None清`frameCounter +0x188`、缓存raw/timing于`+0x18C/+0x190`并切Wait。对应`NoteFlickBase`布局逐版本一致。
- Reverse静态契约升级为104方法/13布局/13 enum，逐word、边界、签名、ELF与runtime oracle verifier均通过；补充提交`40dbc862d667679d05ef8375f35df5464ba1ce7b`已推送`origin/main`且`0 0`。
- Garupa冻结包升级为127项，8个更新文件与新ARM64均直接读取该Git对象；manifest、README、OPEN_GAPS和Python-free verifier锁定新commit/count/hash。
- 本批只补证据和任务书，不修改Flick production行为。

#### 2026-07-29 第二十批：Single/Flick完整owner补充证据

- Began必然切Wait后继续沿10.1.4调用图补齐完整直接owner，不以未确认Wait no-op结束：新增`NoteSingleBase.MoveState/onMiss/forcePerfect/.ctor`、`NoteFlickBase`剩余方法及Flick/Directional synthetic-X getter共13个独立ARM64范围。
- 当前版本确认Single在note line前清miss counter，越线后按Float32 delta累加且仅`> MissSecondInterval`调用onMiss；Flick Wait累加execute-frame并在`>=7.0`走forcePerfect，base Moved/Ended为确认的直接ret。
- static contract升级为117方法/14布局/13 enum，Reverse补充提交`1432b7def25faafee4cc713423305d2c1fb7def4`已推送0/0；runtime oracle保持5条R1/MJ01–MJ26不变。
- Garupa冻结包升级为140项并锁定新commit/count/hash；本批仍不修改production行为。

#### 2026-07-29 第二十一批：NoteBase AfterUpdate补充证据

- Flick Wait production图复核发现当前`NoteFrontBase.executeAfterUpdate`在manual无条件失败，会阻断每次Began后的同outer-frame调度；未直接改为no-op。
- Reverse新增10.1.4 `NoteBase.ExecuteAfterUpdate 0x3A75A98–0x3A75B1C`：只在presentation-owned NoteSyncLine存在时调用其OnUpdate，缺席时直接返回，不产生gameplay mutation。
- static contract升级为118方法/14布局/13 enum；Reverse提交`ce5353fdc54a3ba8188f3dccd4accdc6c2ef4ce2`与Garupa 141项冻结包均验证并推送。
- 本批只补证据；production修复随M05 Flick批提交。

#### 2026-07-29 第二十二批：M05 Single/Flick production实现

- 新增可信geometry owner上的ARM64 Float32 distance-rate链：两次ScreenToWorld、XYZ平方/加法/sqrt、`1/cameraScale`乘法与gameplayScale除法逐操作`fround`；owner输出非exact/nonfinite/zero scale失败关闭。
- `NoteFlickBase`按10.1.4恢复：Began None零mutation；非None缓存raw/timing、清frame counter并切Wait；Wait按`f32(delta*60)`累加且`>=7.0`走synthetic Perfect；Ended为确认空virtual。
- Flick Moved严格`>0x3D23D70A`提交type3；Directional先计算full rate并检查10/11左右方向，再对Y=0投影严格`>0x3C23D70A`提交type9。阈值未过不预留OneFrame、不改变state。
- continuation preflight现在携带owner-generated transaction plan；successful Moved在全帧preflight后才commit OneFrame并deactivate。OneFrame closed payload扩展为Normal/Flick/Directional family-noteType组合；Multiple继续M06明确失败关闭。
- 修正M04 phase jump table：Stationary保留finger/button/note owner但不调用concrete Moved virtual；Moved/Ended继续消费Began owner。
- `NoteSingleBase.MoveState`恢复strict `> MissSecondInterval`自然Miss；NoteBase AfterUpdate在缺席presentation sync-line时返回ok，不再错误阻断manual Single。
- production/testing TypeScript、Auto Live AL01–AL22、Normal 4项及Flick工作树定向6项通过；M04测试预期修订和Flick测试文件留到独立测试提交。

#### 2026-07-29 第二十三批：M05 Single/Flick独立测试

- 新增production `NoteManager → GamePlayInputDispatcher → NoteFlick/NoteDirectionalFlick → InGameOneFrameJudgementController`图测试；测试只提供可信geometry backend的identity ScreenToWorld与owner scale 1，不注入result/timing/rate/slot。
- 直接消费MJ08/MJ09冻结before/equal/after Float32 bits，验证Flick strict `>0.04`三行与Directional方向+horizontal strict `>0.01`；successful OneFrame分别为type3/type9且使用Began缓存结果。
- 锁定Stationary不调用concrete note、Ended空virtual保留Wait、Began不发OneFrame、Wait第6帧不触发/第7帧synthetic Perfect。
- 同步first-slice已过时的manual AfterUpdate拒绝断言与M04 Stationary-as-Moved断言；未改变production实现。
- testing TypeScript、first-slice 17/17、M04 dispatch 5/5、Flick 6/6与Auto Live AL01–AL22通过；M05关闭，下一批进入M06 Multiple Directional。

#### 2026-07-29 第二十四批：M06 Multiple Directional production实现

- 复用已验收G21 source-order runtime group owner，不修改chart：owner现在同时持有count、source-order button list、used与单manual finger；OneFrame controller由owner解析count/buttons，request不能伪造group数据。
- Multiple Began复用FlickBase的None早退和cached result/Wait，但non-None额外在outer-frame transaction-local WeakMap预留group finger；later同帧第二finger在任何resolution/finger/note/OneFrame commit前失败。
- Moved严格保持ARM64顺序：检查used→full rate→左右方向→horizontal rate strict `>0.01`→`f32(f32((count-1)*0.01)+0.01)` full-rate strict `>`；未过阈值零reservation。
- success commit先mark current/group used，再提交owner-derivedtype10 OneFrame，随后记录side-used并deactivate；siblings在同outer-frame随后的NoteManager Update观察group used后deactivate，不产生额外结果。
- Multiple 7-frame synthetic在manual使用独立transaction先完整preflight，再mark group、commit type10 Perfect、finish；Auto Live原路径和G21 group count保持不变。
- manual judgement ownership从布尔predicate升级为`source→{multiple count, button types}|null`；Normal/Flick/Directional要求两个Multiple字段均null，Multiple要求count正整数且与唯一owner button list长度一致。
- production/testing TypeScript、Normal 4项、Flick 6项、M04 dispatch 5项、M06工作树6项及Auto Live AL01–AL22通过；测试接口适配与M06测试文件留到独立提交。

#### 2026-07-29 第二十五批：M06 Multiple Directional独立测试

- 新增count 1/2/3 production `NoteManager→dispatcher→Multiple→OneFrame`图；identity geometry只提供ScreenToWorld/scale owner，测试不注入rate/result/count/button projection。
- runner先直接验证MJ10与10.1.4 Moved/count ARM64操作顺序；测试用独立hardcoded threshold bits `0x3C23D70A/0x3CA3D70A/0x3CF5C28F`及其next Float32，逐count锁定equal不判、next判定。
- 每个success验证type10、Began cached result、owner group button list/count；随后同frame NoteManager update只deactivate side siblings，不增OneFrame。
- wrong direction、同帧第二finger与consumed-side duplicate分别验证零reservation/零全局mutation；7-frame synthetic验证manual type10 Perfect与side cleanup。
- 测试批只适配Manual owner返回值和Auto Live direct runtime-group test double的新接口，不修改production；testing TypeScript、M06 6/6、Normal 4/4、Flick 6/6、M04 5/5及Auto Live AL01–AL22通过。
- M06关闭，下一批进入M07 Long。

#### 2026-07-29 第二十六批：M07 Long production实现

- Long Began使用owner-adjusted position/BPM：None/Miss与重复Stop均不绑定；Good/Great/Perfect在whole-frame commit时提交type4 head、保存touch origin并切Stop。
- owner delta由host作为Float32写入prepared frame并随opaque dispatch plan进入note；调用者仍不能提供delta。Long Moved containment内重置8.0，外部严格`f32(grace-delta)`且不clamp。
- Flick after严格`>0.04`；Directional按after左右方向并严格horizontal `>0.01`；Multiple再要求full严格`>f32(f32((count-1)*0.01)+0.01)`。raw None先更新cached origin，result非None、movement success且grace>0才合成tail。
- Long physical Ended：Normal按target containment保留raw或转Miss并提交type2；Flick/Directional/Multiple未成功move均转Miss，成功move已在同一Moved中合成type5/6/7并deactivate。
- chart-construction已确认的directional endpoint/group关系直接导出给NoteManager；Long Multiple tail owner从root+LongAdd helper重建count/button list，缺helper失败关闭，禁止复用head button数组。
- manual OneFrame ownership扩展Long head/tail absolute position、note type、button list与Multiple count；payload phase保留head/tail，Miss/Perfect timing继续owner清零。
- Long no-touch crossing在manual只切Wait，不再沿Auto提交；Wait/Stop自然timeout仍留M09。production TypeScript、first-slice 17/17、M07工作树4项及Auto Live AL01–AL22通过；旧direct测试delta适配和M07测试文件留独立提交。

#### 2026-07-29 第二十七批：M07 owner-delta fail-close修正

- production host始终把validated outer delta传给InputManager并冻结为Float32；direct InputManager内部调用可省略该owner输入，但prepared plan显式保存`null`而不是0/default。
- Normal/Flick/Directional/Multiple不消费delta，保持既有direct隔离图；Long non-Normal Moved在任何judgement reservation、grace或note mutation前要求非null owner delta，否则`manual.long-owner-delta-unavailable`。
- 该修正避免为测试伪造0 delta，同时保持M03 host complete-preflight与M07 `f32(grace-delta)`证据边界；production TypeScript及M05/M06定向回归通过。

#### 2026-07-29 第二十八批：M07 Long独立测试

- 新增Long production图并直接读取MJ11–MJ15及Began/Moved/judgeAfter ARM64；测试只提交raw touch、identity ScreenToWorld、containment owner和host delta，不注入result/timing/note type/count/grace。
- 验证head type4→Stop、Normal physical Ended inside type2/outside Miss、Flick strict equal/next→type5 synthetic、Directional type6、Multiple count2 next threshold→type7及owner button `[2,1]`。
- grace从inside重置8.0；outside以delta8严格减到0时即使movement超过阈值也不成功，后续physical Flick release转换Miss并清timing。
- 修订M03 fault-priority测试：旧的manual base AfterUpdate故障已被R19关闭，改用确认presentation-unimplemented的Multiple visual active update产生terminal latch，不修改production。
- M07 4/4、manual boundary 7/7、M04 5/5、M05 Normal4/Flick6、M06 6项、first-slice 17/17、Auto Live AL01–AL22与testing TypeScript通过；M07关闭，下一批进入M08 Slide。

#### 2026-07-29 第二十九批：M08 Slide production实现

- Slide candidate不再读取root absolutePos：NoteSlide暴露parent-owned current source/button，NoteManager分别strict scan ordinary/current Slide，再由SlideNoteManager消费backend gameplay-local current X与button3 X执行原作`fabs`/`<=` near-line选择。
- geometry backend新增可选Slide raw owner：current gameplay-local X、button local X及strict-increasing judge positions/virtual line；backend不返回result/correction/cursor，recording/default仍缺席并失败关闭。
- SlideNoteManager按10.1.4 `setupPositionJudgeDataList`距离0..7映射`4,4,4,3,3,3,2,1`，以virtual-line overed index和upper interval计算raw result/signed correction；所有几何必须exact finite Float32。
- Slide head非None（含Miss）在commit提交type8并切Stop；current cursor留在parent。visible intermediate先containment，invisible跳过；band Perfect或nonzero judgeOffset owner下Great promotion且signed correction<=1时提交type8、mark并只推进一次。
- terminal game type4..7沿band type8；type8严格`>0.04`，9/10按方向严格`>0.01`，11/12再检查group count full threshold；grace沿用owner delta不clamp。physical early release对current intermediate提交type8 Miss并deactivate。
- Slide root/child各自注册manual ownership（phase、allowed note types、absolute position、buttons）；Multiple terminal沿chart endpoint+Add helper重建group buttons/count，缺helper失败关闭，不开放caller cursor/result。
- production/testing TypeScript、M08工作树4项、M07 4项、first-slice 17/17与Auto Live AL01–AL22通过；M04 Slide gap关闭，测试文件留独立提交。

#### 2026-07-29 第三十批：M08 Slide独立测试

- 新增production Slide图并直接读取MJ18–MJ22、Judge/Began/Moved/GetNear ARM64；backend只返回current/button local X及judge position/virtual-line原始几何，不返回result/correction/cursor。
- near-line组合同时激活ordinary与Slide且相同root distance，backend current X使Slide更靠近button3；实际Began绑定Slide→Stop而Normal保持Move，证明不再用root absolutePos替代。
- 验证head→visible intermediate→terminal每次只推进一个cursor并分别type8；parent deactivation回收child和cursor。
- invisible intermediate在containment=false时仍走band；raw Great位于signed negative correction且owner judgeOffset非零时promotion Perfect，锁定Great correction路径。
- terminal Flick equal `0x3D23D70A`不判、next判定；early physical release在non-terminal current提交type8 Miss、timing清零并parent cleanup。
- M08 4/4、M07 4/4、first-slice 17/17、Auto Live AL01–AL22与testing TypeScript通过；M08及M04关闭，下一批进入M09 timeout。

#### 2026-07-29 第三十一批：M09 timeout与M10 aggregation production

- Long manual Move crossing继续只切Wait；Wait按`GetSecWithDistance(f32(adjusted-root), bpm) > 0x3E5DDDDE`严格触发，单一transaction先完整预留两个owner-validated type1 Miss，再按slot顺序commit并deactivate。equal不触发。
- Long Stop按tail absolute position相同strict规则，映射Normal/Flick/Directional/Multiple type2/5/6/7单Miss；Multiple count/buttons仍由chart group owner闭合，mark/deactivate在成功提交后。
- Slide manual Move不再保留旧`manual-slide-judgement`缺口而切Wait；Wait同时消费front strict deadline与首pending visible midpoint条件，front timeout提交root type8 Miss后进入Stop。
- Slide Stop按current child strict timeout提交type8 Miss；连续invisible child由parent cursor按原序mark/skip且不提交OneFrame；terminal或cursor结束后parent deactivation。
- M10移除旧`one-frame.multiple-manual-judgements-unimplemented`：一个outer-frame transaction最多预留五个独立owner plan，所有preflight保持local，commit按caller顺序占first-unused；第六个在任何domain mutation前`one-frame.pool-exhausted`。
- Long timeout两个Miss共享同一transaction，确保只剩一槽时不会只提交第一个；跨producer已提交slot仍保持原作fixed pool exhaustion行为。
- NoteManager新增单一dispatcher-owned deactivation callback；GamePlayButton按note identity清除touchNotes/beganPosition，dispatcher同步清finger→button owner，Normal/movement/timeout的deactivate不遗留stale owner。
- production/testing TypeScript、M09 4项、M10双Normal aggregation、manual boundary 7/7、dispatch 5/5、M07 4/4、M08 4/4、first-slice 17/17与Auto Live AL01–AL22通过；测试文件留独立提交。

## 2. 固定范围

### 2.1 纳入范围

- `InputManager.ExecInput/inputPlaying/inputButton`在Playing状态下的phase 0–3分发。
- 每个finger的Began button绑定，以及Moved/Stationary/Ended复用。
- `GamePlayButton.ExecTouchBegan/Moved/Ended/CalculateTouchEndedJudge`。
- `NoteManager.GetMoveEndTimeNearestZeroNote`、`NoteBase.IsContainsButton`与普通/Slide候选比较。
- `NoteUtility.GetResult/JudgeNote/CalcNoteResultType/CalculateSlideNoteJudgeTiming`。
- Normal、Flick、Directional、Multiple Directional手动判定。
- Long/Slide hold、move、grace、direction、multiple count、release、synthetic ended和finger清理。
- Long Wait/Stop自然超时、Slide Wait/Stop自然超时、invisible child skip。
- 已确认raw/adjusted result、JudgeTiming、note type、position、button identity和Multiple count的OneFrame projection。
- outer frame输入顺序、pause冻结、fault/dispose终态和失败原子边界。
- 普通与HABAHIRO production chart上的手动输入固定轨迹。

### 2.2 排除范围

- DOM Pointer/Touch事件、Tauri、移动端Activity、窗口协议、React组件和`App.tsx`。
- Unity Physics/Raycast、Camera矩阵、屏幕分辨率与Pixi lane hit-test的生产适配；M03只建立证据允许的可移植resolver边界。
- Unity touch phase `Canceled`及states 4/7/15，除非M02新增证据。
- Score、Power、Combo消费、Life、Never Die、Skill、Fever、Crescendo、record和HUD。
- Tap/Flick/Hold音效、CRIWARE、Web Audio、lane effect、flash、particle、animation和Sprite。
- `RefreshAfterMoveTime`、seek、倒带、ReturnTime和16秒无输入回放。
- situation-skill result transform、mode14/debug Force Perfect。
- Unity PlayerLoop精确相位、设备采样到应用帧的操作系统延迟和GPU呈现。
- GarupaEditor整体构建、Vite/Tauri联调和主程序接入。

## 3. 强制执行规则

1. V01、M01与M02全部关闭前，禁止修改`src/simulator/**`生产实现和手动输入测试运行入口。
2. 新证据必须先提交Reverse，再冻结到GarupaEditor；禁止复制Reverse未提交工作树、`.claude/`或`runtime/tools/`。
3. 10.1.3与10.1.4证据必须分目录、分manifest、分oracle保存；禁止通过RVA delta、同名方法、相同签名或时钟rebaseline外推手动输入行为。
4. 静态与实体证据冲突时，先回Reverse修订结论与contract，再更新本任务书，最后才实现。
5. 每个字段、比较符、列表扫描、候选替换、finger写入、状态转换、OneFrame提交和清理都必须引用P/S/D/R系列证据。
6. README、pseudocode和JSON是摘要，不可覆盖直接ARM64/C/status；摘要与直接源冲突时硬门保持关闭。
7. global bundle候选必须在Reverse按10.1.4导出独立、边界可校验的切片后才能晋升；不能只引用10.1.3的15MB bundle行号作为生产依据。
8. Python只能在Reverse生成离线oracle；TypeScript生产、package scripts和测试不得调用Python、Reverse工作树或网络。
9. 测试不得调用private方法、写private cursor/state、注入expected result/BPM/note owner或由待测实现生成expected。
10. 同一输入帧的preflight必须覆盖全部touch、finger、phase、position、button capability和owner关系；后一个坏touch不能留下前一个touch的partial mutation。
11. public host在faulted/disposed时，生命周期terminal failure优先于input shape、delta校验、owner callback和backend副作用；只允许snapshot与幂等dispose。
12. 任何未确认分支统一`evidence-required`，并在对应owner mutation之前返回；不得使用no-op、默认manual、默认空touch、clamp、自动纠错或“最近lane”。
13. production修复与最终验收分批提交；M11必须从提交后全新产物独立复验。

## 4. 目标架构与所有权

```text
portable host input frame
  -> InputManager outer-frame owner
      -> finger -> GamePlayButton capability owner
          -> NoteManager candidate arbitration
              -> Note/Slide current-node owner
                  -> NoteUtility timing owner
                      -> concrete Note ExecTouch*
                          -> OneFrame five-slot owner
                              -> one outer-frame Reflect
```

### 4.1 宿主边界约束

M03只能在M02后锁定具体TypeScript接口，但最终边界必须满足：

- 输入帧显式属于一次`step`，不存在跨step隐式全局队列。
- touch顺序保持oracle原始枚举顺序；不得按finger、lane或phase排序。
- `fingerId`为已证实范围内整数；`phase`只接受已证实成员；position按原作Float32转换并拒绝非有限值。
- button/lane只能由当前engine的input resolver签发不可伪造能力；纯数字buttonType不能替代resolver provenance。
- resolver只承担宿主到原作`GamePlayButton`边界的映射，不得返回note、result、timing或当前Slide节点。
- no-touch必须是显式、可观察且与Auto Live兼容的输入帧事实；是否允许省略payload由M02锁定，不设方便调用的默认值。
- host snapshot只输出只读finger/button/note ownership与input trace，不泄露可修改handle。

### 4.2 引擎所有权

- `InputManager`：一次outer frame的touch枚举、phase dispatch、finger→button持久关联。
- `GamePlayButton`：buttonType、touch start position、finger→note关联及began/moved/ended入口。
- `NoteManager`：active list扫描、button覆盖过滤、ordinary/Slide候选与最终None拒绝。
- concrete Note：finger字段、touch状态、move origin/grace/success、Long/Slide child cursor和完成/回收。
- `NoteUtility`/`SlideNoteManager`：result与JudgeTiming；调用者不得提供计算结果。
- OneFrame controller：固定五槽、owner-bound handle、closed payload和Reflect后统一回收。
- `InGameManager`：input→Note update→Reflect顺序、pause、fault latch和dispose。

## 5. 已提交版本证据与历史静态迁移候选

### 5.1 当前版本来源与状态

- Reverse当前锁定证据提交：`ce5353fdc54a3ba8188f3dccd4accdc6c2ef4ce2`。
- 当前目标样本：`jp.co.craftegg.band` 10.1.4（230），`arm64-v8a`。
- P01–P05确认版本身份、锁定二进制和既有时钟采集目标；手动输入静态/R1/oracle行为由R01–R17确认。
- S01–S73全部来自10.1.3/229，只用于列出迁移目标和审计旧结论。其字节与SHA仍按旧Git blob保留，但不得冻结为10.1.4证据或被M03–M11消费。
- 路径均位于Reverse仓库；SHA-256按Git blob原始字节独立计算，使用大写完整值。

| ID | Reverse HEAD路径 | 字节 | SHA-256 | 版本结论 |
| --- | --- | ---: | --- | --- |
| P01 | `artifacts/investigations/package-version-rebaseline-10-1-4/README.md` | 6163 | `5E37640F8F9F0B24E10B016606FE46E9361F4005606BE82EBC00FF44761E09B5` | 10.1.4/230为设备当前版本；禁止跨版本合并 |
| P02 | `artifacts/investigations/package-version-rebaseline-10-1-4/targets.tsv` | 6117 | `2295CCD41B1660EB666613A8A36D354D7B763C9E2DFF83DE2C1B433011819019` | 仅既有时钟目标地址迁移 |
| P03 | `artifacts/investigations/package-version-rebaseline-10-1-4/version_map.json` | 45298 | `70E9C5981269F3096F384FF85D50A6DEA2855399984DDF59B6664306634DE48B` | 目标binary SHA、70/7/6/8迁移结果 |
| P04 | `artifacts/investigations/package-version-rebaseline-10-1-4/verify_version_rebaseline.py` | 4923 | `516E366BBFABB59A9794A791EDBF53376DB50E23C6BC3BA4559DB1A745F8AFE2` | 离线版本映射verifier |
| P05 | `artifacts/investigations/clock-scheduling-runtime-oracle/closure.json` | 15313 | `442263A74CCCE65BC029C4C8A246D9563EEE32DD506AFF76798B045CF6622EDD` | 时钟已在10.1.4重新取证并关闭；不替代手动输入取证 |

### 5.1.1 10.1.4手动输入最终契约

| ID | Reverse `ce5353fd`路径 | 字节 | SHA-256 | 结论 |
| --- | --- | ---: | --- | --- |
| R01 | `artifacts/investigations/manual-input-runtime-contract-10-1-4/README.md` | 9171 | `0A886CEBA1DDDA668CDA0AA00476FE093727716D6D00DB84272D4123CED07565` | 版本、静态、R1、chart与最终边界 |
| R02 | `artifacts/investigations/manual-input-runtime-contract-10-1-4/manual_input_static_contract.json` | 578113 | `14626F571BECF45EBA9D4045F5C2EE3F991387A6562BD4BAF351E87A88EA973C` | 118方法逐word、14 type、13 enum |
| R03 | `artifacts/investigations/manual-input-runtime-contract-10-1-4/targets.tsv` | 15262 | `C5227E804D088740CE1457B1CCB40513A6A04DF315DDC23E19CFDBFDD1C679B9` | 118/118当前RVA、边界、大小与独立ARM64 |
| R04 | `artifacts/investigations/manual-input-runtime-contract-10-1-4/SHA256SUMS` | 16081 | `3C2281B44547786447D2D23940E5E9C4852B0D2E23D57287C50ED30DF2E1300D` | 静态、runtime、plan、脚本和oracle的134项哈希 |
| R05 | `artifacts/investigations/manual-input-runtime-contract-10-1-4/verify_manual_input_contract.py` | 9522 | `7C829343276C1B1B6AF66AEFDC4E02B5FDEA26E380D9132AF0AF00DAE168AF44` | 118/14/13、差异、ELF常量、Single/Flick/AfterUpdate、边界与构造校验 |
| R06 | `artifacts/investigations/manual-input-runtime-contract-10-1-4/arm64/0321b414__NoteSlide__WaitState.arm64.tsv` | 5482 | `8054265CE4A20753CA083EE6E348E68C343A5671438F14FDADF3C20892ACC531` | 独立范围`0x321B414–0x321B628` |
| R07 | `artifacts/investigations/manual-input-runtime-contract-10-1-4/arm64/0321b628__NoteSlide__execOverWaitState.arm64.tsv` | 1291 | `C0E28381AEBD0D00C86EC5BE352FF2470530CC1EF9374229F4B82BC7B9F473F6` | 独立范围`0x321B628–0x321B69C` |
| R08 | `artifacts/investigations/manual-input-runtime-contract-10-1-4/closure.json` | 3644 | `9B739D697A45C4F8FB33ED40D816ADF0459BEF9AB785745447B2FF1BED97CE53` | V01/D01–D15与manual gate全部关闭 |
| R09 | `artifacts/investigations/manual-input-runtime-contract-10-1-4/manual_input_fixed_event_oracle.json` | 31574 | `C3C4CE2AD4CAAE4E1A1187C9D2A4B320C5095174E8C2C2FB4580F47E74D69215` | portable contract、chart身份与MJ01–MJ26 |
| R10 | `artifacts/investigations/manual-input-runtime-contract-10-1-4/capture_manual_input_runtime.py` | 20086 | `E489C232779AB295BF223A24FCE8F2B47D1A907460F239328F5C4BF911A9713D` | 单指/Long/Slide R1采集脚本 |
| R11 | `artifacts/investigations/manual-input-runtime-contract-10-1-4/capture_manual_multitouch_runtime.py` | 22172 | `31555FC51CAD1F98C65B443D3298D246EC08C57357202FB7F82DDB3DD4CF3089` | 两指Linux MT与SELinux恢复控制 |
| R12 | `artifacts/investigations/manual-input-runtime-contract-10-1-4/verify_manual_input_runtime_oracle.py` | 9111 | `021853DB879C07FF88CACFD75437A3EC926C4441E50A171EC927429D9ACB39AD` | 5条R1、对象/slot/order、chart与26 case离线校验 |
| R13 | `artifacts/investigations/manual-input-runtime-contract-10-1-4/runtime/easy-play.json` | 2490152 | `376D5A9A84F385F0631AA6D39690980E3BA14F60AAC78DE34F0B9C8CA4CDD123` | phase0/1/2/3、坐标与InputManager/button链 |
| R14 | `artifacts/investigations/manual-input-runtime-contract-10-1-4/runtime/hard-touch.json` | 4415127 | `A1F6263132689DEB0CA254F7C29C2BF20C63F5CD2A14B5EC89E0714105D35E1D` | Long Good/Slow头、physical release、finger清理 |
| R15 | `artifacts/investigations/manual-input-runtime-contract-10-1-4/runtime/hard-timeout.json` | 1646725 | `7D5839CDAD697D429AA83673F3435D224F793CC042840E9756D7F57919AC64A2` | Long同outer-frame双Miss双槽单Reflect |
| R16 | `artifacts/investigations/manual-input-runtime-contract-10-1-4/runtime/expert-timeout.json` | 1623996 | `75FEF6B5D7C7C0719BB3F37C1867D67E4EF59E569AED7109F740F177D2E1413E` | Slide root/after timeout与button4/6 |
| R17 | `artifacts/investigations/manual-input-runtime-contract-10-1-4/runtime/ui-multitouch.json` | 357522 | `DA0214D9C4B3005A44F059B0E3D276A8EA4C44A246F23DCC0FB8B0DCAC8C4D62` | finger0/1全phase、位置与枚举顺序 |
| R18 | `artifacts/investigations/manual-input-runtime-contract-10-1-4/arm64/03a768c0__NoteFlickBase__ExecTouchBegan.arm64.tsv` | 769 | `FAFEE4CC23D778B9CB5E162707566F506CCA6C4F9D27009EA4CCDA3E91B0D29A` | None早退；缓存raw/timing；切Wait |
| R19 | `artifacts/investigations/manual-input-runtime-contract-10-1-4/arm64/03a75a98__NoteBase__ExecuteAfterUpdate.arm64.tsv` | 1405 | `203F72AF3B7C2C759B66EBA06B0BB837B75F90F7F308A204BE1BD88D5C4B959E` | 仅existing sync-line更新；缺席时直接返回 |

R04覆盖118个独立ARM64导出及全部正式runtime/oracle输入。Garupa冻结包逐项指向最终提交`ce5353fd`并校验source/copy/index；旧10.1.3 bundle slice与任何Reverse未提交文件均不进入确认来源。

### 5.2 10.1.3输入开始与仲裁迁移候选

| ID | Reverse HEAD路径 | 字节 | SHA-256 | 用途 |
| --- | --- | ---: | --- | --- |
| S01 | `artifacts/investigations/touch-note-arbitration/README.md` | 7818 | `0558A928918794D603368A5CA4813D44FF9B957EDF5C50C30809C85605C2E489` | 调查结论、开放项 |
| S02 | `artifacts/investigations/touch-note-arbitration/targets.tsv` | 1044 | `F99BDC62E2177DAB28C8490DBC51CAF42DB737462C709AC2BCC254973E4A5D34` | 8个方法边界 |
| S03 | `artifacts/investigations/touch-note-arbitration/pipeline.pseudocode.cs` | 4978 | `FA22D5D7F3F108861BB1960C78798642806DF548756ED38CB3DFD2EC2AEDE1AC` | 摘要，不覆盖直接源 |
| S04 | `artifacts/investigations/touch-note-arbitration/decompiled/033139a0__InputManager__ExecInput.c` | 677 | `3560E603D996D42248BA2D476578545FF367A279F782212524598924D072754E` | states 5/17输入入口 |
| S05 | `artifacts/investigations/touch-note-arbitration/decompiled/03313bdc__InputManager__inputPlaying.c` | 6113 | `1839C6BD2220EE75DDF812D50FD858DA1CAF66085048793BF2122A5B8FD7EF4A` | touch枚举、finger/button关联 |
| S06 | `artifacts/investigations/touch-note-arbitration/decompiled/0331422c__InputManager__inputButton.c` | 1652 | `7BC84964B048695CB693002DFD07E92FCE3DCCAA62133C73894E6A337C600E7A` | phase 0/1/2/3虚调用 |
| S07 | `artifacts/investigations/touch-note-arbitration/decompiled/03777e84__NoteManager__GetMoveEndTimeNearestZeroNote.c` | 6646 | `2A632E2C4E4D1348AFC7EF8B113D1E094A5B2B5D17514E527C4D2D22F2452BF5` | active候选扫描与None拒绝 |
| S08 | `artifacts/investigations/touch-note-arbitration/decompiled/0387d5dc__GamePlayButton__ExecTouchBegan.c` | 5416 | `0FAB1F16FE1A5F460F388C80A1885586F9749C71DFD49E190BC7F2DFB01DC679` | Auto短路、finger/note owner写入 |
| S09 | `artifacts/investigations/touch-note-arbitration/decompiled/0321aaa4__NoteNormal__ExecTouchBegan.arm64.tsv` | 1486 | `D0F5D773B4FE146F2FC388BC006200538ADF44D96EA31985E21BEC63CAF9144E` | Normal note type 0，assembly fallback |
| S10 | `artifacts/investigations/touch-note-arbitration/decompiled/030ebd98__NoteLong__ExecTouchBegan.c` | 4586 | `370939E8589274D424C7E2E55575250D498F6A50531244D8D81335AD85BEE24A` | Long头、Miss/重复touch分支 |
| S11 | `artifacts/investigations/touch-note-arbitration/decompiled/0321c948__NoteSlide__ExecTouchBegan.c` | 12941 | `C1D71318FC347FD3D2AA37849755C7629E3E9DCF61E920E0F7F98896BCDC134D` | Slide头/节点6/7/8路径 |

### 5.3 10.1.3 Hold、move与release迁移候选

| ID | Reverse HEAD路径 | 字节 | SHA-256 | 用途 |
| --- | --- | ---: | --- | --- |
| S12 | `artifacts/investigations/touch-hold-release/README.md` | 8961 | `08238B2199D22C4EAB53168B46E2341FCB25A82B0B3660A7888AD96850AD49B0` | 调查结论、常量与开放项 |
| S13 | `artifacts/investigations/touch-hold-release/targets.tsv` | 2434 | `1FFB80DBF979EA28507E9AB4ADD3F9AC4A8DB2C8AD25DE6F6E30DF1FBD188E36` | 19个方法边界 |
| S14 | `artifacts/investigations/touch-hold-release/pipeline.pseudocode.cs` | 6909 | `7C32E37E868F4ADEE648815ABA0ADCDBB176264A84A454EB6F17944C18106D7E` | 摘要，不覆盖直接源 |
| S15 | `artifacts/investigations/touch-hold-release/decompiled/0387dbf4__GamePlayButton__ExecTouchMoved.c` | 1973 | `C27A718D361634240ACFA6E7B79B512E6FA09BE6396717150E54808C599BA8AF` | moved查owner并虚调用 |
| S16 | `artifacts/investigations/touch-hold-release/decompiled/0387dd08__GamePlayButton__ExecTouchEnded.c` | 2014 | `88EA0B777934C9D1395A71B342FB019E5EDF86F4B17FB904AC2365006F56F333` | ended重算result并虚调用 |
| S17 | `artifacts/investigations/touch-hold-release/decompiled/0387debc__GamePlayButton__CalculateTouchEndedJudge.c` | 2373 | `9839B2F1CAF57F0352A594923E63A598B0254B530C0B8802B9E08E07868AF2AF` | 普通sweetFrame=1与Slide Judge |
| S18 | `artifacts/investigations/touch-hold-release/decompiled/030ec0cc__NoteLong__ExecTouchMoved.c` | 8990 | `21A753C0BB3496CD84B7A60F721043173E64902380E9FB1D864DE1BBCD2C0800` | Long距离、grace、合成ended |
| S19 | `artifacts/investigations/touch-hold-release/decompiled/030ec5a8__NoteLong__shouldJudgeDirectionalFlick.c` | 1868 | `2D152B33E15E7CA4C95995975269F81FA20A3743880C06211FD645579260D522` | Long方向分支 |
| S20 | `artifacts/investigations/touch-hold-release/decompiled/030ec6bc__NoteLong__judgeDirectionalFlickSucceeded.c` | 539 | `2E450C35CDB1DC58B8793BAE3BF8629D38925349F07CDEFFB50CB02B7E7F62E1` | Long方向阈值 |
| S21 | `artifacts/investigations/touch-hold-release/decompiled/030ec710__NoteLong__ExecTouchEnded.c` | 902 | `2C109EA5F5F6E5AF63E1DEC00FAD0DC685AEC5FE7DB12A54F1136F8AB0618D46` | Long物理/合成release入口 |
| S22 | `artifacts/investigations/touch-hold-release/decompiled/030ec78c__NoteLong__judgeAfterNote.c` | 11416 | `C2EB136E1F85A7695C18E765A42A01FB2F22DF622CD0F69AF5EEEF82C854808C` | None→Miss、move flag、type 2/5/6/7 |
| S23 | `artifacts/investigations/touch-hold-release/decompiled/0321d520__NoteSlide__ExecTouchMoved.c` | 33771 | `306325AAE25FDF89CB17510B04CB6E4DD3E2277C42B9E8E0941538F8CE8035E1` | Slide中间/终端move完整分支 |
| S24 | `artifacts/investigations/touch-hold-release/decompiled/0321e76c__NoteSlide__isIntermediateNote.c` | 883 | `227DC33C3A1151C718E657FCC7789C4AF0044018F21D70B23DB97EBC48536A9B` | intermediate身份条件 |
| S25 | `artifacts/investigations/touch-hold-release/decompiled/0321e828__SlideNoteManager__Judge.c` | 3186 | `57C037B21476D1C59083704170B3433416307C852225EE50EF3D26A8793FE299` | paired vertical bands与cursor |
| S26 | `artifacts/investigations/touch-hold-release/decompiled/0321e9e8__NoteSlide__intermediateNoteJudge.c` | 4618 | `C8DBE89B236B55033228781C77BE0C99E7E480C705C981057142ADE575025107` | intermediate OneFrame type 8 |
| S27 | `artifacts/investigations/touch-hold-release/decompiled/0321f144__NoteSlide__shouldJudgeDirectionalFlick.c` | 1873 | `35C5C347CCBD32D93E73FEFF07B08D7E102E6348D9EDA9D1577FE71878DCE9EC` | Slide方向分支 |
| S28 | `artifacts/investigations/touch-hold-release/decompiled/0321f258__NoteSlide__judgeDirectionalFlickSucceeded.c` | 564 | `C8115C94B830B8BA4D2688D21AE11204446C63BA75D053ACD85795A1EDD130A5` | Slide方向阈值 |
| S29 | `artifacts/investigations/touch-hold-release/decompiled/0321f2b0__NoteSlide__ExecTouchEnded.c` | 10573 | `8526DE2089EACDAB3B49AC3555D27776D14CC04BF5349C45ECFE341E0E981148` | Slide release、skip、finger clear |
| S30 | `artifacts/investigations/touch-hold-release/decompiled/0321f874__NoteSlide__afterNoteJudge.c` | 4452 | `AAEA65B2760C56C32A560AA9669282B69798EDCC59954D3DA3D783040AE67585` | Slide end type 5/6/7/8 |
| S31 | `artifacts/investigations/touch-hold-release/decompiled/0321fb44__NoteSlide__onMiss.c` | 2500 | `30EB84A6B1A77426B8FAEC5B3714CF70C0C4855EE91025827EF0B070DD9DECDE` | Slide miss、非终端damage/5、推进 |

### 5.4 10.1.3 Flick与自然timeout迁移候选

| ID | Reverse HEAD路径 | 字节 | SHA-256 | 用途 |
| --- | --- | ---: | --- | --- |
| S32 | `artifacts/investigations/timeout-flick-paths/README.md` | 7898 | `0305AD889AE001148302C68E620B2168FED6E32236FD52067964BBFEA7E0C575` | 调查结论与剩余工作 |
| S33 | `artifacts/investigations/timeout-flick-paths/targets.tsv` | 3616 | `DC94290C88B0C4476BC1E12E2886C310F1F96384A22F9EF07E5D23BA1FC9284C` | 29个声明边界 |
| S34 | `artifacts/investigations/timeout-flick-paths/decompiled/030eacdc__NoteFlick__ExecTouchMoved.arm64.tsv` | 1413 | `14087966046D3EF66438E7A89AE61B51021E6B8B4C0AFFC7DE7FEFB4736FBFF6` | Flick严格`>0.04`与type 3 |
| S35 | `artifacts/investigations/timeout-flick-paths/decompiled/030e9ec8__NoteDirectionalFlick__ExecTouchMoved.arm64.tsv` | 2560 | `AC431197943958E10A84989E8286C89D596AC4B3B91774BE4C3E6954F8C63795` | Directional严格`>0.01`与type 9 |
| S36 | `artifacts/investigations/timeout-flick-paths/decompiled/030e9f9c__NoteDirectionalFlick__shouldJudgeDirectionalFlick.c` | 1279 | `1D408355213EDD3CD3D359C3023FC8AF578AD27BCB7EE3D0ADDA035CF8FC7245` | source 10/11 X方向 |
| S37 | `artifacts/investigations/timeout-flick-paths/decompiled/030ea05c__NoteDirectionalFlick__judgeDirectionalFlickSucceeded.c` | 336 | `BD77A3972C87EC6C0B287B0E18101C2B9CF1642555F14ECB2D01BFD7E4C6ED1C` | horizontal rate `>0.01` |
| S38 | `artifacts/investigations/timeout-flick-paths/decompiled/030ea084__NoteDirectionalFlick__onFinishJudgeFrontNote.c` | 981 | `D1F9179F6E488C5830F79AD4969DC9A55462E4CD8AC04B6320FF7AA188145556` | 完成/回收hook |
| S39 | `artifacts/investigations/timeout-flick-paths/decompiled/030eba44__NoteLong__WaitState.c` | 1299 | `9ECFF4C9E149696C861F628694F807EAC221C9E672E9A69973A50FE4D2663561` | Long start timeout比较 |
| S40 | `artifacts/investigations/timeout-flick-paths/decompiled/030ebb28__NoteLong__execOverWaitState.c` | 403 | `9BA5DD0968632E68B2702ECB4D052F78A5618638D0F9AC95D8A01284237E814E` | start Miss分拆与deactivate |
| S41 | `artifacts/investigations/timeout-flick-paths/decompiled/030ebb94__NoteLong__StopState.c` | 1779 | `33562AAF7F3199330B149094C327E4036949BCECC12B182333E7244ED6ADB5D1` | Long end timeout比较 |
| S42 | `artifacts/investigations/timeout-flick-paths/decompiled/030ebcc4__NoteLong__execOverStopState.c` | 1734 | `CAF83F25A297EDD6D58805F91CEA7C7C1AE5EB3DE1287A158EB9D22F7F8AB50A` | tail Miss、清理、deactivate |
| S43 | `artifacts/investigations/timeout-flick-paths/decompiled/030ed020__NoteLong__onMiss.c` | 387 | `0F10006052A7945F7A6AC591A8EDF80B92B68398CDE995A4E0C93F187F4EBCDC` | shared miss frame入口 |
| S44 | `artifacts/investigations/timeout-flick-paths/decompiled/0321c2d0__NoteSlide__WaitState.c` | 5409 | `26A857B271840E8CE6C1E463C63D03A9AB75651D1B35FE7FA1B21BE02FFC37D3` | **候选有边界污染，D01阻断** |
| S45 | `artifacts/investigations/timeout-flick-paths/decompiled/0321c4e4__NoteSlide__execOverWaitState.c` | 5409 | `EF06251D90DCB70E1301C2F669672A95E6041DB0CB1CABCE1BD0901747AECDF3` | **候选正文重复，D01阻断** |
| S46 | `artifacts/investigations/timeout-flick-paths/decompiled/0321c558__NoteSlide__StopState.c` | 4496 | `F3157A8F778E0F7A630FFCD301E07FBFC7C2FFD6825C62A36B17DA5790B03CF5` | pending visible节点扫描 |
| S47 | `artifacts/investigations/timeout-flick-paths/decompiled/0321fd04__NoteSlide__killFromInvisibleNotesToVisibleNote.c` | 1267 | `F5E7D551B12658D39E9FE057068ACADC01F0B50A1A9AA4B15DDBEE144566AD29` | invisible skip与target刷新 |
| S48 | `artifacts/investigations/timeout-flick-paths/decompiled/0322012c__NoteSlide__RefreshAfterMoveTime.c` | 2114 | `C39F38F136D997F3F977415809356B810A590490EE94F3B2B7721E6065757400` | seek路径，仅用于排除边界 |
| S49 | `artifacts/investigations/timeout-flick-paths/decompiled/0322028c__NoteSlide__refreshTargetButton.c` | 1271 | `037D68140F03A9C23FAF8190E2C6F95B58D2CD5D1BA7A3C7CE6E592A01DDD516` | current target button更新 |
| S50 | `artifacts/investigations/timeout-flick-paths/decompiled/03220338__NoteSlide__onMissAfterNote.c` | 1106 | `5EC0DC9C064633B492831AAD1DEC5AA0F6A3E6D3404529583BDB729ADCEB6B03` | seek miss cleanup，仅用于排除边界 |

### 5.5 10.1.3判定与Multiple迁移候选

| ID | Reverse HEAD路径 | 字节 | SHA-256 | 用途 |
| --- | --- | ---: | --- | --- |
| S51 | `artifacts/investigations/judgement-result-pipeline/README.md` | 6706 | `150A105CD75CFBB62D39F54CD57BC0D3A8A2ACDCD7BA3510350FE6C5CBC47DC7` | GetResult窗口与OneFrame摘要 |
| S52 | `artifacts/investigations/judgement-result-pipeline/targets.tsv` | 1105 | `EA9A2A62970338B042CAA55F486B0B2764907F3B6F2F499986391B517DFED2B2` | judgement边界索引 |
| S53 | `artifacts/investigations/judgement-result-pipeline/pipeline.pseudocode.cs` | 3635 | `D01198AB6BEB98DC34BC253D9707FC0DE9B0363DFC007F2A992B68EE081A1CDA` | 摘要，不覆盖直接源 |
| S54 | `artifacts/investigations/judgement-result-pipeline/decompiled/03778260__NoteUtility__CalcNoteResultType.c` | 1910 | `80EA0CC1CF3F867C6491788FE35A700B82C98EF1BA4DD3A20A8C3786B1511870` | 普通/Slide判定路由 |
| S55 | `artifacts/investigations/auto-live-runtime-contract-supplement/README.md` | 4197 | `9F5D130FD163B71254F13B426983EE8562173CA685D6A9E2A9EF826CB2AEC887` | Multiple跨阶段边界 |
| S56 | `artifacts/investigations/auto-live-runtime-contract-supplement/auto_live_supplement_contract.json` | 4839 | `3725D0EAD3A6DEC4B68E80AD85F789997E85057B3D19D7C9ADAF72A9C8A84BAC` | real touch明确后置 |
| S57 | `artifacts/investigations/auto-live-runtime-contract-supplement/decompiled/030ed578__NoteMultipleDirectionalFlick__ExecTouchBegan.arm64.tsv` | 548 | `71C3C241ADFAB59D224000CF2A1558468A53A629F5D5C5F37F75DF5FA31322CA` | Multiple Began/两侧入口 |
| S58 | `artifacts/investigations/auto-live-runtime-contract-supplement/decompiled/030ed6dc__NoteMultipleDirectionalFlick__ExecTouchMoved.arm64.tsv` | 4170 | `FB78F60AEA076703BF6E868127068D25E6CBFC08AA2C7310059A270225C9AB34` | 方向、count阈值、type10、side finish |
| S59 | `artifacts/investigations/auto-live-runtime-contract-supplement/decompiled/030ed264__NoteMultipleDirectionalFlick__changeSideNoteUsed.arm64.tsv` | 2029 | `A9F313025904805B2733C5E964BB09CBFF829960F72C78EA6FF74BA787974469` | side owner传播与link清理 |
| S60 | `artifacts/investigations/auto-live-runtime-contract-supplement/decompiled/030ed910__NoteMultipleDirectionalFlick__getCount.arm64.tsv` | 530 | `A35F9F572B4B7653D0C536C1FA1ABE51C98895A70C79A55F40B7E07D9E9DB8AE` | left+right+1 count |

### 5.6 10.1.3状态与global bundle切片迁移候选

| ID | Reverse HEAD路径/切片 | 字节 | SHA-256 | 状态 |
| --- | --- | ---: | --- | --- |
| S61 | `artifacts/investigations/touch-note-arbitration/decompiled/status.tsv` | 1085 | `06815576BB29EA95E0E09B7A47E4B9361485FE2E1CA097B621AE1651EF3D729E` | Normal为完整ARM64 fallback，边界一致 |
| S62 | `artifacts/investigations/touch-hold-release/decompiled/status.tsv` | 2364 | `16CF0A2FC5C06B3B3E15F605956188F7338641DB68A8CCE27A7E70AAA354A9BF` | 19项边界一致 |
| S63 | `artifacts/investigations/timeout-flick-paths/decompiled/status.tsv` | 3635 | `3A90CA283B7D2AEACF502B1C0D10F38DDDEB5848B9DB7CB8117B829AF95155B2` | Flick ARM64有效；Slide Wait两项边界冲突 |
| S64 | `artifacts/rhythm/decompiled_bundles/note.c#0x3a76974` | 5023 | `774181F463C91DD7D68BABEA19C82E7187670BD853C1DFF5F447A0F5599F958F` | `NoteBase.IsContainsButton`，M01须独立导出 |
| S65 | `artifacts/rhythm/decompiled_bundles/note.c#0x377f07c` | 1432 | `0F9F195D426A9208FC862584E0FA706DE235BC157B52D35FE1A41FDCD16C439B` | `NoteUtility.GetResult`，M01须独立导出 |
| S66 | `artifacts/rhythm/decompiled_bundles/note.c#0x377f1c8` | 828 | `756835F5AE10B2EA4922CC63130C18D69BEF32ABEC0E597D7BAA0DACF8DDB5E0` | `NoteUtility.JudgeNote`，M01须独立导出 |
| S67 | `artifacts/rhythm/decompiled_bundles/note.c#0x377f284` | 3176 | `44E76F08F501744C84EE0E44120E0C73DDA2404ADD07DF1649169968C344D89F` | 多button lane containment，M01须独立导出 |
| S68 | `artifacts/rhythm/decompiled_bundles/note.c#0x377f384` | 1801 | `79CB5A533DB92C91F51A5B261A0BCD72F3FECE6753383A966BF0B1DAE83B5CF6` | 单button containment，M01须独立导出 |
| S69 | `artifacts/rhythm/decompiled_bundles/note.c#0x377f4ac` | 706 | `CE0AA91D1FEF71EDD06BEF5B200F6C3729F36B9566547D754CBF83A24E172A3E` | collision squared，M01须独立导出 |
| S70 | `artifacts/rhythm/decompiled_bundles/note.c#0x377f5f4` | 345 | `FD1BF3F8FE3FDFD4B7B6D71DFF3829DFF86113E1E60E82DFDB69801ECEEB7B4D` | Slide JudgeTiming，M01须独立导出 |
| S71 | `artifacts/rhythm/decompiled_bundles/note.c#0x32246dc` | 4944 | `385838AA524974B0490944C2C471108B08E89534179D62ED64A57C56B34271CD` | Slide候选near-line比较，M01须独立导出 |
| S72 | `artifacts/rhythm/decompiled_bundles/note.c#0x321b9bc` | 87491 | `CB3E60730B2BD75639AB716F1862A430CB15F64A276E2025344F6FA23D2EAC55` | VirtualPerfectLine候选明显过大，须重建边界 |
| S73 | `artifacts/rhythm/decompiled_bundles/note.c#0x30e0e90` | 2239 | `9D9420B342C4E42955B08CEEA14BB7469AE280692E72977AA1C0478B2AA2FEA6` | screen-to-world distance rate，M01须独立导出 |

`S64–S73`的slice字节数与哈希来自10.1.3提交内`rhythm_decompiled_bundle_index.tsv`；M01必须从锁定10.1.4二进制/metadata/数据库重导出独立文件，并由新verifier核对源slice、冻结副本和Git index，不能复制旧bundle摘要或按已知RVA delta平移。

## 6. 历史静态结论与10.1.4重验要求

下表的10.1.3结论只用于说明迁移问题；对应103个方法已由R02–R05在10.1.4逐一重建，实体/tie/边界输入与生命周期由R09–R17的fixed oracle和R1锚点关闭。第三、四列保留原迁移问题与M02要求，不能替代最终R01–R17。

| 行为 | 当前静态结论 | 候选证据 | M02要求 |
| --- | --- | --- | --- |
| 输入phase | phase 0→Began，1/2→Moved，3→Ended；Began解析button，后续复用finger button | S04–S06 | 多touch顺序、Stationary、无button、Canceled与finger范围 |
| 候选过滤 | active list先`IsContainsButton`；普通按abs(notePos-musicPos)，Slide走current node/near-line；最终None拒绝 | S07、S64、S71 | 相等tie、普通/Slide交叉、wide/simultaneous实体轨迹 |
| finger所有权 | note `+0xC0 < 0`才可绑定；写finger、finger→note后虚调用；已有owner不重绑 | S08、S15–S17 | 多指争同note、同指跨lane、结束/失败清理 |
| timing窗口 | rounded 60FPS frame；`<sweet+3/6/7/8`为Perfect/Great/Good/Bad；否则None | S51–S54、S65–S66 | 每个边界前一bits/equal/后一bits、BPM/offset、Fast/Slow |
| Normal | 非None设置flag，type0提交并finish | S09 | 五结果、重复Began、同帧其他note顺序 |
| Flick | world-distance rate严格`>0.04`，type3提交 | S34、S73 | 等于/前后Float32、坐标转换、反向/斜向 |
| Directional | source10要求beginX>currentX，11相反；horizontal rate严格`>0.01`，type9 | S35–S38、S73 | 等于阈值、垂直噪声、错误方向、owner清理 |
| Multiple | 复用Directional方向；distance须严格大于`(count-1)*0.01+0.01`；type10；change side/finish | S55–S60、S73 | 真实多指、left/right owner、边界count与group顺序 |
| Long Began | None忽略、Miss走独立miss、touchState2拒绝重复；成功type4并进入hold | S10 | result/owner/state完整轨迹 |
| Long move/release | type1 `>0.04`；2/3方向且`>0.01`；4/5方向且count阈值；inside重置8、outside减delta、要求grace>0；可合成Ended | S18–S22、S67–S69、S73 | 逐阈值bits、grace exact、物理/合成双路径、finger清理 |
| Slide Began/move | front type8；intermediate直接type6/7/8；Slide Judge按paired band给result/cursor | S11、S23–S28、S70 | band边界、cursor、Great correction模式、current node顺序 |
| Slide release | end映射5/6/7/8；无有效end走onMiss；清finger、推进/回收 | S29–S31 | release时skip、invisible、None/Miss/有效结果、原子性 |
| Long timeout | Wait/Stop以adjusted位置→seconds与全局tolerance严格`>`；start Miss分两次，tail Miss一次 | S39–S43、S65–S66 | tolerance实体值、equal/前后bits、同帧槽序 |
| Slide timeout | front deadline或首pending visible触发wait miss；Stop扫描pending visible；invisible跳过后刷新target | S44–S50 | D01先修边界；exact条件、连续invisible、同帧多miss |
| OneFrame | 复用已闭合五槽、owner handle、池序和单outer-frame Reflect | Auto Live G19及S22/S26/S30/S31/S43 | manual raw/timing/type payload、多个producer及第六槽真实序列 |

## 7. M01/M02开放缺口与硬门

| ID | 状态 | 必须关闭的证据问题 | 关闭产物 |
| --- | --- | --- | --- |
| V01 | `closed` | R02/R03按managed身份重新解析118/118目标；签名与边界大小一致，逐word差异分类通过；未使用统一RVA delta | Reverse提交`4bda0f3a`的R01–R05 |
| D01 | `closed` | 10.1.4直接ARM64将Slide Wait与over-Wait恢复为相邻但不重叠的532/116字节独立函数；旧merged cfunc排除 | R06/R07及R05边界/hash断言 |
| D02 | `closed` | 14 type字段与13 enum数字身份逐版本一致；finger/button字段、InputManager数组长度15及note/result类型由当前metadata/ARM64固定 | R02、R03、R05 |
| D03 | `closed` | bottom-left Float32输入坐标、owner-issued resolver及screen-to-world rate链已固定 | R09 MJ01/MJ03/MJ26、R13/R14 |
| D04 | `closed` | ordinary/Slide/wide/tie保持owner active scan且仅strict-better替换 | R09 MJ04–MJ06 |
| D05 | `closed` | 1/60与窗口、Fast/Slow、Miss interval均以Float32 exact bits固定 | R02/R05、R09 MJ08–MJ10 |
| D06 | `closed` | finger0/1全phase、0..14 owner域、无owner/越界/Canceled失败边界及枚举序已固定 | R09 MJ02/MJ07/MJ11/MJ12、R13/R17 |
| D07 | `closed` | Flick `>0.04`与Directional `>0.01`的equal/邻接bits、方向和斜向rate已固定 | R02/R05、R09 MJ13/MJ14 |
| D08 | `closed` | Multiple count/side/group owner、strict threshold、两指producer及单次消费已固定 | R09 MJ15、R17 |
| D09 | `closed` | Long head/hold/move、8.0 grace、physical/synthetic ended及finger清理已固定 | R09 MJ16–MJ19、R14 |
| D10 | `closed` | Slide十组paired band、cursor/result owner、boundary与Great correction上下文已固定 | R02/R05、R09 MJ20/MJ21、R16 |
| D11 | `closed` | Long双timeout、Slide root/after timeout、equal条件、invisible推进和同帧顺序已固定 | R09 MJ22/MJ23、R15/R16 |
| D12 | `closed` | release None→Miss、moveSucceeded、skip及finger/button清理顺序已固定 | R09 MJ19/MJ24、R14 |
| D13 | `closed` | 五槽owner、Long双slot单Reflect及第六槽terminal fault前置边界已固定 | R09 MJ25、R15 |
| D14 | `closed` | outer-frame once-only、adaptive、pause/resume、fault/dispose及Auto touch拒绝顺序已固定 | R09 MJ01/MJ25/MJ26 |
| D15 | `closed` | malformed/foreign/repeated/non-finite/out-of-range/later-invalid均whole-frame preflight零mutation | R09 MJ26 |

M01/M02完成标准已满足：V01及D01–D15均为`closed`，Reverse 10.1.4 contract为`manual_input_gate = closed`、`blocking_findings = []`。M03现可按R09 portable contract开始；M04–M11仍须遵循生产/测试/独立验收分批纪律。

## 8. 固定事件oracle要求

### 8.1 Oracle输入

每个fixture必须冻结：

- 原作版本必须为10.1.4/230、ABI、锁定binary SHA、Reverse提交、采集方式和脚本哈希。
- chart/BMS SHA-256、production构造root identity和初始BPM/offset。
- 每个outer frame的delta Float32 bits、touch原始枚举序、fingerId、phase、原始坐标bits、resolver button identity。
- 采集前manager/note/finger/OneFrame状态；不得从TypeScript实现反向生成输入。
- 设备轨迹无法直接观测的字段必须标记`unknown`，不能由Python填默认值。

### 8.2 Oracle输出

每个fixture必须冻结：

- 每个touch的button owner、candidate root/current child、finger→button/note写入与清理顺序。
- raw result、adjusted result、JudgeTiming、note type、absolute position、button list、Multiple count。
- NoteState、touch state、move origin、grace、moveSucceeded、current Slide cursor、child judged/visible/deactive状态。
- OneFrame槽获取/Setup/Reflect/clear顺序及terminal fault。
- scheduler outer frame/substep、adjusted-position查询、backend允许/禁止副作用。
- 完整对象快照，不只记录最终事件数。

### 8.3 固定case矩阵

| Case | 场景 | 关键边界 | 证据/缺口 |
| --- | --- | --- | --- |
| MJ01 | manual显式空输入帧 | input一次、无mutation、正常Note update | S04–S06、D14 |
| MJ02 | Normal timing全窗口 | 每个`<sweet+3/6/7/8`前/equal/后bits，Fast/Slow | S09、S51–S66、D05 |
| MJ03 | ordinary候选tie | active反序、同距、同lane | S07、D04 |
| MJ04 | ordinary/Slide与Slide/Slide tie | near-line、current child、最终None | S07、S25、S71、D04/D10 |
| MJ05 | wide note与相邻lane | `IsContainsButton`、resolver能力 | S64、S67–S69、D03/D04 |
| MJ06 | multi-touch ownership | 同指跨lane、两指争note、两note同帧 | S05/S08、D06 |
| MJ07 | Moved/Stationary/Ended无owner | 不得伪造Began或清他人owner | S05/S06/S15/S16、D06/D15 |
| MJ08 | Flick threshold | 0.04前/equal/后，斜向与反向 | S34/S73、D07 |
| MJ09 | Directional threshold | source10/11、错误方向、0.01前/equal/后 | S35–S38/S73、D07 |
| MJ10 | Multiple Directional | count 1/2/N、左右side、重复touch、group finish | S57–S60、D08 |
| MJ11 | Long Began | None/Miss/Bad/Good/Great/Perfect、重复Began | S10、D05/D09 |
| MJ12 | Long普通move | 0.04边界、result None更新origin、synthetic ended | S18/S21/S22、D09 |
| MJ13 | Long方向/Multiple move | 0.01与count公式前/equal/后 | S18–S22/S73、D09 |
| MJ14 | Long lane grace | inside=8、outside减delta、0/equal/正值、re-enter | S18/S67–S69、D09 |
| MJ15 | Long物理release | None→Miss、move flag、type2/5/6/7、finger clear | S16/S17/S21/S22、D12 |
| MJ16 | Long start timeout | equal/后一bits、双Miss槽序、deactivate | S39/S40/S43、D05/D11/D13 |
| MJ17 | Long end timeout | equal/后一bits、tail Miss、清理 | S41–S43、D11/D13 |
| MJ18 | Slide Began分支 | front judge type8与direct node 6/7/8 | S11、D10 |
| MJ19 | Slide band/cursor | 每个band边界、None、Fast/None timing | S25/S70/S72、D10 |
| MJ20 | Slide intermediate | Perfect/Great correction/拒绝、单节点推进 | S23/S24/S26、D10 |
| MJ21 | Slide end move | type8/9/10/11/12阈值、perfect line、grace | S23/S27/S28/S72/S73、D09/D10 |
| MJ22 | Slide physical release | consumed skip、end/no-end、type5/6/7/8、finger clear | S29–S31、D12 |
| MJ23 | Slide timeout/invisible | front/next visible条件、连续invisible、target刷新 | S44–S49、D01/D11 |
| MJ24 | 同outer frame五槽/第六槽 | input producer+timeout producer池序、fault、无重试 | Auto G19、D13/D14 |
| MJ25 | pause/adaptive/lifecycle | input仅一次、pause不消费、fault/dispose优先 | S04–S06、D14 |
| MJ26 | malformed/foreign/late failure | 非有限坐标、foreign button、后项坏touch全域原子性 | portable边界、D15 |

## 9. 详细实施步骤

### M00 建立阶段任务书

1. 锁定阶段范围、上游提交、Reverse提交与样本。
2. 盘点已提交静态候选并计算Git blob字节/哈希。
3. 区分直接方法、摘要、global bundle候选和实体缺口。
4. 建立M01/M02硬门、MJ矩阵、提交与验收纪律。

**验收**：只新增/更新文档；模拟器生产与测试零修改。

### M01 晋升并修正静态证据

1. 在Reverse建立10.1.4专用`manual-input-runtime-contract`调查目录，记录version 230、`815DF625...F058D8F` binary和对应metadata哈希。
2. 关闭V01：按managed owner/method从10.1.4 metadata重新解析S01–S73涉及的全部方法，不使用统一RVA delta假设；逐方法比较签名、边界、函数体差异和字段布局。
3. 修复D01：以10.1.4锁定IDA数据库/ARM64独立重建Slide `WaitState`与`execOverWaitState`；禁止复制10.1.3污染切片，status实际边界必须与请求一致。
4. 将S64–S73对应目标从10.1.4 global source重导出为独立C/ARM64，尤其`IsContainsButton`、GetResult/JudgeNote、containment、Slide timing/near-line/perfect-line和distance rate。
5. 补齐D02所需10.1.4 type layout、enum numeric identity、finger/button字段与数组容量。
6. 生成版本专用contract JSON：每个比较、字段、调用顺序、owner和开放项均有10.1.4直接source引用；10.1.3只列corroboration，不进入confirmed来源。
7. 提交Reverse并确认`origin/main...HEAD = 0 0`。
8. 在GarupaEditor创建`tmp/simulator-reverse-evidence/manual-input-judgement/`：manifest、OPEN_GAPS、README、verify.mjs、artifacts和fixtures。
9. 三方校验10.1.4 Reverse源/GarupaEditor冻结副本/Git index；完整大写SHA-256和字节数进入manifest。

**停止条件**：任何边界/摘要/哈希冲突保持`manual_input_gate = blocked`。

### M02 建立实体设备与固定事件oracle

1. 为D03–D15逐项编写只读采集或独立harness方案；不得使用Reverse未跟踪`runtime/tools/`作为最终证据。
2. 所有实体采集先验证设备包为10.1.4/230并记录binary/address table；版本不符立即拒绝。
3. 锁定原始touch顺序、Float32坐标/delta bits、BPM/offset和production chart identity。
4. 执行MJ01–MJ26；每个边界至少包含前一可表示值、equal、后一可表示值及错误owner/lifecycle组合。
5. 对多指、wide、tie、Long/Slide和Multiple使用实体对象身份，不用Python模拟owner结论。
6. Python只规范化已采集字段并生成固定JSON；所有`inference`字段保持阻断。
7. verifier从提交内10.1.4原始trace重新生成摘要，逐字段比较并报告`manual_input_gate`；不得加载10.1.3 trace补空缺。
8. Reverse提交后冻结fixtures到GarupaEditor；更新本任务书V/D项与锁定提交。

**硬门已关闭**：V01、D01–D15全为`closed`，MJ01–MJ26均由10.1.4 fixed oracle覆盖且`unknown_fields=[]`，Reverse `blocking_findings=[]`；M03允许实施。

### M03 锁定输入数据与宿主边界

1. 在`engine/data/`定义不可变touch phase、Float32 position、input frame和owner snapshot；不引用DOM/React/Pixi/Tauri类型。
2. 在`host/contracts.ts`扩展一次outer-frame输入边界；精确接口以M02 contract为准。
3. 为每个engine创建私有button capability owner；跨engine、伪造、重复消费和plain object拒绝。
4. 完整preflight一个input frame后才允许任何manager/clock/finger/backend mutation。
5. public faulted/disposed优先级覆盖全部input shape与每种`step`输入。
6. snapshot输出只读输入trace和ownership投影，不暴露内部能力。

**测试**：MJ01/MJ07/MJ25/MJ26；caller alias mutation、foreign capability、later-invalid全域零mutation。

### M04 恢复InputManager、GamePlayButton与候选仲裁

1. 替换`inputBoundaries.ts`空实现，恢复states 5/17、touch枚举和phase虚分发。
2. Began通过resolver取得button capability并写finger→button；Moved/Stationary/Ended只复用owner关联。
3. `GamePlayButton.ExecTouchBegan`先Auto短路，再执行证据允许的非表现层逻辑。
4. NoteManager按active list顺序、`IsContainsButton`、ordinary/Slide bucket和near-line规则选择一个候选。
5. Calc结果为None、note已有finger owner或无候选时按oracle清理；不播放空tap音效，只保留缺席的backend事件边界。
6. Long/Slide成功Began按证据设置button touch state；finger/note写入顺序与oracle一致。

**测试**：MJ03–MJ07；所有tie、wide、多指和owner冲突逐组合。

### M05 恢复窗口与Single/Flick手动判定

1. 实现GetResult/JudgeNote的Float32/rounding链和exclusive upper bounds。
2. timing：Perfect/Miss清None；其他结果按`notePos-currentPos <= 0`映射Slow，否则Fast，以M02最终contract为准。
3. Normal Began只接受owner计算的非None结果，type0提交并完成。
4. Flick Moved保持严格`>0.04`，type3；Directional先方向再严格`>0.01`，type9。
5. movement使用S73闭合的screen-to-world rate，不用像素距离或epsilon。
6. 手动judgement request进入通用closed payload；Auto request继续保持原owner验证，不共享可伪造字段。

**测试**：MJ02/MJ08/MJ09；每个Float32边界与raw/timing/finish顺序全对象比较。

### M06 恢复Multiple Directional手动判定

1. 沿用G21 runtime group owner，不修改冻结chart。
2. Began/Move只由真实finger owner驱动，不复用Auto的±500 synthetic输入。
3. 方向复用Directional规则，count由runtime group owner计算。
4. 严格比较`distance > (count - 1) * 0.01 + 0.01`，保持Float32运算次序。
5. type10提交后执行changeSideNoteUsed、link清理、finish/deactivate；顺序按S58/S59与实体oracle。
6. side已消费、跨group、错误count、第二finger和重复Moved失败关闭且不partial mutation。

**测试**：MJ10及全部ordinary/HABAHIRO production group。

### M07 恢复Long手动状态机

1. Began区分None、Miss、重复touchState2和成功type4。
2. owner保存touch origin、finger、touch state、move success和grace。
3. move按type1、2/3、4/5选择阈值/方向/count；result None时更新cached origin的时点按S18。
4. containment owner重置8.0或按当前production delta递减；不clamp。
5. 成功move按证据设置success，可先完成Multiple after virtual，再合成GamePlayButton.Ended。
6. physical/synthetic Ended共同进入judgeAfter；None→Miss、success false→Miss、type2/5/6/7、OneFrame、finish/deactivate和finger清理按oracle。
7. 音效/lane effect仅记录为未恢复端口，不调用audio/renderer backend伪实现。

**测试**：MJ11–MJ15；每种Long production after type与失败点全对象比较。

### M08 恢复Slide手动状态机

1. Began锁定current node与touch owner；区分front judge和direct node 6/7/8。
2. `SlideNoteManager.Judge`消费M02固定band数据和cursor，不由测试传result。
3. intermediate只接受已证实result/correction上下文，type8提交后mark/hide/advance一次。
4. end move按type8、9/10、11/12选择阈值，要求有效Slide result、perfect-line条件与grace>0。
5. Ended跳过已消费节点；end走final Judge/timing/after type5/6/7/8，非end走onMiss。
6. invisible节点、current cursor、target button、finger clear和deactivate顺序由父Slide owner维护。
7. `RefreshAfterMoveTime`不混入普通release/timeout。

**测试**：MJ18–MJ22；全部144 production Slide及普通/HABAHIRO child图覆盖。

### M09 恢复自然timeout Miss

1. Long Wait/Stop只读取production adjusted position、BPM与M02锁定tolerance。
2. start timeout按确认比较触发两个Miss projection并deactivate；end timeout触发tail Miss、清理并deactivate。
3. Slide Wait同时检查front deadline与首pending visible节点；D01关闭后的独立函数决定miss入口。
4. Slide Stop扫描首pending visible；ordinary路径不得进入Auto forcePerfect Stop。
5. 连续invisible节点按S47跳过并刷新target；seek专用S48/S50不进入自然timeout。
6. 同outer frame多个timeout按active反序、parent child和五槽owner顺序提交。

**测试**：MJ16/MJ17/MJ23/MJ24；equal/前后bits和第六槽terminal fault。

### M10 接入调度、OneFrame与失败原子边界

1. `InGameManager`保持input一次→NoteManager adaptive update→单次Reflect。
2. pause时输入帧是否拒绝/冻结/保留完全按MJ25，不建立自定义队列。
3. 一个input frame全量preflight后再执行；执行中的原作已确认mutation按实体oracle，portable malformed failure零domain mutation。
4. OneFrame仍固定五槽、owner object handle、exact source/count和pool order；manual request闭合result/timing/type/position/button/finger provenance。
5. G19 sixth-slot terminal fault继续只允许snapshot/dispose；dispose保留fault latch。
6. backend只记录M02确认的可移植边界；音频/渲染行为保持缺席。

**测试**：MJ24–MJ26；`input × owner × note family × lifecycle × failure point × mutation`完整矩阵。

### M11 production oracle与独立验收

1. 新增manual-input隔离测试入口，完整消费MJ01–MJ26固定JSON，不调用Python。
2. 普通/HABAHIRO production chart覆盖Normal/Flick/Directional/Multiple/Long/Slide及wide/同位置关系。
3. 独立生成expected不得导入候选/判定待测函数；production输入由冻结fixture驱动公共host。
4. 重新运行第一切片、chart、clock、Auto Live全部上游隔离回归。
5. 执行TypeScript、依赖边界、证据source/copy/index verifier、Reverse verifier和静态反审。
6. 创建`tmp/simulator-manual-input-judgement-acceptance.md`，逐项映射M00–M11和第12节。
7. 生产修复提交推送后另起全新编译/独立探针；无开放required-before-close才更新README关闭阶段。

## 10. 测试与验证计划

计划新增命令，实际脚本名在对应测试批锁定：

```powershell
npx.cmd tsc -p src/simulator/tsconfig.json
npm.cmd run simulator:test:manual-input-boundary
npm.cmd run simulator:test:manual-input-arbitration
npm.cmd run simulator:test:manual-input-single
npm.cmd run simulator:test:manual-input-long
npm.cmd run simulator:test:manual-input-slide
npm.cmd run simulator:test:manual-input-timeout
npm.cmd run simulator:test:manual-input-production
node tmp/simulator-reverse-evidence/manual-input-judgement/verify.mjs
```

阶段验收还必须运行现有第一切片、全部chart suites、clock scheduling与Auto Live AL01–AL22。M11前不运行Vite/Tauri或GarupaEditor整体构建。

## 11. 批次与提交纪律

建议批次：

1. M00任务书。
2. Reverse静态证据修正与提交。
3. GarupaEditor冻结静态证据包。
4. Reverse实体oracle与缺口关闭。
5. GarupaEditor冻结oracle。
6. M03输入contract。
7. M04分发/仲裁。
8. M05 Single/Flick。
9. M06 Multiple。
10. M07 Long。
11. M08 Slide。
12. M09 timeout。
13. M10调度/原子边界。
14. M11测试与production oracle。
15. 独立最终验收文档。

每批要求：

- 先更新本任务书进度、证据ID、验证命令与结果。
- `git diff --check`；只暂存本批目标文件。
- 涉及证据时运行source/copy/index三方verifier。
- `git diff --cached --check`并检查staged name-status/stat。
- 中文语义提交：`docs(simulator): 建立手动输入阶段任务书`、`evidence(simulator): 冻结手动输入证据`、`feat(simulator): 恢复手动输入...`等。
- 每批推送`origin codex/refactor-simulator-implementation`并确认远端差异`0 0`。
- 不切分支，不触碰用户现有非模拟器修改。

## 12. 阶段完成定义

只有以下条件全部满足，手动输入与判定阶段才能关闭：

- [x] V01关闭：Reverse 10.1.4静态contract已提交，118方法/14 type/13 enum及关键常量完成版本重基线。
- [x] D01边界冲突以10.1.4独立ARM64范围修正，S64–S73对应目标完成10.1.4独立晋升。
- [x] V01与D01–D15全部关闭，`manual_input_gate=closed`且`blocking_findings=[]`。
- [x] MJ01–MJ26全部来自10.1.4/230，并有已提交raw、fixed oracle、verifier和三方哈希。
- [x] M03宿主输入frame、坐标空间、button capability和生命周期无隐式默认值。
- [ ] touch phase、finger→button、finger→note及清理顺序匹配。
- [ ] ordinary/Slide候选、wide、tie与simultaneous顺序匹配。
- [ ] GetResult/JudgeNote各Float32边界、Fast/Slow和sweetFrame 0/1匹配。
- [ ] Normal/Flick/Directional/Multiple手动路径及严格阈值匹配。
- [ ] Long Began/Hold/Moved/Ended、grace、synthetic release和尾判匹配。
- [ ] Slide head/intermediate/end、band cursor、release/miss/invisible推进匹配。
- [ ] Long/Slide自然timeout exact边界、同帧顺序和parent-owned child生命周期匹配。
- [ ] OneFrame五槽、closed payload、handle/source/count owner、第六槽terminal fault匹配。
- [ ] pause/adaptive/fault/dispose与每个public input组合闭合。
- [ ] malformed/foreign/later-invalid输入在允许mutation前失败关闭，whole-domain原子性通过。
- [ ] Score/Life/Skill/Fever/audio/rendering字段保持缺席，不填零或no-op冒充。
- [ ] 普通/HABAHIRO production手动轨迹与独立oracle匹配。
- [ ] 第一切片、chart、clock、Auto Live全部隔离回归通过。
- [ ] engine依赖边界、证据source/copy/index和Reverse verifier通过。
- [ ] 未修改App、编辑器控制器、窗口协议、Tauri、渲染或音频实现。
- [ ] 生产修复与提交后独立验收分批提交并推送，远端差异`0 0`。

## 13. 当前审计结论

1. 当前生产`InputManager.execInput`是无条件`ok`，`GamePlayButton.execTouchBegan`返回`evidence-required`；这只是第一切片边界，不能复用为手动实现。
2. current host只有`step(deltaTimeSeconds)`，没有输入payload；M03必须在D03/D14后设计一次outer-frame边界。
3. S01–S73覆盖触摸入口、候选、窗口、Flick、Long/Slide move/release、timeout和Multiple，但全部属于10.1.3历史样本；P01–P05明确禁止把它们自动视为10.1.4有效。
4. 时钟阶段已在10.1.4完成重新取证并保持关闭；P01–P05证明其版本迁移与重取证身份，但该范围不含手动InputManager/GamePlayButton/NoteUtility及完整Long/Slide/Multiple方法，因此V01只阻断当前手动阶段，不回溯或重开时钟阶段。
5. 10.1.3 S44/S45与S63还存在直接证据冲突；10.1.4必须从原始二进制重新恢复，不能先迁移错误切片。
6. GetResult/JudgeNote、containment、near-line、VirtualPerfectLine和distance rate的现有global bundle切片也是10.1.3；M01须在10.1.4晋升独立边界，旧S72的87491字节候选不可消费。
7. Reverse提交`4bda0f3a`已关闭V01/D01–D15：5条R1覆盖真实touch、Long/Slide timeout与两指phase，MJ01–MJ26固定其余exact/portable边界；clock目录中的`manual`命名轨迹未被用于补手动证据。
8. Auto Live synthetic Flick/Multiple仍只证明既有合成链；手动实现必须消费R09固定的raw producer、owner capability与阈值，不得把synthetic请求当touch。
9. 下一批从M03输入contract开始，生产实现、定向测试和独立验收继续分批；当前证据提交未修改GarupaEditor生产代码。
