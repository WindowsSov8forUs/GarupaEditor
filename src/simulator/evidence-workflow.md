# Simulator 逆向证据工作流

## 强制来源与目录

- 唯一行为依据：[`WindowsSov8forUs/GirlsBandParty-Reverse`](https://github.com/WindowsSov8forUs/GirlsBandParty-Reverse) 已验证、已提交且已推送的证据。
- 逆向获取、反编译、runtime capture、oracle、closure、profile和verifier均在Reverse checkout完成；维护工具如需定位本地checkout，必须由显式参数或`GARUPA_REVERSE_ROOT`注入，不记录宿主安装位置。
- Reverse未提交工作树、`.claude/`、`runtime/tools/`和未登记临时输出不属于证据。
- GarupaEditor的`tmp/`只保存本地任务书、验收日志、发布记录和工作笔记；生产代码和提交测试不得读取它。

## 提交顺序

1. 在Reverse取证并生成结果。
2. 在Reverse运行对应verifier、`git diff --check`和暂存检查。
3. 在Reverse提交并推送。
4. 确认所引用的Reverse证据提交已存在于远端。
5. 必要时更新测试fixture manifest，然后实现或修改simulator；未知原作表现登记为内部evidence notice并绑定显式产品语义，不得以`evidence-required`阻断合法动作，也不得把产品语义写成Reverse事实。

## 当前 Skin / Particle / HUD / Game-clear 证据

**Production 消费复查仍 OPEN。** 下列证据与历史独立差分不能替代最终集成：Score 曾漏掉 StarUIAnchor 对 prefab 根初始坐标的运行时覆盖；particle 内部排序未进入 ordinary 共同排序域；后续实际 stretched worker 已推翻旧居中/投影方向解释，当前仅修复有字节依据的非 Freeform head/tail、退化掩码与 UV 消费，完整 camera uniform/normal/motion 仍开放。当前处分以 [`rendering-consumption-contract.md`](./rendering-consumption-contract.md) 和 `public/capabilities.ts` 为准。这些是算法/集成缺陷，不属于 GPU 排除项；不得要求用户补录作为源码排查前提。

- Skin资源基线`977f5e7153257e5bb4cabb2904790408f5452aa7`与可达性纠正`4312a8ad5a755b28cb40366f6160771dbf79637e`继续拥有master/包选择。过期Collabo 36的六个`skinapril2019`路径仍不可得且没有`skin_april2019`别名；三项Live2D-only structural stage仍不进入Standard/MV recipe。
- 当前source-bound粒子证据由已推送批次`dccbfab9`/`d707d922`/`c52355e9`、native core `1ea7e35b1584809ffb695a2033e4e8f38579f443`和renderer/Slide `e43dded8890260806001fbcb5ab519cfb019a379`共同拥有。覆盖27 resources、1,375 concrete systems、1,147 enabled renderers、114 renderer signatures、4 meshes和152 reachable ordinary/directional pairs；Shape 0/4/5/8/10/no-Shape、per-instance random、module/time/capacity、root→parent TRS、Slide `n`/`g`与mode 0/1/4 GPU前图元曾通过独立差分；后者未覆盖完整 production 消费，当前不能再据此宣布 renderer 闭合。
- Production semantic catalog以exact logical resource、application revision、official UnityFS/serialized asset digest、component PathID、renderer/material/mesh/texture relation绑定leased bytes。Default和selected进入同一Schema-2 validator；expected PNG digest来自application snapshot receipt而非被测bytes自产。Simulation与Pixi只消费同一个cached immutable prepared token；禁止path/name hash random、literal renderer count、first-non-null material或unknown-current fallback。
- HAB authority为`4fc0b23c433bd294dbcdda97658b565c059590f6`：`fieldskin/skin00`、`fieldskin/habahiro`与`tapeffect/habahiro`三包，Root_effect 9 objects / 4 Sprite meshes / 0 ParticleSystems，frame25只换四项资源，frame60无game callback。旧0.25秒synthetic white sine不属于original-compatible route。
- Score/NGUI authority为`dddab345825dbff6d2a5cf65f5fbbcf771b00e07`：64-object/45-widget完整图、source-bound `sgm` metrics、SoftClip GLES3、rank5/6/12与SS/SSS clips。Native ScoreRankData和产品CS-V1输入必须保持不同identity；presentation等价不能升级产品计分。
- Game-clear authority为`6cddb142806ffdb933cc6a237f69f4dd16e9ca97`：base 40/30、FC 6/5、AP 12/11 systems/enabled renderers、34 assets、完整Animator和3.233秒callback/15ms exit。它在launch前并入同一particle token/world/geometry/Pixi executor；typed outer scale仅为`screenToSafeChildScale / pixelsPerWorldUnit`，不得恢复375常量、birth-origin拆分或Pixi-owned第二套simulation。
- 未重新打开的`closed-native-algorithm-equivalent`声明仅限其具名ARM64/serialized/CPU范围；Particle/HUD/Game-clear rendering 不得以历史 GPU前 hand-off 声明绕过当前 OPEN。Browser字体raster、GPU/driver量化、fixed-device framebuffer、CRI/USM和physical speaker继续`OUT_OF_SCOPE`；fixture manifest仍锁定`343c09cc…`，后续证据不为迎合产品测试复制成fixture。

## 当前启动方向与音频证据

- Reverse提交`78e6a70ea906aa1fa778b56e843c7663fdd3b4bc`已push；`startup-direction-runtime-contract-10-1-4/`的SD01–SD16和portable pack约束presentation、视觉owner、状态0→5及输入边界。
- Reverse提交`d408d758f39873c2c997107903300e58d56c59c6`已push且远端同步；`startup-direction-null-session-assets-10-1-4/`的SDN01–SDN04确认count-zero非null SD集合执行零次LoadCharacter但保留3.0秒intro wait，语音null映射缺SoundResource路径。Public两字段因此固定literal null，禁止五槽placeholder、silent MP3或默认身份。
- Reverse提交`b17e64e98423bed3718ac2e76a43cde5c451ee1f`已push且远端同步；`startup-audio-callgraph-10-1-4/`从10.1.4/230 ARM64重新遍历ExecStart、虚调用、协程、voice、BGM、Gaya、Retry、MoveTime及cleanup，包含44个方法切片和10条privacy-normalized observation-only R1。
- 调用图确认Standard Live两种input mode创建`SE_RHYTHM_GAYA` owned loop，Practice两种模式保持null；锁定151,033-byte MP3、完整SHA-256、44.1kHz stereo、310,191 frames、全decoded-buffer loop、1.0/0.5秒fade-in及1.5秒stop-at-zero。BGM先prepared-paused，PlayingNone后resume；voice ended执行release。
- `reachable_unclassified_count`、`unknown_predicate_count`、`missing_resource_count`和runtime hook failure均为0，committed verifier授权production，故`startupDirectionPortable`恢复`closed-portable`。Garupa fixture sourceHead锁定`b17e64e9`，只复制callgraph JSON与最小Gaya字节；production不读取fixture。
- 真实WebView2视觉digest与独立Gaya/WebAudio graph digest只证明portable browser子门，不证明speaker onset、CRI/HCA、Android或原Unity framebuffer exact。后续调查仍必须使用已提交当前样本，不得消费Reverse未提交`runtime/tools/`、10.1.3行为或旧总体`closed`字段。

## 当前谱面 MV Live 证据

- Reverse `f2c0b360`建立83个current ARM64 static slices；最终`38802391fc6169e405c316e9a998f28c283961e3`加入Live Manual/Auto R1、pause/resume/exit/natural、98-model signed-delay inventory、1600×720 layer/bounds observation、original segmented USM技术profile与portable MP4/WebM mapping。
- `mv_live_closure.json`八项unknown/missing/mapping/hook计数均为0，production只授权Live Manual/Auto的host-supplied portable bytes。Practice/Rehearsal MV、Retry/MoveTime MV、standalone MVView、Star3D和CRI/USM/device exact明确排除。
- Garupa fixture中的MV条目来源锁定`38802391`；全局sourceHead随SDN修订更新为`d408d758`。只复制runtime contract、command oracle、closure、portable profile、SDN contract和项目自制20-frame MP4/WebM probe；不复制R1、截图、ARM64或61MB original USM。Production不读取fixture。
- MV WebView2的media/raster digest只证明当前Browser Blob/HTMLVideoElement/Pixi映射，不升级original frame、codec或物理输出。

## 当前多比例布局证据

- Reverse `9167dce77d0472a000b509f993b0e66e44e4797f`已push并远端`0 0`；`simulator-multiaspect-layout-runtime-contract-10-1-4/`包含27个current ARM64 slices、current level3与MoveTime/Movie/Auto-caption最小serialized sources、6组参数化ratio/safe-area oracle和committed verifier。
- 证据关闭任意有效**初始横屏**viewport、base safe-area、StarUI continuous high-aspect、GameCamera、gameplay/particle scale、UIRoot FitWidth、MoveTime circle hit、Auto caption和movie widget。截图derived、fixed-frame authority、unclassified scalar及unknown order计数均为0。
- 同一证据确认不存在完整任意局中resize原作刷新路由；`production_authorization.dynamic_resize=false`只限制原作等价声明。GarupaEditor对post-initial revision采用独立登记的产品级原子surface重建语义并记录notice；重建失败时释放当前session并稳定返回宿主，不宣称原作连续刷新，也不使用无依据的外层letterbox冒充原作。
- Garupa只复制contract和closure两项最小JSON fixture，分别记录来源commit、bytes与SHA；production不读取fixture。1600×720截图和全部WebView2 digest只作observation。

## 测试边界

隔离测试需要离线输入时，只从已推送的Reverse提取最小快照到`src/simulator/testing/fixtures/`，并记录来源提交、源相对路径、字节数和SHA-256。`verifyTestingFixtures.mjs`只校验这些快照，不读取Reverse或网络。生产代码不得读取本地工作记录、Reverse或testing fixture。

Garupa JSON公共schema位于`src/chart/garupa.ts`；本轮字段基线来源为`origin/main@a4ed4bbaa49d3e7db0407a1f2d5500f6d5940114:src/chartCore.ts`。能力边界应直接体现在Public合同、capability类型、失败返回和可执行测试中。发布耗时、逐文件哈希、候选提交及attestation只保留在忽略的`tmp/`，不提交为运行时或测试依赖。
