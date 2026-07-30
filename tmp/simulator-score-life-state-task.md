# 模拟器分数、生命与状态阶段任务书

## 1. 阶段身份与当前状态

- 阶段：模拟器彻底重构实施块5——分数、生命与状态。
- 上游：第一切片、谱面构造、时钟与调度、Auto Live、手动输入与判定均已关闭。
- 上游最终状态提交：GarupaEditor `48156d4d88bc8d49bc050c6f056b42223ddab406`。
- 锁定原作样本：`jp.co.craftegg.band` 10.1.4（version code 230，`arm64-v8a`）。
- 锁定`libil2cpp.so` SHA-256：`815DF62582B35F3EF2223AB033FAC6DC909DE492D548DD28950BF1F98F058D8F`。
- 锁定`global-metadata.dat` SHA-256：`298D92CB0DC44B11681C5478F3BB08CE5476321361CE962096095CC31812961F`。
- 当前Reverse证据提交：`72aa279fb07041b04ca649df918fa35ab0490d91`；只消费该提交及其祖先中已推送、可校验对象，不消费当前Reverse工作树。
- 当前状态：**B00/B01已完成，B02进行中。V01与D01-static已关闭；D18/D22各有一条无输入R1部分结论，但D18/D22剩余范围、D19–D21、D23剩余、D24及BS01–BS36仍是`required-before-code`硬门；B02关闭前禁止实施B03–B12任何生产代码。**
- 当前10.1.4已提交依赖证据只直接覆盖`OneFrameData.Setup`、`InGameOneFrameJudgementController.ReflectOneFrameData`、`NoteBase.getAddCombo`以及若干判定生产者入口；它不足以宣称完整Score/Life/Skill/Fever链已在10.1.4确认。
- 10.1.3的`base-score-construction`、`event-score-multipliers`、`skill-*`、`fever-*`及Life Heal实机调查仅作为历史迁移候选H01–H24，不能被B03–B12生产实现直接消费。
- 当前证据包：`tmp/simulator-reverse-evidence/score-life-state/`；已冻结B01、R0输入与无输入R1子批，只消费已提交Reverse对象。
- 计划验收记录：`tmp/simulator-score-life-state-acceptance.md`；B12时创建。

### 1.1 阶段目标

本阶段只恢复已由10.1.4证据闭合的原作托管层业务状态链：

1. 从chart、谱面等级、队伍参数及显式master/profile输入构造普通与Free Live活动加成基础分。
2. 在每次判定发生时构造完整业务`OneFrameData`：raw/adjusted result、Combo、Power/伤害、普通分、活动加成分、Skill/Fever/Crescendo倍率与guard类型。
3. 按五槽顺序统一`ReflectOneFrameData`，恢复逐项截断、Combo变更、Score/Life/record mutation与`OneFrameTotalData`代表项选择。
4. 恢复当前Combo、最大Combo、结果计数、Fast/Slow计数、单Note最高分记录及已确认All Perfect状态。
5. 恢复伤害、Damage Guard、Never Die、Life Heal、生命上下界和Game Over触发的已确认链路。
6. 恢复Skill Note成功/失败消费、playlist、Begin/Playing/Finishing、once effect、active effect、continuous result和Crescendo状态。
7. 恢复Fever Note积分、pass condition、Ready/Start/End命令、Fever状态和分数倍率。
8. 恢复Auto Live、Team Live Festival、Medley、Garupa Cup及Free Live event bonus中已确认的分数路由；缺失的master rows由调用者显式提供并校验。
9. 为初始化、单Note、同帧多Note、Skill切换、Fever切换、伤害/治疗、暂停、fault和dispose建立可重复固定事件oracle。

“完成分数、生命与状态”不表示已恢复HUD、动画、音频、粒子、网络同步、CRIWARE、Unity PlayerLoop精确相位、DOM/Tauri输入、Pixi渲染或主程序接入。

### 1.2 锁定决策

1. GirlsBandParty-Reverse仍是唯一行为依据；Reverse中的Python prototype只能帮助定位和生成离线oracle，不能以其实现或测试结果代替ARM64、metadata或实体观察。
2. 本阶段只接受10.1.4/230证据。10.1.3/229的RVA、字段、常量、master示例和runtime行为只能列为迁移候选，不得通过统一RVA delta、同名方法或“测试已通过”晋升。
3. B01必须按managed `Owner$$Method`逐一重解析10.1.4目标，独立导出边界；禁止把15MB/62MB global bundle切片或自动反编译标签直接冻结为最终证据。
4. B02必须同时关闭静态契约、实体R1观察和固定事件oracle。B02关闭前不得修改`src/simulator/**`生产实现、stage-5测试入口或package scripts。
5. 当前`OneFrameJudgementData`只包含判定投影，不是完整原作`OneFrameData`。本阶段只能在证据闭合后扩展字段，不得把缺失Score/Power/Life/Skill/Fever字段填成0、1或identity。
6. 每个`OneFrameData`必须在判定发生时冻结其自身adjusted result、Skill/Fever/Crescendo rate、ScoreUpType、DamageGuardType与Never Die事实；Reflect不得读取“后来变更”的active Skill来重算早先槽位。
7. `ReflectOneFrameData`按固定五槽/原列表顺序消费；Combo必须在选择当前项Combo rate之前按原作顺序变更，所有整数转换和浮点乘法阶段保持ARM64顺序。
8. JavaScript `number`不能默认冒充原作`float`、`int32`或`int64`。B01必须确认每个输入、累加器、中间值、转换和overflow边界；实现必须显式`Math.fround`、toward-zero conversion或已证实的整数语义。
9. Score/Life/Combo/Skill/Fever状态只能由对应engine owner修改。宿主不能提交“本Note得分”“命中后生命”“当前Combo”“Skill已生效”“Fever成功”等结果值。
10. 主数据缺失时，调用者必须提供不可变、版本标识明确的profile；profile只能包含原作本来从master/start-data读取的源值，不能提供预计算rate、最终分数或期望状态转移。
11. profile必须与engine/session绑定、深冻结、无alias；未知枚举、重叠/缺口range、非有限Float32、越界整数、重复Skill ID、非法队伍索引和不完整模式配置在初始化mutation前失败关闭。
12. 普通、Auto Live和各special mode保持显式模式。不得根据profile是否存在自动切换模式，也不得给无profile模式补`1.0`默认倍率。
13. Pause/fault/dispose优先级沿用上游：paused不推进Skill/Fever timer、不Reflect、不消费新业务输入；faulted/disposed优先于profile/delta校验和任何backend/domain mutation。
14. Skill/Fever网络相关字段只恢复已确认的本地状态或显式portable adapter边界；不得模拟Photon消息延迟、远端成员、掉线替换或server master默认值。
15. Life Heal历史观察`1000/1000 -> 1500/1000`与旧prototype中潜在clamp语义不得自行调和。必须由10.1.4对象字段、调用链和oracle重新确认current/max/upper-limit含义后才能实现。
16. Score、Life与状态是本阶段的领域输出，不经renderer/audio backend才能成立；HUD、SE、Skill动画、Fever effect只保留后续消费端口，不阻塞纯领域验收。
17. seek、ReturnTime、snapshot replay、continue、16秒无输入恢复和Game Over完整画面流程只有在D22关闭时才能纳入；否则明确排除，不能用重建初始状态替代。
18. 证据批、生产实现批、定向测试批和B12独立验收批必须分离；任何production修复批的绿色结果不能直接关闭阶段。

### 1.3 执行进度

| 任务 | 状态 | 完成标准 |
| --- | --- | --- |
| B00 建立阶段任务书 | **已完成** | 范围、证据候选、硬门、oracle、任务顺序和完成定义写入本文档 |
| B01 10.1.4静态证据晋升 | **已完成静态重基线** | 326方法、25布局、19枚举及静态语义已提交Reverse并冻结；不单独关闭业务门 |
| B02 实体与固定事件oracle | **进行中；硬门**：R0/BMS及3条R1已冻结，D14/D18/D20/D22仅部分推进 | D01–D24关闭，raw trace和BS01–BS36固定case提交并冻结，`business_state_gate=closed` |
| B03 锁定配置、领域数据与owner | 阻塞于B02 | 输入profile、InGameRecord、OneFrameData/TotalData与manager owner不可伪造 |
| B04 恢复基础分与最大Note数 | 阻塞于B02 | deck/chart/level/base score、result correction及初始化顺序匹配 |
| B05 恢复单次判定业务投影 | 阻塞于B02 | adjusted result、damage、score、rate、guard和slot冻结顺序匹配 |
| B06 恢复Reflect、Combo、Score与Record | 阻塞于B02 | 五槽顺序、逐阶段截断、代表项、计数和最高分记录匹配 |
| B07 恢复Life、Damage Guard、Never Die与Game Over | 阻塞于B02 | damage/heal/上下界/lethal/lifecycle顺序匹配 |
| B08 恢复Skill Note与playlist状态机 | 阻塞于B02 | eligibility、queue、Begin/Playing/Finishing、once effect和pause匹配 |
| B09 恢复active Skill与Crescendo | 阻塞于B02 | judge/damage/score/continuous/crescendo按entry冻结并匹配 |
| B10 恢复Fever状态机 | 阻塞于B02 | Note积分、pass、command、state、rate及reset匹配 |
| B11 恢复special mode/event与组合生命周期 | 阻塞于B02 | Auto/Festival/Medley/Garupa/Event、reset/fault/同帧切换矩阵匹配 |
| B12 production oracle与独立验收 | 阻塞于B03–B11 | 完整回归、证据index、静态反审和验收文档通过 |

### 1.4 初始批次记录

#### 2026-07-29 第一批：B00任务书与证据候选盘点

- 重读`tmp/simulator-reconstruction-plan.md`实施块5、手动输入最终验收、当前`OneFrameJudgementData`和`InGameOneFrameJudgementController`边界。
- 只通过`git show HEAD:path`、`git ls-tree HEAD`和`git grep HEAD`读取Reverse提交`ce5353fd`；Reverse大量未提交工作树修改全部排除。
- 当前10.1.4依赖包确认已有`OneFrameData.Setup @ 0x32F29CC`、`ReflectOneFrameData @ 0x3303FF0`、`NoteBase.getAddCombo @ 0x3A75F70`、`NoteFrontBase.judgeFrontNote @ 0x30E0130`等独立ARM64切片，但没有覆盖完整ScoreUtility/InGameRecord/Life/Skill/Fever方法集。
- 盘点10.1.3历史调查：`a9c8485`闭合base score、event multiplier、special combo；`5472b78`闭合Skill/Fever消费者与状态机；`c0fb10a`冻结Life Heal视觉观察。全部降级为H01–H24迁移候选。
- 识别必须失败关闭的历史冲突/缺口：Life Heal显示`1500/1000`与旧prototype潜在上限处理不一致；具体master rows缺失；Skill/Fever exact same-frame顺序、Game Over与reset/seek边界未形成10.1.4完整oracle。
- 本批只创建任务书并同步阶段状态文档，不修改生产代码、测试、package scripts、渲染、音频或主程序。
- 目标文档diff check通过；既有manual冻结证据`--index`复验仍为118 methods、14 layouts、13 enums、R1=5、MJ=26、entries=141、gate closed。

## 2. 固定范围

### 2.1 纳入范围

- `ScoreUtility.calcTotalParameter/GetScoreRateByMusicPlayLevel/InitBaseScore/calculateBaseScore/GetBaseScore/GetResultTypeCorrectionRate/GetComboCorrectionRate`。
- `NoteManager.analyzeBMS`写入`InGameRecord.maxNoteCount`以及普通、Long tail、可见Slide child、Multiple group的计数规则。
- `NoteFrontBase.judgeFrontNote`、Long/Slide tail与Slide intermediate对完整业务`OneFrameData`的构造。
- `GamePlayButton.CorrectNoteResult`、`NoteBase.getAddCombo/calcAddDamage/calcBaseCorrectedScore/calcSkillScoreUpRate`。
- `OneFrameData`、`OneFrameTotalData`和`InGameOneFrameJudgementController.ReflectOneFrameData/calcAddScore/getComboCorrectionRate`。
- `InGameRecord`的score、free-live event bonus score、current/max Combo、Life/Power、result与Fast/Slow计数、单Note最高分及已确认状态。
- 原作已确认的伤害表/源、Damage Guard、Never Die lethal correction、Life Heal与Game Over条件。
- `InGameSkillNoteController`、`SituationSkillManager`、`SkillNotesInfoUtility`的本地队列与timer状态。
- active Skill的judge、damage、score、life条件、continuous judge、Crescendo及Never Die消费者。
- `FeverTimeManager`的Note积分、pass conditions、Ready/Start/End、状态、reset和score rate。
- Auto Live combo coefficient、Team Live Festival stage effect、Medley/Garupa Cup combo profile和Free Live活动加成分的已确认路由。
- pause、resume、fault、dispose以及B02闭合的reset/Game Over边界。
- 普通与HABAHIRO production chart上的maxNoteCount、业务判定和同帧聚合oracle。

### 2.2 排除范围

- Score/AddScore/Combo/Life/Result/Skill/Fever HUD、UILabel、UISlider、Sprite、Animator、particle和最终像素。
- Tap/Flick/Hold/Skill/Fever音效、CRIWARE、Web Audio、设备输出延迟。
- Photon发送、接收、远端玩家Skill/Fever同步、断线替代和server时序。
- 当前服务器完整MasterData数据库、用户账号/队伍选择UI和活动Deck选择UI；只接受B02锁定的显式portable profile。
- React、Pixi、Tauri、DOM、窗口协议、编辑器控制器、移动端Activity及主程序入口。
- Unity PlayerLoop精确callback相位、GPU呈现、OS调度和网络延迟。
- Skill/Fever/Life表现动画及历史Life green glow像素复现；它们属于资源/渲染阶段。
- situation Skill远端payload、未确认的activate-effect `heal(2)` Note消费者。
- 未经D22关闭的seek/ReturnTime/snapshot replay/continue/16秒恢复。
- mode14/debug Force Perfect。
- GarupaEditor整体构建和应用联调。

## 3. 强制执行规则

1. V01、B01、B02及D01–D24全部关闭前，禁止实施B03–B12生产代码和本阶段测试入口。
2. 新证据必须先提交并推送Reverse，再冻结到GarupaEditor；禁止引用Reverse未提交文件、`.claude/`、`runtime/tools/`或本地IDA数据库。
3. 证据包每项必须记录Reverse commit、相对路径、字节数、完整大写SHA-256、版本、状态和消费任务；`verify.mjs`必须校验source/copy/index三方。
4. 10.1.3与10.1.4严格版本隔离。H系列不能列入最终`confirmed` manifest，也不能出现在production evidence ID中。
5. 静态摘要、Python prototype和README与ARM64/metadata/raw trace冲突时，先修Reverse结构化contract与closure，再更新本文档，最后才实现。
6. 每个字段offset、enum、table row、比较符、operation order、截断点、range选择、列表mutation、callback、timer和reset都必须能指向最终P/R/BS证据ID。
7. 所有配置必须先做完整纯preflight；后一个非法member/effect/range不能留下前一个对象、base score、manager、slot或backend mutation。
8. 测试不得写private state、调用private实现、注入expected score/result/life/current Combo/active Skill/Fever state，或从待测实现生成expected。
9. 生产与测试不得读取`tmp/simulator-reverse-evidence`、Reverse工作树、Python或网络；Python只可在Reverse生成离线oracle。
10. `Math.round`、`Math.trunc`、`Math.fround`、整数溢出和除法顺序都必须逐处按证据使用；不得建立全局“看起来等价”的numeric helper。
11. 相等range、相等最高分、同raw result、同槽位和同帧Skill/Fever切换必须保持原作first/last/strict/inclusive规则，不得统一tie policy。
12. 同帧五个entry必须各自冻结业务输入，完整预检后才提交；第六槽失败沿用已关闭的固定池边界，不得扩容或部分Reflect。
13. 未确认分支统一返回`evidence-required`；不得no-op、填0、填1、clamp、跳过非法项、排序profile或自动补齐range。
14. terminal lifecycle failure优先于配置、delta、业务状态和backend；snapshot不得泄露可写owner、master对象或capability。
15. 每个生产批与对应测试批分离；B12必须从已提交生产和测试后的全新临时编译产物独立运行。

## 4. 目标架构与所有权

```text
immutable start/master profiles (host portable boundary)
  -> InGameCalculatedData / start-data owner
      -> ScoreUtility initialization
          -> InGameRecord.maxNoteCount + base score cache

judgement owner (Manual or Auto Live)
  -> concrete Note judgement
      -> adjusted result / Skill-Fever consumers
          -> complete frozen OneFrameData (fixed five-slot owner)
              -> ReflectOneFrameData in slot order
                  -> Combo -> correction rate -> Score
                  -> Power/Life -> guard/Never Die -> Game Over
                  -> counters / one-note max / OneFrameTotalData

Skill Note -> SituationSkillManager queue -> active effect owner
Fever Note -> FeverTimeManager points -> command/state -> score-rate owner
```

### 4.1 宿主配置边界

B03最终接口只能承载B02确认的原始构造数据，例如：

- mode与Auto Live coefficient；
- score level及队伍成员原始Performance/Technique/Visual字段；
- 初始/最大Life的原作source字段；
- result/combo/damage及special mode的原始master rows；
- Skill master duration、once-effect与activate-effect原始字段；
- Fever difficulty/profile、own-team identity及命令输入；
- Free Live event bonus所需原始event/area/member值。

宿主不得提供：

- 预计算base score、result correction、combo rate、最终addScore或最终Life；
- 当前Combo、active Skill、Fever state、Crescendo stack、continuous result；
- 期望OneFrameData、期望slot、期望callback/trace或expected failure；
- `InGameRecord`/manager/note对象、私有ID或可跨engine复用handle。

所有profile必须深复制/深冻结并记录结构身份；caller后续修改array/object不得改变engine状态。若原作从server master读取但当前无可校验row，则对应模式创建或首次消费时返回`evidence-required`，不能退回standard表。

### 4.2 引擎所有权

- `ScoreUtility`：base score缓存、result correction、standard Combo correction及Game Over降分路由。
- `InGameRecord`：maxNoteCount、Score、Life/Power、Combo、计数、单Note最高分及局内业务快照。
- concrete Note/`NoteBase`：在判定时读取当前active effect并生成完整、不可变的业务projection。
- `InGameOneFrameJudgementController`：五槽、完整entry、slot-order Reflect和`OneFrameTotalData`。
- `SituationSkillManager`：Skill Note queue、current request、四态、timer、once effect和active effect生命周期。
- `SkillNotesInfoUtility`：effective timer、continuous result、Crescendo与固定Note状态表中已确认字段。
- `FeverTimeManager`：points、pass condition、command、state、score rate和next-frame reservation的领域部分。
- `InGameManager`：manager update顺序、Game Over/lifecycle门、pause/fault/dispose。
- backend：只接收后续表现请求；不得参与Score/Life/Skill/Fever结果计算。

### 4.3 OneFrame冻结与Reflect边界

- B01必须确认10.1.4完整`OneFrameData`与`OneFrameTotalData`布局；现有TypeScript字段不可被视为完整布局。
- 每个entry在Setup前完成所有纯计算，Setup一次写入；不得在Reflect时回看note或current Skill补字段。
- Reflect必须先完整验证所有in-use slot内部不变量，随后按原作mutation顺序执行；若原作会在中途产生不可回滚mutation，必须有BS raw trace明确证明后才能保留。
- 对外snapshot只提供不可变数值/enum/trace，不暴露profile、manager或原作对象identity。

## 5. 当前10.1.4已提交依赖证据

### 5.1 样本身份

| ID | Reverse `ce5353fd`路径 | 字节 | SHA-256 | 本阶段用途 |
| --- | --- | ---: | --- | --- |
| P01 | `artifacts/investigations/package-version-rebaseline-10-1-4/README.md` | 6163 | `5E37640F8F9F0B24E10B016606FE46E9361F4005606BE82EBC00FF44761E09B5` | 10.1.4/230版本隔离规则 |
| P02 | `artifacts/investigations/package-version-rebaseline-10-1-4/version_map.json` | 45298 | `70E9C5981269F3096F384FF85D50A6DEA2855399984DDF59B6664306634DE48B` | binary/metadata身份；不得外推未列方法 |
| P03 | `artifacts/investigations/manual-input-runtime-contract-10-1-4/closure.json` | 3734 | `5663C186B67F62E6BEEFB62E67983DE878FD5FEB68590154C7596A4FC3FD5DC2` | 手动阶段已关闭，不代表stage 5关闭 |

### 5.2 可复用的10.1.4直接依赖

| ID | Reverse路径 | 字节 | SHA-256 | 已确认边界 |
| --- | --- | ---: | --- | --- |
| C01 | `artifacts/investigations/manual-input-runtime-contract-10-1-4/manual_input_static_contract.json` | 578113 | `14626F571BECF45EBA9D4045F5C2EE3F991387A6562BD4BAF351E87A88EA973C` | 118方法映射；其中仅少数stage-5入口可复用 |
| C02 | `artifacts/investigations/manual-input-runtime-contract-10-1-4/arm64/032f29cc__OneFrameData__Setup.arm64.tsv` | 2439 | `DA15903BDA6014884AA0D93D580CC2CBD54C7FAB767F1A17D6AF611FF672A065` | `Setup 0x32F29CC–0x32F2AB8`，236字节 |
| C03 | `artifacts/investigations/manual-input-runtime-contract-10-1-4/arm64/03303ff0__InGameOneFrameJudgementController__ReflectOneFrameData.arm64.tsv` | 13177 | `96DA7CA9FF778ECDBB6DF384E423D642E2741A352B99BE36ED3B910B78BA979E` | `Reflect 0x3303FF0–0x33044FC`，1292字节 |
| C04 | `artifacts/investigations/manual-input-runtime-contract-10-1-4/arm64/03a75f70__NoteBase__getAddCombo.arm64.tsv` | 168 | `537A876CFEF30698FF87A9C19C70ABAABD018487B91C40F5699C799F7A6A3EA6` | Great/Perfect与低结果的Combo producer入口 |
| C05 | `artifacts/investigations/manual-input-runtime-contract-10-1-4/arm64/030e0130__NoteFrontBase__judgeFrontNote.arm64.tsv` | 12370 | `46E8C3CCD63301255094BAE2375BA65478160512DB29E276F67CEC4665A548A1` | front完整生产者入口及调用顺序候选 |
| C06 | `artifacts/investigations/manual-input-runtime-contract-10-1-4/arm64/030eb8d0__NoteLong__judgeAfterNote.arm64.tsv` | 13597 | `3D90AB91C2225612DD49ABE4F7AE71793D78A683977AB82D5588FCF706ECC49C` | Long terminal生产者入口 |
| C07 | `artifacts/investigations/manual-input-runtime-contract-10-1-4/arm64/0321db2c__NoteSlide__intermediateNoteJudge.arm64.tsv` | 6551 | `A03C1E4B97C412C431CC018C825470602E40233432E1DFE7C089E320AE48E653` | Slide intermediate生产者入口 |
| C08 | `artifacts/investigations/manual-input-runtime-contract-10-1-4/arm64/0321f47c__NoteSlide__onMissAfterNote.arm64.tsv` | 2188 | `83509AE4E53A760A228675AB0504AA4D811944224592F787030A9CA36D661942` | Slide terminal Miss入口 |

C01–C08只允许B01复用其字节、边界和已有字段布局。它们没有独立闭合ScoreUtility、InGameRecord、Life source、Skill/Fever manager、master rows或runtime结果，因此不能单独解除B03硬门。

## 6. 10.1.3历史迁移候选

以下文件都存在于Reverse HEAD，但样本是10.1.3/229。哈希用于保证候选身份，不表示它们已晋升为10.1.4依据。

| ID | Reverse路径 | 字节 | SHA-256 | 迁移问题 |
| --- | --- | ---: | --- | --- |
| H01 | `artifacts/investigations/runtime-integration-prototype/rhythm_game_standard_score_pipeline.json` | 6297 | `5B353342E7A766705BA5C0699D332864F984C897412A1EE4492658811D5D7E5C` | standard result/combo表、Reflect顺序、代表项 |
| H02 | `artifacts/investigations/base-score-construction/arm64/base_score_construction.s` | 4434 | `750410B4DAC5749BA4433B498B09AAF0DD13C0A4F09C809B5E5914F8C7CFE2C2` | total parameter、base score、maxNote、Game Over route |
| H03 | `artifacts/investigations/base-score-construction/base_score_construction.json` | 5001 | `FAC19A68CEF22F299D15304E9F05A4947913AC08E7E8D6948788F3C6B5D7CC9F` | H02结构化摘要及production count |
| H04 | `artifacts/investigations/event-score-multipliers/arm64/event_score_multipliers.s` | 3479 | `95339195409EAD00F4DD28036CB42A1FDF43AC74B9A481CCB20268FA67323FC8` | event/festival倍率与highest-note record |
| H05 | `artifacts/investigations/event-score-multipliers/event_score_multipliers.json` | 3099 | `DA1EBFA0BC6B9813577C809DF0AD867E8AC90DCAC24BB025903AC5713322BB01` | trunc公式、stage level和strict max |
| H06 | `artifacts/investigations/free-live-event-bonus-construction/free_live_event_bonus_construction.json` | 6560 | `84A6C04E378A642CE90F4A8CF4B943C94959E7492990A92A8E958B4C4ECDE919` | event/area/member原始参数构造与清理 |
| H07 | `artifacts/investigations/special-mode-combo-rates/special_mode_combo_rates.json` | 2480 | `7D5EF4396771ECE85277AF059C9064C625627354862CF38CB8504BC437A0F01B` | Auto/Festival/Medley/Garupa combo dispatch |
| H08 | `artifacts/investigations/judgement-result-pipeline/README.md` | 6706 | `150A105CD75CFBB62D39F54CD57BC0D3A8A2ACDCD7BA3510350FE6C5CBC47DC7` | OneFrame完整字段与判定→Reflect摘要 |
| H09 | `artifacts/investigations/judgement-result-pipeline/decompiled/03304eac__InGameOneFrameJudgementController__ReflectOneFrameData.c` | 10305 | `BC2F6A9035A1086630AC2849234DD30E07BEA8104F8816BBB9A4282CE04256AF` | 10.1.3 corrected Reflect C |
| H10 | `artifacts/investigations/judgement-result-pipeline/decompiled/032f3888__OneFrameData__Setup.c` | 1194 | `7D49B592BB71CFD65ED29B9CE95B46D52DC211A2055E1E585E8DAD2585606F9A` | 10.1.3 Setup字段写入 |
| H11 | `artifacts/investigations/skill-fever-consumers/README.md` | 4091 | `B1252479933D0EC85AD01AFAA18B0AE00D2BA538DD6CB1F6DA2C89645A10093B` | Skill Note/Fever Note root/terminal消费 |
| H12 | `artifacts/investigations/skill-fever-consumers/arm64/skill_judgement.s` | 672 | `2AB11E23F16C32912E80A4ED235DE698597C2C368C53837459A5EC4727CF251B` | success/failure、playlist/network reserve入口 |
| H13 | `artifacts/investigations/skill-fever-consumers/arm64/fever_judgement.s` | 760 | `AE9BD4044C954A75BD2E6C6B321A82EA36B23767A6A7DDA61C52A548F86F9827` | Fever point与progress入口 |
| H14 | `artifacts/investigations/skill-playback-state-machine/skill_playback_state_machine.json` | 2683 | `99B1DEC146FEE33D7025A87C034DA3C322C3565656E5B69D55D787339237F7C5` | Skill四态、timer、once heal、0.75 finishing |
| H15 | `artifacts/investigations/skill-playback-state-machine/arm64/skill_playback.s` | 5256 | `B1F3FB978FC2C08A981124602FA1B8447EA045436CAC9EF0FF7505BB6192BCDD` | H14直接ARM64候选 |
| H16 | `artifacts/investigations/skill-activate-effect-consumers/skill_activate_effect_consumers.json` | 2345 | `6CE30C07E73AF1967C72DEAED56BA356F098AAC203A41FB20F12A2A45D40B734` | effect 0–10、judge/damage/rate/Crescendo/Never Die |
| H17 | `artifacts/investigations/skill-activate-effect-consumers/arm64/skill_activate_effect_consumers.s` | 1860 | `E04C1318F645ABEEE8E85D2617B147A32EB0B51A4CE00F73E97A4F0EECC83B9C` | H16直接ARM64候选 |
| H18 | `artifacts/investigations/fever-command-state-machine/fever_command_state_machine.json` | 1606 | `8D063CC679EFC06F4DD53A607FCA5495877A3BF1DA157337CD9F9546DAB7DC15` | Fever状态/命令/2.0 rate/pass 80 |
| H19 | `artifacts/investigations/fever-command-state-machine/arm64/fever_command.s` | 3220 | `A4619BE9A01B319003BEEB7F75C2B6A1B0C7EFD9C9DAFAF2AA7C61A84A6BFD6E` | H18直接ARM64候选 |
| H20 | `artifacts/investigations/life-skill-runtime-oracle/life_skill_runtime_oracle.json` | 3111 | `D8A1534D3223AD177E0D24B089E50990E019DA4ADB28BD19FF44216AC0CC0810` | 历史视觉观察1000/1000→1500/1000、+2686 |
| H21 | `artifacts/investigations/life-skill-runtime-oracle/verify_life_skill_runtime_oracle.py` | 1093 | `66213931CF80F1F8D3A81215718BE2F7C37E6CC57EDD9A14B44E76123BFAC6CD` | H20离线哈希/字段校验 |
| H22 | `artifacts/investigations/free-live-event-bonus-construction/arm64/free_live_event_bonus_construction.s` | 6620 | `1591DE3BDF1E95D7CCFAF6A268DE91BDC2A42834422B153DE78BE82FCD60E477` | H06的直接ARM64候选 |
| H23 | `artifacts/investigations/special-mode-combo-rates/arm64/special_mode_combo_rates.s` | 1449 | `07B6EFD918FE3FD15EAC32AA5B1F9BA4A2F9B56829BDC0F77A25869A582B1FA9` | H07的直接ARM64候选 |
| H24 | `artifacts/investigations/judgement-result-pipeline/decompiled/030e0fec__NoteFrontBase__judgeFrontNote.c` | 7878 | `27751F90D463CDFB074A38F1607FCBA3F0E94891F1F474074D571D600E10048A` | 判定到完整业务OneFrame构造的10.1.3 corrected C候选 |

历史提交身份：H01–H07、H22–H23来自`a9c8485d3240439c33ede1e3d09bdbf9443e97a3`；H08–H10/H24来自`0399c66d1be644a8a2a7bd978b41631817d543c2`；H11–H19来自`5472b78b816034c779a078a1a300ae1f683ed518`；H20–H21来自`c0fb10acdb8d4bac52f48a3c1f5fae3b21a41740`。

## 7. 历史结论与10.1.4重验矩阵

下表仅定义B01/B02要回答的问题，不是当前生产结论。

| 历史候选结论 | 候选证据 | 10.1.4必须重新确认 |
| --- | --- | --- |
| `baseScore = totalParameter * ((scoreLevel-5)*0.01+1) / maxNoteCount * 3` | H02/H03 | float/int类型、逐操作Float32顺序、zero/maxNote异常、缓存字段与初始化调用点 |
| 普通root=1、Long再计tail、Slide计非invisible child、Multiple共享root | H02/H03 | 当前chart对象图到原作record的逐family计数，普通/HABAHIRO production exact count |
| standard result rate Miss/Bad=0、Good=.5、Great=.8、Perfect=1.1 | H01 | 10.1.4 rodata bits、table索引、Auto/Festival bypass与未知enum |
| standard Combo按0–20、21–50…701+范围 | H01 | 每个边界、inclusive规则、float bits、无匹配行为 |
| Reflect先改Combo，再分两次toward-zero计算score | H01/H05/C03 | 10.1.4完整指令顺序、int width/overflow、每entry与frame总计mutation |
| 代表项按更高raw result替换，同值保留首个 | H01 | adjusted/raw字段区别、JudgeTiming/ScoreUpType copy及空frame状态 |
| Team Festival只对普通分追加stage multiplier | H04/H05 | mode enum、rate三项组合、life/combo/judge range与level选择 |
| Free Live bonus与普通分共享Combo/ScoreUpRate | H04–H06/H22 | upstream source、Approximately zero、clear lifecycle及模式限制 |
| Skill result correction先于damage/score | H08/H16/C05 | exact caller/callee顺序、first-match规则及同帧Skill切换冻结点 |
| Never Die仅修正lethal并留下Life 5 | H16/H17 | lethal比较、signed delta、guard type、同时多damage entry顺序 |
| Skill四态0/1/2/3、Playing特定状态冻结、Finishing 0.75 | H14/H15 | timer exact bits、delta phase、expiry before/after subtract、pause/GameOver状态值 |
| once heal支持fixed/rate与under-life gate | H14/H15/H20 | current/max/condition source、整数除法、overheal上限及1000→1500含义 |
| Fever Great/Perfect积分、80 pass、Level1 rate=2 | H11/H13/H18/H19 | difficulty point表、root/tail消费、team identity、reset/callback/reservation顺序 |
| Auto/Festival/Medley/Garupa Combo特殊路由 | H07/H23 | 当前mode enum、profile source、no-match/error、具体当前master rows |

## 8. V01与D01–D24硬门

### V01 10.1.4整阶段版本重基线

- 从10.1.4 metadata按owner/method/signature解析全部stage-5方法，逐个记录RVA、全局下一入口、字节数、SHA-256和独立ARM64 TSV。
- 解析全部相关type layout、enum、static-data offset、delegate字段、list/array element type和rodata常量。
- 每个10.1.3目标必须是`mapped`、`removed-with-proof`或`renamed-with-proof`；不能按固定delta生成地址。
- verifier直接读取锁定10.1.4 ELF/metadata，证明方法边界、指令字、字段offset、enum和常量。
- **关闭条件**：`version_rebaseline=closed`且`unknown_methods=[]`、`unknown_layouts=[]`、`blocking_findings=[]`。

### D01 完整方法/类型边界

必须至少覆盖：ScoreUtility、InGameRecord、OneFrameData、OneFrameTotalData、InGameOneFrameJudgementController、NoteFrontBase、NoteBase、GamePlayButton、SituationSkillManager、SkillNotesInfoUtility、InGameSkillNoteController、FeverTimeManager、TeamLiveFestival/Medley/Garupa相关calculator及必要start-data owner。global bundle必须拆为独立范围。

### D02 OneFrame字段与Setup/Reflect ABI

确认完整参数顺序、每字段offset/type、`ScoreUpRate`是否存储乘积、五槽扫描、IsUse清理时点、total-data字段与代表项tie。C02/C03只能作为入口，不能替代callee和layout闭合。

### D03 初始化与maxNoteCount

确认`analyzeBMS -> InGameRecord.maxNoteCount -> InitBaseScore`顺序、每family计数、zero count行为、普通/HABAHIRO生产图映射及重复初始化/reset。

### D04 数值语义

确认每个float bits、operation order、toward-zero点、int32/int64宽度、负数转换、加法/乘法overflow和NaN/Infinity是否可能进入原作。Portable边界必须据此拒绝非法值。

### D05 result与Combo correction

确认standard table、range inclusive/strict、Combo先后、Auto coefficient、Festival bypass、Medley/Garupa fallback。具体master rows必须哈希锁定或明确要求调用者提供。

### D06 ordinary与event base score

确认队伍成员字段、score level source、Approximate-zero、Game Over 0.1路由、real-value Skill加法、Free Live event parameter构造/clear及活动类型。

### D07 damage producer

确认raw/adjusted result到damage/Power的映射、difficulty或mode source、Long/Slide intermediate/tail差异、符号方向、多个entry累积与damage guard前后顺序。

### D08 Life初始化、上下界与Game Over

确认初始Life、playerMaxLife、显示denominator与业务上限是否同字段；heal可否超max、damage是否clamp至0、Game Over何时检测、同帧heal/damage顺序。必须解释并重验H20的`1500/1000`。

### D09 Damage Guard与Never Die

确认fixed/rate damage、zero-rate guard type、Never Die guard type、lethal谓词、Life=5公式、多个guard优先级和每entry冻结事实。

### D10 Combo、计数与record

确认current/max Combo、break/reset、result counters、Fast/Slow、all-perfect、one-note max普通/bonus记录、strict greater与equal retention、frame total字段。

### D11 Skill Note eligibility与source identity

确认各mode enable表、skillCharaList索引、MultiNormal本地display/deck slot、root/terminal Skill字段、success/failure、MoveTime抑制和duplicate reserve。

### D12 Skill playlist状态机

确认queue index0、Begin/Playing/Finishing、duration、effective timer、gameFrameCounter+1 reservation、Encore、0.75、Stop drain、pause/GameOver freeze及callback顺序。

### D13 active Skill effect全分支

确认effect enum 0–10、value type、condition比较、first/ordered traversal、judge correction、damage、score over/under life、continuous worst result、only-perfect、under-great-half、Crescendo clamp/reset和same-frame冻结点。

### D14 once effect与Life Heal

确认fixed/rate整数公式、condition Life比较、一次性时点、多个queue item、Life mutation与外部callback顺序；activate-effect heal(2)若无consumer必须继续失败关闭。

### D15 Fever Note消费

确认root/terminal flag、仅None接受、difficulty点表、Great/Perfect key、Good/Bad/Miss无key行为、remaining-note ceil公式和本地pass更新时点。

### D16 Fever command/state

确认state/command enum、Ready/Start/End mutation、own-team计数、>=80、idempotence、reset顺序、callback before reservation、gameFrameCounter+1及score rate 2.0 bits。

### D17 special mode与master profile

确认Team Festival三rate及effect level、Medley/Garupa ordered ranges、Auto coefficient、mode enum和no-match行为。缺失/重叠range是原作行为还是portable拒绝必须有证据。

### D18 runtime R1对象与字段identity

在10.1.4原生ARM64设备用观察型hook记录OneFrame Setup/Reflect、InGameRecord、Life、Skill、Fever对象identity与before/after字段；不改返回、不写进程内存、不patch APK。

### D19 fixed-event oracle

生成BS01–BS36，expected来自10.1.4 ARM64/static contract、原始master rows和R1 raw trace，不来自Python/TypeScript prototype计算。所有case必须`unknown_fields=[]`。

### D20 同帧组合与冻结时点

确认五个entry中Skill开始/结束、Fever开始/结束、Combo变化、Never Die、heal/damage互相交错时，每entry读取哪个before/after状态；确认第六槽failure是否发生在业务mutation前。

### D21 生命周期/failure atomicity

确认初始化profile失败、pause、fault、dispose、重复initialize、Reflect内部非法状态、backend异常时允许的mutation与错误优先级；portable额外检查必须在领域mutation前完成。

### D22 reset、seek、continue与Game Over边界

明确哪些属于本阶段普通生命周期。未闭合的ReturnTime/snapshot/continue必须排除；Game Over如纳入必须覆盖Score decrease、Skill timer state及后续Note/Reflect门。

### D23 production chart与master provenance

锁定普通/HABAHIRO BMS SHA、score level、difficulty、deck/start-data/master rows的来源和哈希；测试不得从编辑器对象或任意fixture作者值冒充原作配置。

### D24 evidence closure与portable contract

Reverse `closure.json`必须逐项关闭V01/D01–D24，记录`business_state_gate=closed`、`blocking_findings=[]`；固定oracle明确允许宿主提供的字段、拒绝条件、owner、session、lifecycle和mutation边界。

## 9. 固定事件oracle要求

### 9.1 Oracle输入

- 锁定10.1.4 binary/metadata和package identity。
- 锁定普通与HABAHIRO production BMS、score level、difficulty及chart-derived maxNoteCount。
- 哈希锁定的deck/start-data/master profile；每个字段注明原作owner、type、offset或序列化来源。
- 初始Life/Combo/Score、明确play mode、Auto coefficient和special-mode profile。
- 按outer-frame顺序的已闭合Auto/Manual judgement轨迹，不允许直接注入`OneFrameData`expected字段。
- Skill Note/Fever Note来自production chart owner；Skill/Fever命令来自已证实manager入口。
- R1 raw trace保留before/after object identity、frame counter、slot、字段bits和调用顺序。

### 9.2 Oracle输出

每个case至少输出：

- 初始化后的base score、bonus base score、maxNoteCount及profile identity摘要；
- 每个slot完整业务entry及字段bits；
- Reflect前后Score、bonus Score、Life/Power、current/max Combo；
- result/Fast/Slow/one-note-max记录及代表raw/adjusted/timing/type；
- Skill queue/current/state/timers/effective timer/continuous/Crescendo；
- Fever points/pass/command/state/rate/reservation；
- Game Over、guard、Never Die和生命周期状态；
- callback/domain trace及严格顺序；
- failure case的before/after完整snapshot与backend trace，证明零mutation或已证实的原作partial mutation。

### 9.3 BS01–BS36固定case矩阵

| Case | 必须覆盖 |
| --- | --- |
| BS01 | 普通production chart逐family maxNoteCount与base score初始化 |
| BS02 | HABAHIRO production chart可见/invisible Slide计数 |
| BS03 | deck三个参数逐成员Float32累加与score-level rate |
| BS04 | Free Live bonus zero/nonzero构造、缓存与clear |
| BS05 | Perfect/Great/Good/Bad/Miss result correction exact bits |
| BS06 | standard Combo每个range边界与701+ |
| BS07 | 单Normal判定完整OneFrame业务字段 |
| BS08 | Long head/tail与Slide intermediate/tail业务字段 |
| BS09 | Multiple与同position group不重复maxNote/score identity |
| BS10 | 同帧两entry：Combo先变更再选各自rate |
| BS11 | 五槽caller/slot order、代表项最高raw、同raw保留首个 |
| BS12 | 第六槽失败及全域mutation边界 |
| BS13 | result/Combo/Fast/Slow/maxCombo/all-perfect计数 |
| BS14 | one-note普通/bonus strict max与equal retention |
| BS15 | Miss/Bad/Good/Great/Perfect damage/Power映射 |
| BS16 | 多damage同帧Life mutation顺序与0/Game Over边界 |
| BS17 | fixed/rate Damage Guard与guard type |
| BS18 | Never Die非lethal/lethal/equal边界及Life 5 |
| BS19 | fixed Life Heal与condition equality |
| BS20 | percentage Life Heal整数顺序与overheal/upper-limit |
| BS21 | Skill Note success/failure/MoveTime/MultiNormal eligibility |
| BS22 | Skill queue Begin→Playing→Finishing→None与0.75边界 |
| BS23 | Skill Playing pause/GameOver freeze、Stop drain及多queue |
| BS24 | judge correction与first eligible effect |
| BS25 | damage/score over-life/under-life active effects |
| BS26 | continuous worst-result、condition与same-frame冻结 |
| BS27 | only-perfect、under-great-half与ScoreUpType |
| BS28 | Crescendo Perfect stack、clamp、reset和非Perfect |
| BS29 | Fever root/tail、difficulty point、Good/Miss no-key |
| BS30 | Fever >=80 pass、duplicate suppression和remaining ceil |
| BS31 | FeverReady/Start success/failed/End、reset/callback/reserve |
| BS32 | Fever Level1 2.0 score rate与同帧state切换冻结 |
| BS33 | Auto coefficient、result-correction bypass及Combo route |
| BS34 | Festival stage effect与bonus exclusion；Medley/Garupa ranges |
| BS35 | Game Over 0.1 Practice/collaboration/multiplayer mode matrix |
| BS36 | invalid profile、pause/resume、fault/dispose、重复消费零mutation矩阵 |

每个case必须列`evidence_ids`、`input_provenance`、`expected_source`、`unknown_fields`和`blocking_findings`。只要任一case存在unknown，D19/D24不得关闭。

## 10. 详细实施步骤

### B00 建立阶段任务书

1. 盘点上游公开/私有边界和当前失败关闭点。
2. 盘点Reverse HEAD的10.1.4直接依赖及10.1.3历史候选。
3. 建立范围、硬门、owner、oracle、批次和完成矩阵。
4. 不修改production/test/package scripts。

### B01 晋升10.1.4静态证据

1. 在Reverse建立`score-life-state-runtime-contract-10-1-4`调查。
2. 解析D01完整方法/type/enum/constant列表，按managed name独立映射。
3. 导出独立ARM64 TSV、结构化static contract、targets、SHA256SUMS和verifier。
4. 逐项复核H01–H24；相同、变化、删除都写明当前版本直接依据。
5. 提交/push Reverse并确认远端`0 0`。
6. 冻结最小证据包到Garupa，建立manifest/OPEN_GAPS/verify，先独立提交证据批。

### B02 建立实体设备与fixed-event oracle

1. 按R0→R1能力阶梯设计观察型采集；不使用R2、不改游戏内存。
2. 捕获D18对象/字段identity和核心before/after顺序，采集plan/script/raw trace全部哈希锁定。
3. 获取并锁定BS case所需BMS、deck/start-data/master rows；账号隐私字段不得进入证据包。
4. 生成BS01–BS36固定oracle和portable contract；expected不得调用prototype待测算法生成。
5. 编写static/runtime两套fail-closed verifier及closure.json。
6. 只有V01/D01–D24全部closed、`business_state_gate=closed`后才更新本文档解除B03硬门。

### B03 锁定配置、领域数据与owner

1. 新建Score/Life/Skill/Fever原作数据结构和enum，不引入编辑器/UI类型。
2. 扩展`SimulatorEngineInput`为B02确认的portable原始profile；全部深冻结、owner/session绑定。
3. 建立`InGameRecord`、`ScoreUtility`、`SituationSkillManager`、`FeverTimeManager`对象所有权。
4. 扩展完整`OneFrameData`/`OneFrameTotalData`内部类型；公开snapshot保持只读投影。
5. 初始化前完整preflight所有profile，非法后项零mutation。
6. 单独提交production，再提交owner/immutability/failure定向测试。

### B04 恢复基础分与最大Note数

1. 从production chart parent-owned图计算maxNoteCount，不重新解析编辑器谱面。
2. 恢复total parameter、score-level rate、base score和bonus base score逐操作语义。
3. 恢复初始化调用顺序、缓存、Approximately zero与Game Over base route。
4. 恢复standard result/combo table和mode dispatch的纯函数owner。
5. 用BS01–BS06及普通/HABAHIRO生产图验证。

### B05 恢复单次判定业务投影

1. 将adjusted result从active Skill owner接入现有manual/Auto判定生产路径。
2. 恢复addCombo、damage/Power、guard、ordinary/bonus corrected base。
3. 恢复Fever/Skill/Crescendo rate和ScoreUpType，保持callee顺序。
4. 每个Note family生成完整不可变entry；不让调用者author业务字段。
5. 同一outer-frame transaction先完成全部entry纯preflight，再按slot commit。
6. 用BS07–BS09、BS15和family production graph验证。

### B06 恢复Reflect、Combo、Score与Record

1. 按slot顺序消费IsUse entry并在证据时点清理。
2. 按原作顺序变更Combo、选择rate、逐阶段截断普通/bonus score。
3. 恢复Score/bonus Score/current/max Combo、result/Fast/Slow计数。
4. 恢复one-note max、代表项、frame total和tie规则。
5. Reflect完成后统一释放五槽；失败路径按D21保持原子或已证partial mutation。
6. 用BS10–BS14验证同帧与record矩阵。

### B07 恢复Life、Damage Guard、Never Die与Game Over

1. 恢复initial/max/current Life及Power/signed damage语义。
2. 恢复固定/倍率guard、guard type和每entry冻结。
3. 恢复Never Die lethal predicate与Life 5公式。
4. 恢复heal、overheal/upper-limit及Game Over检测顺序。
5. 将Game Over与InGameManager生命周期连接，仅实现D22闭合范围。
6. 用BS15–BS20、BS35验证所有相等/临界值。

### B08 恢复Skill Note与playlist状态机

1. 按mode、chart Skill index和local identity恢复success/failure路由。
2. 建立playlist/current request及None/Begin/Playing/Finishing四态。
3. 恢复duration、effective timer、Encore、next-frame reservation和0.75 finishing。
4. 恢复once Life effect、condition、Stop drain和pause/GameOver freeze。
5. network reserve只记录已确认本地领域事实，不实现Photon。
6. 用BS21–BS23验证。

### B09 恢复active Skill与Crescendo

1. 建立immutable activate-effect spec并保持原作列表顺序。
2. 恢复judge correction、damage、Never Die和普通/over/under-life score效果。
3. 恢复continuous worst result、condition、only-perfect与under-great-half。
4. 恢复Crescendo stack/clamp/reset和ScoreUpType。
5. 确认并实现同帧每entry冻结，不在Reflect读取later Skill。
6. 用BS24–BS28验证全部effect enum和未知enum失败关闭。

### B10 恢复Fever状态机

1. 从chart owner消费root/terminal Fever flag与difficulty point table。
2. 恢复points、remaining-note progress、own-team pass和duplicate suppression。
3. 恢复Ready/Start/End命令、success/failed状态、reset、callback与reservation顺序。
4. 恢复Level1 score rate并接入B05 entry冻结。
5. network同步只通过B02锁定portable adapter输入，不模拟消息。
6. 用BS29–BS32验证。

### B11 special mode、event与组合生命周期

1. 恢复Auto/Festival/Medley/Garupa Combo routing和profile缺失失败。
2. 恢复Festival judge/combo/life rate、effect level及bonus exclusion。
3. 恢复Free Live event parameter、bonus score和clear生命周期。
4. 验证Skill/Fever切换与五槽、Combo、Life同帧交错的D20组合矩阵，并以BS10–BS12、BS26、BS32为固定case入口。
5. 完成pause/resume/fault/dispose/Game Over/reset的D21/D22组合。
6. 用BS33–BS36验证。

### B12 production oracle与独立验收

1. 建立`simulator:test:score-life-state`总入口，从全新临时TypeScript产物运行。
2. 先验证冻结证据和BS顺序/哈希，再运行全部stage-5 suites。
3. 回归first-slice、chart、clock、Auto Live、manual input全套。
4. 普通/HABAHIRO production chart重放并逐字段匹配oracle。
5. 运行dependency verifier、production静态反审和source/copy/index证据校验。
6. 从提交后HEAD独立复验，创建acceptance文档，逐项关闭B00–B12与BS01–BS36。

## 11. 测试与验证计划

计划隔离命令（B02前不得加入package scripts）：

```powershell
npx.cmd tsc -p src/simulator/tsconfig.json
npm.cmd run simulator:test:score-config
npm.cmd run simulator:test:score-base
npm.cmd run simulator:test:score-reflect
npm.cmd run simulator:test:life-state
npm.cmd run simulator:test:skill-state
npm.cmd run simulator:test:skill-effects
npm.cmd run simulator:test:fever-state
npm.cmd run simulator:test:score-special-modes
npm.cmd run simulator:test:score-life-production
npm.cmd run simulator:test:score-life-state
node tmp/simulator-reverse-evidence/score-life-state/verify.mjs
node tmp/simulator-reverse-evidence/score-life-state/verify.mjs --index
```

每个runner必须：

1. 编译到新的临时目录，不消费仓库旧产物。
2. 先读取冻结oracle并确认case ID、version、hash、`unknown_fields=[]`。
3. 只通过public/production owner路径驱动，不修改private state。
4. 不联网、不调用Python、不读取Reverse工作树。
5. 使用独立expected bits/int值，不由production helper生成expected。
6. 运行`verifyDependencies.mjs`确认engine无React/Pixi/Tauri/DOM/编辑器依赖。

B12总入口至少包含：

- BS01–BS36全部case；
- 普通/HABAHIRO production maxNote与业务重放；
- Manual与Auto Live producer都进入同一业务OneFrame/Reflect owner；
- 五槽、sixth failure、same-frame Skill/Fever/Life组合；
- invalid/foreign/alias/profile/lifecycle完整失败矩阵；
- first-slice、chart、clock、Auto Live、manual全回归；
- frozen evidence source/copy/index三方校验。

## 12. 批次与提交纪律

1. 不新建、不切换分支；只在`codex/refactor-simulator-implementation`工作。
2. 每批先更新本文档执行记录，再暂存当前目标文件。
3. Reverse证据提交、Garupa冻结证据、production、测试、验收文档必须分别提交。
4. 生产批不得包含test runner/oracle；测试批不得顺带修改生产行为。
5. 提交前执行目标路径`git diff --check`；全仓既有非模拟器用户修改保持不触碰、不暂存。
6. 暂存后执行`git diff --cached --check`、staged name-status/stat；涉及证据包必须执行`verify.mjs --index`。
7. 中文语义提交建议：
   - `docs(simulator): 建立分数生命状态任务书`
   - `evidence(simulator): 冻结分数生命状态证据`
   - `feat(simulator): 恢复基础分与业务状态所有权`
   - `feat(simulator): 恢复OneFrame业务反映`
   - `feat(simulator): 恢复生命与技能状态机`
   - `feat(simulator): 恢复Fever与特殊模式倍率`
   - `test(simulator): 验证分数生命状态固定轨迹`
   - `docs(simulator): 关闭分数生命状态阶段`
8. 每批提交后push并确认：

```powershell
git rev-list --left-right --count origin/codex/refactor-simulator-implementation...HEAD
```

结果必须为`0 0`。

## 13. 阶段完成定义

只有以下条件全部满足，B12才能关闭：

1. Reverse锁定10.1.4/230，binary/metadata哈希匹配。
2. V01与D01–D24全部closed；`business_state_gate=closed`、`blocking_findings=[]`。
3. 所有生产字段、常量、operation order、range、状态转移和清理都映射最终R/BS证据ID。
4. B00–B12全部完成并各自有独立提交/验证记录。
5. BS01–BS36顺序完整、`unknown_fields=[]`，production实际结果逐字段匹配。
6. 完整OneFrame业务字段由engine owner派生，caller不能author score/life/state结果。
7. Base score、maxNote、result/combo rate、逐阶段截断和special-mode路由匹配。
8. Score/Life/Combo/record、Damage Guard、Never Die、heal与Game Over匹配。
9. Skill Note、playlist、once/active effect、continuous/Crescendo及pause匹配。
10. Fever Note、pass、command/state/reset/rate匹配。
11. 五槽同帧组合、sixth failure、entry冻结和代表项tie匹配。
12. 非法profile、alias、foreign owner、pause/fault/dispose均符合零mutation/终态优先级。
13. engine无React/Pixi/Tauri/DOM/编辑器类型依赖；production不读证据包、Reverse、Python或网络。
14. first-slice、chart、clock、Auto Live、manual全回归通过。
15. `tmp/simulator-score-life-state-acceptance.md`从提交后全新产物逐项验收通过。
16. GarupaEditor与Reverse对应分支远端差异均为`0 0`。

## 14. 当前审计结论

- 上游判定生产者和五槽OneFrame调度已闭合，可作为本阶段入口。
- 当前TypeScript有意缺少Score/Power/Life/Skill/Fever业务字段；`setupBusinessData()`继续`evidence-required`是正确状态。
- Reverse已有高价值历史候选和少量10.1.4入口字节，但没有达到stage-5生产证据完整度。
- 最大阻断是10.1.4全方法/布局/常量重基线、master provenance、Life上下界冲突、Skill/Fever same-frame冻结及实体业务轨迹。
- 因此当前只允许B00/B01/B02证据工作；**禁止开始B03生产实现。**

## 15. 执行进度

### B00 任务书

- 状态：`completed`。
- 提交：`a321524f98aa4750a2f3af2220b98a1fa4445afa`。

### B01 10.1.4静态证据晋升

- 状态：`completed-static-business-gate-open`。
- Reverse提交：`6c902656c72f3983fb04386038dcfe38f0d53797`，已push，`origin/main...HEAD = 0 0`。
- 映射结果：`methods=326 mapped`、`layouts=25 unchanged`、`enums=19 unchanged`、`unknown_methods=[]`、`unknown_layouts=[]`。
- 静态结论：完整OneFrame ABI、Reflect槽位/清理/代表项/两阶段截断、result/Combo表、base score Float32顺序、Life `+0x20/+0x24/+0x28`边界、Damage/Never Die/once heal、Skill `0.75f`与Fever `2.0f`已由10.1.4直接证据固化。
- Life冲突：`+0x20`为current Life，`+0x24`为显示/技能百分比基准，`+0x28`为业务上限；因此历史`1500/1000`在布局上可解释，但UI denominator identity仍要求10.1.4 R1。
- 冻结包：`tmp/simulator-reverse-evidence/score-life-state/`，manifest静态条目`335`，Reverse source commit统一为`6c902656c72f3983fb04386038dcfe38f0d53797`。
- 验证：`verify_score_life_state_static.py`通过；冻结`verify.mjs`结果为`V01=closed business=blocked(D18-D24) entries=335`。
- 门状态：`version_rebaseline=closed`、`business_state_gate=open`、`production_authorization=false`。

### B02 实体与fixed-event oracle

- 状态：`in-progress-required-before-code`。
- Reverse R0输入提交：`1ee976ea1de24cb0567762a74e2d091ae4c78464`，已push，`origin/main...HEAD = 0 0`。
- 已关闭子范围：连接设备10.1.4 `AssetBundleInfo`原始record、ordinary `poppin_shuffle_special`（`418DB7F...094DC`）与HABAHIRO `786_miracle_april_habahiro_special`（`4314809...159`）TextAsset；两者与既有production fixture字节哈希一致。
- R1 harness：50个hook目标逐项匹配静态contract，verifier确认无`Interceptor.replace`、`retval.replace`、memory write或APK patch。
- Reverse无输入R1提交：`72aa279fb07041b04ca649df918fa35ab0490d91`，已push且远端`0 0`；显式非默认loopback transport避免默认端口竞态，trace记录transport且agent逻辑不变。
- 该R1含1863个连续事件：Life初始化参数/字段`1000/1000/2000`、稳定InGameRecord identity、11个Miss OneFrame、210次Reflect、slot-order Life `1000→0`及nested single Game Over `0→1`；独立verifier通过。
- 正判定/Skill采集计划提交：Reverse `e65f3411d1a91cfa5ecf0d7b29e99605b04e8a41`已push且远端`0 0`；从已提交手动`hard-touch-plan`保留七lane坐标、30轮120ms全lane循环及7个hold控制，前置Live Failed Retry，合计220动作。
- v1计划已冻结后执行但未晋升raw trace；其7秒输入前等待只作为superseded控制来源，不形成业务结论。
- v2计划提交：Reverse `3adf31f987830ce5b82aba0d92813b69fda3cec7`已push且远端`0 0`；只把输入前等待由7000ms改为500ms，其他217个lane/hold动作逐项保持。
- Reverse正判定R1提交：`5ce2a7ef325def61986a93053ad85c2f4973f25b`已push且远端`0 0`；2166事件连续，实际观察1个Perfect、完整OneFrame `addScore=0x44AF8052`、identity Fever/Skill/ScoreUp rate、Reflect整数Score 1404、Combo/Perfect计数、10 Miss及Game Over保留Score。
- 正判定R1的220次manager update中active Skill始终缺席；float返回hook误读`x0`及两个未闭合trailing参数共5字段由verifier明确不消费，不用错误raw补证据。
- 七lane shell计划提交：Reverse `eb7aba5467569b577cd942957dd65bdce600bc9d`已push；执行因逐事件进程启动超过120秒时间界限而aborted，无raw生成/晋升，采集进程与设备控制无残留，SELinux已独立强制恢复Enforcing。
- 原生多指v2提交：Reverse `445ac26856e597fb6c12c708e7a31ecf995d06e1`已push且远端`0 0`；NDK27.2固定构建6304字节ELF64 AArch64控制器，只写event2 `input_event`并`nanosleep`，采集器先验SHA后push，`finally`恢复Enforcing并删除设备副本。7 slots/250轮/80ms/20ms值保持。
- Reverse active-Skill R1提交：`4ac4ea186efade9091c6f4377ab7ad7dc852a2c5`已push且远端`0 0`；7122事件连续，实际观察Skill Add→Begin→Playing→Finishing→None（`0→1→2→3→0`）、5.0s timer、0.75s finishing及once-heal `800+300=1100`（显示基准1000、业务上限2000）。
- D20单Skill切换子范围：Begin前生成的两个entry冻结Skill/ScoreUp rate 1.0，Skill已Playing后的Reflect仍消费该冻结值；后续18个entry冻结1.2/ScoreUpType1，finish后的首个entry恢复1.0。Fever与多个/重叠Skill交错未观察，不外推。
- post-Game-Over Retry v3计划提交：Reverse `38cee0b409246323b46099e291331a78a267bcec`已push；逐字保留已执行native run，增加12秒Game Over后观察、Retry与确认、reset观察。`retry_only=true`、`continue_allowed=false`且premium-currency动作列表为空。
- Reverse Retry生命周期R1提交：`4f0ce1a02a83747db617695cde69ad47ac8ae78f`已push且远端`0 0`；6375事件连续，Game Over leave与nested AddIPower leave后11.875秒无已hook manager/business调用。Retry复用同一InGameRecord，InitializeLife将Game Over `1→0`、Score/reserve `44403→0`、Life `0→1000`、max Combo `6→0`、判定/输入计数及cached Skill Life清零，保持显示基准1000、业务上限2000、max Note 540，再进入InitBaseScore。
- D18仅部分关闭：Fever、guard、Never Die、多个/重叠Skill和special mode仍缺R1；D20仅单Skillstart/end冻结子范围部分关闭；D22仅部分关闭：score decrease mode、Continue（采集禁止）、seek/ReturnTime仍开放。
- 待关闭：D18/D20/D22剩余、D19、D21、D23剩余deck/start-data/master provenance、D24及BS01–BS36。
- B02关闭前继续禁止B03–B12 production、测试脚本和package script实现。
