# 模拟器手动输入与判定阶段验收记录

> **2026-07-29 提交后独立逐项验收：通过。** 生产修复、定向测试、总验收入口和最终验收文档分批处理；M00–M11、MJ01–MJ26、V01、D01–D15及任务书第12节全部闭合。当前无`required-before-close`或blocking finding。

## 1. 验收身份

- 目标分支：`codex/refactor-simulator-implementation`
- 阶段任务书：`tmp/simulator-manual-input-judgement-task.md`
- 锁定样本：`jp.co.craftegg.band` 10.1.4（version code 230），`arm64-v8a`
- `libil2cpp.so` SHA-256：`815DF62582B35F3EF2223AB033FAC6DC909DE492D548DD28950BF1F98F058D8F`
- `global-metadata.dat` SHA-256：`298D92CB0DC44B11681C5478F3BB08CE5476321361CE962096095CC31812961F`
- Reverse最终证据提交：`ce5353fdc54a3ba8188f3dccd4accdc6c2ef4ce2`
- GarupaEditor最终冻结证据提交：`8050142`
- M03宿主输入边界：`c4b1075`
- M04分发事务基础：`2300ff4`
- M05窗口内核、Normal与Single/Flick：`b3d8629`、`d064f77`、`d189850`、`89d7b93`
- M06 Multiple Directional：`eccbab1`
- M07 Long：`93743a8`、`72f4257`
- M08 Slide：`9c5b3a0`
- M09/M10 timeout、聚合与cleanup：`67d0601`
- M09/M10独立测试：`2118246`
- M11总入口：`4124b3b`
- 最终验收文档：本文件所在提交
- 验收结论：**通过；手动输入与判定阶段关闭。**

## 2. 证据硬门

冻结包位于`tmp/simulator-reverse-evidence/manual-input-judgement/`。提交后独立校验结果：

```text
manual-input evidence verified:
methods=118 layouts=14 enums=13 R1=5 MJ=26
gaps=V01,D01-D15 gate=closed entries=141 index=checked
```

Reverse已提交对象的两套只读verifier结果：

```text
manual input static contract verified:
version=10.1.4 methods=118 layouts=14 enums=13 V01=closed D01=closed

manual input runtime oracle verified:
R1=5 MJ01-MJ26=26
Long=head/release+double-timeout
Slide=root/after-timeout multi-touch=0/1 gate=closed
```

证据关闭状态：

- `version_rebaseline=closed`
- `static_contract=closed`
- `slide_wait_boundary=closed`
- `type_layout_and_enums=closed`
- `runtime_oracle=closed`
- `manual_input_gate=closed`
- `blocking_findings=[]`
- `V01`与`D01`–`D15`全部存在确定关闭记录
- 26个固定事件case严格按`MJ01`–`MJ26`排列，全部`unknown_fields=[]`

测试只读取GarupaEditor冻结包及已提交production BMS fixture；TypeScript生产/测试不调用Python、不读取Reverse工作树、不访问网络。Reverse Python verifier仅由本轮验收命令在Reverse仓库中只读执行。

## 3. M00–M11逐项结论

| 任务 | 核心要求 | 生产路径/验证 | 结论 |
| --- | --- | --- | --- |
| M00 | 建立任务书、范围、硬门、oracle和停止条件 | 当前任务书33批执行记录完整；证据先于生产、生产先于测试/验收 | 通过 |
| M01 | 10.1.4静态重基线 | 118方法、14布局、13枚举；无统一RVA外推 | 通过 |
| M02 | R1、固定事件oracle及D01–D15 | 5条R1、MJ01–MJ26、141项冻结包及两套Reverse verifier | 通过 |
| M03 | 不可变manual frame、resolver capability、生命周期优先 | owner-issued session capability；显式空touch；pause/fault/dispose优先；malformed零mutation | 通过 |
| M04 | phase/finger/button/note owner及候选仲裁 | 15 finger；strict-first ordinary；wide containment；Slide current source与near-line owner | 通过 |
| M05 | Float32窗口、Normal/Flick/Directional | ARM64 operation order；exclusive窗口；0.04/0.01 strict；Stationary empty branch；7-frame synthetic | 通过 |
| M06 | Multiple Directional | chart source-order group、真实touch方向、count阈值、side used/finger owner、type10 | 通过 |
| M07 | Long状态机 | Began/Stop、physical/synthetic Ended、grace不clamp、type2/4/5/6/7、Multiple endpoint group | 通过 |
| M08 | Slide状态机 | head/current child、frozen band、signed correction、cursor、visible/invisible、terminal movement/release | 通过 |
| M09 | 自然timeout Miss | Long双start/单tail strict timeout；Slide front/current timeout与连续invisible推进 | 通过 |
| M10 | outer-frame调度、五槽、聚合、cleanup与原子边界 | 最多五条transaction-local manual reservation；caller-order commit；sixth failure；deactivation清finger/button | 通过 |
| M11 | production oracle、完整回归和独立验收 | `simulator:test:manual-input`从提交后全新临时产物完整通过；普通/HABAHIRO production及上游全部通过 | 通过 |

## 4. MJ01–MJ26覆盖矩阵

| Case | 验证入口 | 核心断言 |
| --- | --- | --- |
| MJ01 | manual boundary | 活动manual外帧必须显式touch数组；空帧只消费一次 |
| MJ02 | manual judgement | `GetSecWithDistance`、result/timing、exclusive窗口和非法Float32输入 |
| MJ03–MJ07 | boundary/dispatch | resolver owner、strict tie、wide、multi-touch、phase复用、Stationary/Ended与整帧原子性 |
| MJ08–MJ09 | manual Flick | Flick strict `>0.04`；Directional方向优先及horizontal strict `>0.01` |
| MJ10 | manual Multiple | count 1/2/3、方向、second finger、used owner、type10 synthetic |
| MJ11–MJ15 | manual Long | head、Normal/Flick/Directional/Multiple tail、grace、release Miss和cleanup |
| MJ16–MJ17 | manual timeout | Long start equal/next Float32双type1 Miss；tail单family Miss |
| MJ18–MJ22 | manual Slide | root/current、band/correction、near-line、invisible、movement terminal、release cleanup |
| MJ23–MJ24 | manual timeout | Slide front/current/invisible timeout；五槽与第六预留失败 |
| MJ25–MJ26 | manual boundary | pause/resume/fault/dispose优先；foreign/forged/later-invalid整帧零mutation |

定向结果摘要：

```text
manual boundary: 7/7
manual dispatch: 5/5
manual arithmetic: MJ02=12, invalid=3
manual Normal: 4/4
manual Flick: 6/6
manual Multiple Directional: 6/6
manual Long: 5/5
manual Slide: 4/4
manual timeout/OneFrame: 4/4
```

## 5. 已落地生产边界

### 5.1 输入与能力所有权

- manual/auto-live模式仍为显式判别联合；真实touch不能切换Auto Live。
- 每个活动manual外帧必须给出显式touch数组；prepared数据深冻结并与caller alias隔离。
- resolver只消费portable bottom-left Float32 position，返回当前engine/session拥有的opaque capability；caller不能写lane、note、result、timing、scale或Slide cursor。
- 完整outer-frame preflight先验证全部touch、phase、finger、position、capability、button和note owner；后一个错误不会留下前一个touch的domain mutation。
- finger容量固定15；Began选择button/note，Moved与Ended复用Began owner；Stationary保留owner但不调用note movement virtual。
- note deactivation通过NoteManager单一callback清除GamePlayButton的note/began owner及dispatcher finger→button owner。

### 5.2 候选与几何

- ordinary候选按active列表扫描，Float32距离严格`<`替换，equal保留首个。
- wide note消费chart-owned button array；caller不能替换为单lane或合成范围。
- ordinary与Slide current分别扫描；Slide不使用root `absolutePos`冒充current child。
- near-line只从geometry backend读取两个source的gameplay-local current X及button3 local X；engine执行`fabs`并以`<=`保留first。
- backend只提供screen-to-world、normalization、containment和Slide raw geometry；不返回result、correction或cursor。

### 5.3 判定运算

- `GetSecWithDistance`、window frame rounding、Fast/Slow、screen distance rate全部保持ARM64 Float32逐操作顺序。
- `0x3D23D70A`（0.04）与`0x3C23D70A`（0.01）使用严格`>`；equal不成功。
- Normal/Flick/Directional/Multiple/Long/Slide的note type、result、timing、position、buttons和count都由engine owner投影；caller不能author payload。
- situation-skill result transform仍未开放；manual adjusted result保持已确认identity-no-active-situation-skill边界。

### 5.4 Long与Slide

- Long terminal runtime由root拥有；manual Stop保存origin、move success和Float32 grace，grace不clamp。
- Long start timeout严格`GetSecWithDistance(adjusted-root,bpm)>0x3E5DDDDE`，同一transaction先预留两个type1 Miss；tail timeout映射type2/5/6/7。
- Slide child保持parent-owned，不进入root active list；current source、buttons、band result和cursor均由parent/SlideNoteManager拥有。
- frozen Slide distance band映射为`4,4,4,3,3,3,2,1`；signed correction和judgeOffset owner决定已确认Great promotion路径。
- visible intermediate先containment；invisible跳过containment。每个成功调用只mark并推进一个current。
- terminal ordinary/Flick/Directional/Multiple分别走type8/9/10 movement路径；physical early release对non-terminal current提交type8 Miss。
- Slide Wait同时检查front strict deadline与首pending visible midpoint；Stop对current strict timeout，连续invisible由parent cursor跳过。

### 5.5 OneFrame与生命周期

- controller固定五槽，first-unused为0→4；manual transaction preflight只保留本地reservation，不写槽或trace。
- 同outer frame允许多个owner-validated manual plan；commit按caller顺序，Reflect仍每外帧最多一次。
- 单transaction第六预留在任何domain mutation前`one-frame.pool-exhausted`；已由其他producer提交的五槽保持原作terminal exhaustion语义。
- pause不消费输入、不推进clock/note/slot；faulted/disposed优先于shape/delta/backend；snapshot和幂等dispose保持可用。
- Score、Life、Skill、Fever、audio、particle、renderer、HUD和record没有默认值或伪实现。

## 6. production与上游回归

提交后总入口重新运行并通过：

```powershell
npx.cmd tsc -p src/simulator/tsconfig.json
npm.cmd run simulator:test:manual-input
node tmp/simulator-reverse-evidence/manual-input-judgement/verify.mjs --index
```

`simulator:test:manual-input`内部结果：

- first-slice：17/17
- chart boundary：4/4
- chart parsing：8/8
- chart batches：6/6
- chart graphs：6/6
- chart multi-range：6/6
- chart command-data：7/7
- chart finalize：7/7
- chart production：普通825 roots、HABAHIRO 598 roots
- clock scheduling：15/15
- Auto Live：AL01–AL22全部通过，canonical trace相等
- dependency boundary：每个隔离runner均通过
- manual evidence verifier：141项、index三方校验通过

production普通与HABAHIRO fixture继续直接覆盖六类core family、87 Long、144 Slide、50 standalone Directional、415 Multiple member及HABAHIRO静态Slide图；manual定向测试使用相同生产类型/父子owner路径，不解析旧模拟器或生成实现派生expected。

## 7. 静态反审

- `src/simulator/engine`未依赖React、Pixi、Tauri、DOM或编辑器类型。
- production未读取`tmp/simulator-reverse-evidence`、Reverse、`runtime/tools`、Python或网络。
- 旧缺口`manual-slide-judgement`、`manual.slide-candidate-position-unimplemented`和`one-frame.multiple-manual-judgements-unimplemented`均不存在。
- geometry contract没有result/correction/cursor返回字段。
- 当前阶段目标路径`git diff --check`及cached check通过。
- 仓库存在大量与模拟器无关的用户工作树修改；全仓`git diff --check`会报告这些既有文件的行尾/尾随空格。它们未被触碰、未暂存，也未参与本阶段提交或验收。
- GarupaEditor与Reverse远端分歧均为`0 0`。

## 8. 保留边界

以下仍是明确的非阻断排除范围，不以默认值或no-op冒充恢复：

- Score、Power、Combo业务消费、Life、Never Die、Skill、Fever、Crescendo、record和HUD。
- Tap/Flick/Hold音效、CRIWARE、Web Audio、lane effect、flash、particle、animation和Sprite。
- DOM Pointer/Touch adapter、Tauri/移动端输入接入、Camera/Pixi production几何适配和主程序路由。
- Unity PlayerLoop精确相位、操作系统采样延迟、GPU呈现。
- seek/倒带/ReturnTime、`RefreshAfterMoveTime`和16秒无输入回放。
- situation-skill result transform、mode14/debug Force Perfect。

这些项目均不属于M00–M11手动输入与判定core关闭条件。

## 9. 最终结论

- V01、D01–D15：全部关闭。
- MJ01–MJ26：全部被总入口完整消费且通过。
- M00–M11：全部通过。
- required-before-close：无。
- blocking findings：无。
- 手动输入与判定阶段：**关闭**。
- 下一阶段只能按`tmp/simulator-reconstruction-plan.md`重新建立独立任务书和证据门；不得把本阶段证据外推到表现、业务消费或主程序接入。
