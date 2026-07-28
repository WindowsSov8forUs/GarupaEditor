# 模拟器手动输入与判定阶段任务书

## 1. 阶段身份与当前状态

- 阶段：模拟器彻底重构实施块4——手动输入与判定。
- 上游：第一切片、谱面构造、时钟与调度、Auto Live均已关闭。
- Auto Live最终状态提交：GarupaEditor `bdb11c399124f23b858cc29f67084e5f40560b07`。
- 锁定原作样本：`jp.co.craftegg.band` 10.1.3（version code 229，`arm64-v8a`）。
- 当前Reverse HEAD：`c2dc5c7f37718a170c9e9b93d5a86b42e9d1a2ab`，`origin/main...HEAD = 0 0`。
- 当前状态：**M00任务书已建立；M01静态证据晋升与M02实体/固定事件oracle是生产代码硬门。Reverse当前工作树存在大量用户修改，全部排除；只允许消费Git对象库中的已提交HEAD。M01/M02关闭前禁止实施M03–M11任何生产代码。**
- 计划证据包：`tmp/simulator-reverse-evidence/manual-input-judgement/`，M01时创建。
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
2. `manual`继续是显式模式；不得因提供touch而把Auto Live切换为manual，也不得让manual无输入时自动Force Perfect。
3. 原作`InputManager.ExecInput`每个外层manager update至多消费一次输入帧，并发生在NoteManager Update与OneFrame Reflect之前；adaptive子步不得重复消费同一输入帧。
4. 宿主输入API是GarupaEditor可移植边界，不冒充Unity API；输入payload、lane解析和坐标空间必须在M02闭合后由M03一次锁定，禁止先设计方便实现的默认接口。
5. 生产owner不得信任调用者提供的note对象、pool ID、OneFrame handle、候选结果、判定结果、BPM、adjusted position、group count或finger ownership；这些值必须由引擎owner计算或通过owner-issued capability取得。
6. 外部输入只能提供已证实的原始事实：finger、phase、坐标及M03锁定的lane-resolution边界；不得由测试直接指定“命中note”“Perfect”“当前Slide节点”或期望回调顺序。
7. `Began`建立的finger→button和finger→note身份由InputManager/GamePlayButton拥有；Moved/Stationary/Ended只能消费该owner状态。相同整数fingerId来自不同引擎、不同session或伪造button handle不得共享能力。
8. 输入事件与一次`step`形成整体事务边界。portable输入/所有权/图验证失败必须发生在clock、scheduler、finger、note、OneFrame和backend mutation之前；原作已确认的中途mutation/异常只能按对应实体证据保留。
9. timeout由现有production adjusted music position、BPM和Note状态机驱动；测试不得注入expected BPM、私有cursor、预计算result或直接写NoteState。
10. movement比较保持原作Float32、严格`>`/`<`/`<=`及screen-to-world distance rate链；不得将`0.04`、`0.01`、`8.0`改成像素阈值、clamp或epsilon近似。
11. stage 5的Score/Power/Life/Skill/Fever与stage 7的音频仍缺席。手动判定只可扩展已闭合的judgement projection，不得用零值伪造完整`OneFrameData`业务字段。
12. Unity touch取消、raycast/camera细节、finger数组越界、相等候选tie、simultaneous order等未闭合分支统一`evidence-required`，不得no-op。
13. `RefreshAfterMoveTime`、seek/回退与16秒无输入恢复不是普通触摸/timeout路径；除非M02另行闭合，否则继续排除。
14. 证据批、生产实现批、定向测试批和最终独立验收批必须分离；任何修复批绿色结果都不能直接关闭阶段。
15. 每次验收必须映射“任务要求→已提交证据ID/portable边界→生产调用路径→独立实际观察”，并枚举`producer × owner × consumer × lifecycle × failure point × mutation`。

### 1.3 执行进度

| 任务 | 状态 | 完成标准 |
| --- | --- | --- |
| M00 建立阶段任务书 | **已完成** | 范围、候选证据、硬门、oracle、实施批次和完成矩阵写入本文档 |
| M01 晋升并修正静态证据 | 未开始，硬门 | Reverse提交可校验的手动输入contract；修正Slide Wait边界冲突；冻结三方哈希 |
| M02 建立实体/固定事件oracle | 未开始，硬门 | D01–D15关闭，MJ01–MJ26固定输入/输出轨迹可离线复算 |
| M03 锁定输入数据与宿主边界 | 禁止实施 | 显式不可变input frame、owner-issued button能力、生命周期和失败优先级闭合 |
| M04 恢复输入分发与候选仲裁 | 禁止实施 | phase、finger/button/note owner、wide/ordinary/Slide/tie行为匹配 |
| M05 恢复窗口与Single/Flick判定 | 禁止实施 | GetResult/JudgeNote、Normal/Flick/Directional的边界bits与事件顺序匹配 |
| M06 恢复Multiple手动判定 | 禁止实施 | 真实touch方向、count阈值、side owner、finish/deactivate匹配 |
| M07 恢复Long手动状态机 | 禁止实施 | Began/Hold/Moved/Ended、合成release、grace、头尾与finger清理匹配 |
| M08 恢复Slide手动状态机 | 禁止实施 | head/intermediate/end、band cursor、release/miss/invisible推进匹配 |
| M09 恢复自然timeout Miss | 禁止实施 | Long start/end、Slide wait/stop及同帧Miss顺序匹配 |
| M10 接入调度、OneFrame与原子边界 | 禁止实施 | 每外帧一次输入、adaptive/pause/fault/dispose、五槽与批原子性闭合 |
| M11 production oracle与独立验收 | 禁止实施 | 完整回归、生产chart、证据验证和组合矩阵无开放阻断 |

### 1.4 初始批次记录

#### 2026-07-29 第一批：M00任务书与证据候选盘点

- 完整重读`tmp/simulator-reconstruction-plan.md`的实施块4、Auto Live持续边界及当前input空实现。
- 只通过`git show HEAD:path`、`git cat-file`和`git grep HEAD`读取Reverse提交对象；当前Reverse脏工作树未作为证据、未恢复、未暂存。
- 盘点`touch-note-arbitration`、`touch-hold-release`、`timeout-flick-paths`、`judgement-result-pipeline`及Auto Live supplement的60个直接候选文件，并独立计算Git blob字节数和完整SHA-256。
- 额外定位10个global note bundle切片，作为M01必须重新导出为独立冻结文件的候选；当前bundle slice index不能直接替代最终证据包。
- 发现静态证据内部冲突：`timeout-flick-paths/decompiled/status.tsv`显示`NoteSlide.WaitState`请求结束`0x321c4e4`但实际扩到`0x321c558`；`execOverWaitState`请求起点`0x321c4e4`但实际起点`0x321c2d0`，两份C正文除边界头外字节相同。这与README/targets“独立边界”声明冲突，登记为D01 required-before-code。
- 未修改生产代码、package scripts、测试、主程序、渲染或音频。

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

1. M01与M02全部关闭前，禁止修改`src/simulator/**`生产实现和手动输入测试运行入口。
2. 新证据必须先提交Reverse，再冻结到GarupaEditor；禁止复制Reverse未提交工作树、`.claude/`或`runtime/tools/`。
3. 静态与实体证据冲突时，先回Reverse修订结论与contract，再更新本任务书，最后才实现。
4. 每个字段、比较符、列表扫描、候选替换、finger写入、状态转换、OneFrame提交和清理都必须引用S/D/R系列证据。
5. README、pseudocode和JSON是摘要，不可覆盖直接ARM64/C/status；摘要与直接源冲突时硬门保持关闭。
6. global bundle候选必须在Reverse导出独立、边界可校验的切片后才能晋升；不能只引用15MB bundle中的行号作为生产依据。
7. Python只能在Reverse生成离线oracle；TypeScript生产、package scripts和测试不得调用Python、Reverse工作树或网络。
8. 测试不得调用private方法、写private cursor/state、注入expected result/BPM/note owner或由待测实现生成expected。
9. 同一输入帧的preflight必须覆盖全部touch、finger、phase、position、button capability和owner关系；后一个坏touch不能留下前一个touch的partial mutation。
10. public host在faulted/disposed时，生命周期terminal failure优先于input shape、delta校验、owner callback和backend副作用；只允许snapshot与幂等dispose。
11. 任何未确认分支统一`evidence-required`，并在对应owner mutation之前返回；不得使用no-op、默认manual、默认空touch、clamp、自动纠错或“最近lane”。
12. production修复与最终验收分批提交；M11必须从提交后全新产物独立复验。

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

## 5. 已提交静态证据候选

### 5.1 来源与状态

- Reverse锁定提交：`c2dc5c7f37718a170c9e9b93d5a86b42e9d1a2ab`。
- 样本：`jp.co.craftegg.band` 10.1.3（229），`arm64-v8a`。
- 当前候选仅用于M00审计；在M01写入manifest并完成source/copy/index三方校验前，不得作为已晋升证据消费。
- 路径前缀均位于Reverse仓库；SHA-256按Git blob原始字节独立计算，使用大写完整值。

### 5.2 输入开始与仲裁候选

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

### 5.3 Hold、move与release候选

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

### 5.4 Flick与自然timeout候选

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

### 5.5 判定与Multiple候选

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

### 5.6 状态与global bundle切片候选

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

`S64–S73`的slice字节数与哈希来自提交内`rhythm_decompiled_bundle_index.tsv`；M01必须从锁定二进制/数据库重导出独立文件，并由新verifier核对源slice、冻结副本和Git index，不能直接复制bundle摘要。

## 6. 当前可确认行为与证据映射

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
| D01 | `required-before-code` | S44/S45实际边界重叠且正文重复，README/targets/status冲突 | Reverse修正独立C/ARM64、status、targets、README与verifier |
| D02 | `required-before-code` | Long类型1–5、Slide类型8–12、emitted 2/5/6/7/8、finger/button私有字段与数组容量名称未闭合 | type-layout/metadata表及每字段owner |
| D03 | `required-before-code` | Unity screen position→button与screen-to-world坐标的portable宿主边界未定义 | 已提交contract明确resolver输入、输出能力、坐标单位/Float32时点 |
| D04 | `required-before-code` | ordinary equal-distance、Slide equal near-line、ordinary-vs-Slide tie、wide/simultaneous候选顺序无实体结论 | 只读runtime/harness tie与active-order轨迹 |
| D05 | `required-before-code` | sweetFrame 0/1、round-to-frame、Fast/Slow、global judgement tolerance在各BPM/offset边界缺实体bits | committed delta/BPM/position/result/timing oracle |
| D06 | `required-before-code` | fingerId有效范围、数组越界、Began无button、Moved/Ended无owner、Stationary、Canceled和多touch枚举顺序 | 实体输入生命周期矩阵 |
| D07 | `required-before-code` | `0.04`/`0.01`等于边界、坐标转换和斜向movement未实体闭合 | Flick/Directional threshold bits轨迹 |
| D08 | `required-before-code` | Multiple真实touch的多指/side owner、count阈值、相邻group传播和重复消费未实体闭合 | production group manual touch轨迹 |
| D09 | `required-before-code` | Long普通/方向/Multiple hold、8.0 grace、inside/outside、physical/synthetic ended与清finger未实体闭合 | Long全状态实体轨迹 |
| D10 | `required-before-code` | Slide paired band内容、cursor边界、VirtualPerfectLine、intermediate Great correction上下文未闭合 | band数据、边界bits与模式身份轨迹 |
| D11 | `required-before-code` | Long/Slide timeout tolerance、equal比较、同帧多个timeout及invisible顺序未闭合 | no-input committed outer-frame轨迹 |
| D12 | `required-before-code` | release时None→Miss、moveSucceeded强制Miss、已消费节点skip、finger/button owner清理顺序未闭合 | Ended矩阵与全对象快照 |
| D13 | `required-before-code` | manual多个producer写五槽的pool顺序、第六槽前置mutation、timeout双Miss和Reflect时机未闭合 | canonical full-object OneFrame轨迹 |
| D14 | `required-before-code` | input相对adaptive子步、pause/resume、fault/dispose、Auto模式收到touch的调用/副作用顺序未闭合 | lifecycle与outer-frame实体轨迹 |
| D15 | `required-before-code` | 一帧多touch后项非法、foreign button capability、重复finger phase、非有限/越界坐标的portable失败原子边界未定义 | portable contract+whole-domain zero-mutation cases |

M01/M02完成标准：D01–D15均必须标记`closed`，且Reverse contract的`manual_input_gate = closed`、`blocking_findings = []`。任何一项未关闭，M03–M11继续禁止。

## 8. 固定事件oracle要求

### 8.1 Oracle输入

每个fixture必须冻结：

- 原作版本、ABI、Reverse提交、采集方式和脚本哈希。
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

1. 在Reverse建立`manual-input-runtime-contract`调查目录。
2. 修复D01：以锁定IDA数据库/ARM64重建`WaitState 0x321c2d0–0x321c4e4`与`execOverWaitState 0x321c4e4–0x321c558`独立边界；status实际边界必须与请求一致。
3. 将S64–S73从global bundle重导出为独立C/ARM64，尤其`IsContainsButton`、GetResult/JudgeNote、containment、Slide timing/near-line/perfect-line和distance rate。
4. 补齐D02所需type layout、enum numeric identity、finger/button字段与数组容量。
5. 生成contract JSON：每个比较、字段、调用顺序、owner和开放项均有直接source引用。
6. 提交Reverse并确认`origin/main...HEAD = 0 0`。
7. 在GarupaEditor创建`tmp/simulator-reverse-evidence/manual-input-judgement/`：manifest、OPEN_GAPS、README、verify.mjs、artifacts和fixtures。
8. 三方校验Reverse源/GarupaEditor冻结副本/Git index；完整大写SHA-256和字节数进入manifest。

**停止条件**：任何边界/摘要/哈希冲突保持`manual_input_gate = blocked`。

### M02 建立实体设备与固定事件oracle

1. 为D03–D15逐项编写只读采集或独立harness方案；不得使用Reverse未跟踪`runtime/tools/`作为最终证据。
2. 锁定原始touch顺序、Float32坐标/delta bits、BPM/offset和production chart identity。
3. 执行MJ01–MJ26；每个边界至少包含前一可表示值、equal、后一可表示值及错误owner/lifecycle组合。
4. 对多指、wide、tie、Long/Slide和Multiple使用实体对象身份，不用Python模拟owner结论。
5. Python只规范化已采集字段并生成固定JSON；所有`inference`字段保持阻断。
6. verifier从提交内原始trace重新生成摘要，逐字段比较并报告`manual_input_gate`。
7. Reverse提交后冻结fixtures到GarupaEditor；更新本任务书D项与锁定提交。

**硬门**：只有D01–D15全闭合、MJ01–MJ26均有固定oracle且`blocking_findings=[]`，才允许M03。

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

- [ ] Reverse静态contract已提交，D01边界冲突修正，S64–S73独立切片晋升。
- [ ] D01–D15全部关闭，`manual_input_gate=closed`且`blocking_findings=[]`。
- [ ] MJ01–MJ26全部有已提交原始输入、固定输出、verifier和三方哈希。
- [ ] 宿主输入frame、坐标空间、button capability和生命周期无隐式默认值。
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

## 13. M00初始审计结论

1. 当前生产`InputManager.execInput`是无条件`ok`，`GamePlayButton.execTouchBegan`返回`evidence-required`；这只是第一切片边界，不能复用为手动实现。
2. current host只有`step(deltaTimeSeconds)`，没有输入payload；M03必须在D03/D14后设计一次outer-frame边界。
3. committed静态候选覆盖触摸入口、候选、窗口、Flick、Long/Slide move/release、timeout和Multiple，但README自身明确要求multi-touch、wide、tie、threshold与timeout实体验证。
4. S44/S45与S63存在直接证据冲突，因此即使其他静态文件“recoverable to implementation level”，当前仍不能开始生产代码。
5. GetResult/JudgeNote、containment、near-line、VirtualPerfectLine和distance rate仍只在global bundle切片中；M01须晋升独立边界，S72的87491字节候选尤其不能直接消费。
6. 当前没有手动输入专用committed runtime oracle；clock目录中的`manual`命名轨迹不包含真实触摸，不能替代D03–D15。
7. Auto Live synthetic Flick/Multiple只证明合成输入链；不能证明真实touch position、finger ownership、distance threshold或release。
8. M00只建立任务文档。下一步必须先回Reverse完成M01静态修正与M02采证，不修改GarupaEditor生产代码。
