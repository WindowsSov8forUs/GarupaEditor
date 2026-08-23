# Simulator 逆向证据工作流

## 强制来源与目录

- 唯一行为依据：`HOST________\VSCode\GirlsBandParty-Reverse`。
- 逆向获取、反编译、runtime capture、oracle、closure、profile和verifier均在Reverse对应目录完成。
- Reverse未提交工作树、`.claude/`、`runtime/tools/`和未登记临时输出不属于证据。
- GarupaEditor的`tmp/`只保存本地任务书、验收日志、发布记录和工作笔记；生产代码和提交测试不得读取它。

## 提交顺序

1. 在Reverse取证并生成结果。
2. 在Reverse运行对应verifier、`git diff --check`和暂存检查。
3. 在Reverse提交并推送。
4. 确认所引用的Reverse证据提交已存在于远端。
5. 必要时更新测试fixture manifest，然后实现或修改simulator；未知原作表现登记为内部evidence notice并绑定显式产品语义，不得以`evidence-required`阻断合法动作，也不得把产品语义写成Reverse事实。

## 当前原作 Skin 证据

- Reverse资源基线`977f5e7153257e5bb4cabb2904790408f5452aa7`与后验可达性纠正`4312a8ad5a755b28cb40366f6160771dbf79637e`均已push、远端`0 0`。完整证据profile冻结42 normal rows、30 Collaboration、4 Limited、16-row mode/HAB/MV矩阵、133 official UnityFS/133 whole packs/635 files；其中3个structural-stage pack只经未开放的Live2D owner可达，当前Standard/MV production manifest必须过滤为130 packs/576 files。
- 29 Collaboration与4 Limited包有完整resource profile；过期Collabo 36的六个`skinapril2019`路径不可得。选择该包时当前Skin切换动作不可用并保留既有Skin；内部记录证据notice，禁止用`skin_april2019`替代。
- Default八包与Limited-3九包为隔离fixture，逐项登记来源提交、路径、字节和SHA；production composition另登记九个existing current audio最小MP3快照。Production只从platform static store读取simulator-selected whole-pack key，不读取fixture、Reverse或网络；default-current同样必须装配并校验八包，不得旁路。
- `4312a8ad`正向确认既有Field startup consumer；structural stage不属于当前Standard/MV recipe，禁止为了验收绘制Live2D/3D placeholder。非默认特殊包accepted device trace仍为0，fidelity仅`closed-static-portable`。特殊ParticleSystem动态模块图已由whole-pack profile成为deterministic backend/Pixi renderer consumer；auto-random stream是canonical identity派生portable policy，仍不升级非默认device/frame parity。

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
