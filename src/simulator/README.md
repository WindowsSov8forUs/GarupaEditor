# 模拟器重构基线

旧模拟器实现与专用资源已全部移除。当前已从空白状态建立第一切片的宿主、原作引擎类型和后端契约边界。

## 重构目的

- 从头建设模拟器实现，不迁移或修补已删除的旧实现。
- 保持 GarupaEditor 的总体技术栈方向，不以重构模拟器为由替换项目级技术选型。
- 以 `HOST________\VSCode\GirlsBandParty-Reverse` 中可追溯的逆向工程结果作为实现与检验依据。

## 证据约束

- 每项游戏行为、数据关系、资源绑定和表现细节都必须能够回溯到逆向产物、反编译结果、运行时采集或实体设备复现记录。
- 静态逆向证据不足时，使用现有可用于逆向的实体设备获取针对性运行时证据。
- 不再通过旧模拟器行为、常见音游实现、主观观感或方便实现的假设补齐未知部分。
- 无法确认的行为必须明确标记为未解决，并在证据闭合前停止实现该部分。

## 逆向证据获取与存放工作流（强制）

完整流程见 [`evidence-workflow.md`](./evidence-workflow.md)。

1. 新的逆向证据必须以 `HOST________\VSCode\GirlsBandParty-Reverse` 为工作目录：在那里取证、生成 raw/oracle/closure/profile、运行 verifier，并把结果放入对应的 `artifacts/investigations/` 或 `runtime/` 目录。
2. Reverse 证据必须先 `git diff --check`、校验、提交并 `git push origin main`，确认 `origin/main...HEAD = 0 0` 后，GarupaEditor 才能引用该提交。
3. 当前项目不得消费 Reverse 未提交工作树、`runtime/tools/` 或其他临时输出。静态/动态冲突先回 Reverse 修订并推送，再更新本项目任务书和实现。
4. `tmp/` 只保存任务书、验收记录、专项计划、开放缺口和 `simulator-evidence-pointers.md` 等指针文档；不保存 Reverse 证据副本、raw trace、oracle、manifest、verifier 或重复反编译文件。
5. 离线测试需要的最小快照放在 `src/simulator/testing/fixtures/`，记录 Reverse 提交、源相对路径、字节数和 SHA-256；生产代码不得读取 tmp、Reverse 或 testing fixture。

## 分支状态

第一切片 T01–T11 已完成隔离验收：原作管理器对象图、音符四态、夹具驱动的分族对象池、活跃列表回调、确定性子步顺序、暂停续跑门、OneFrame 容器所有权、统一 Reflect、记录后端和测试快照均已落地。验收记录位于 `tmp/simulator-first-slice-acceptance.md`。

第一切片自身不代表完整模拟器；其后的谱面、时钟、Auto/手动判定、分数生命状态、资源/Pixi、HABAHIRO与音频块已分别闭合。React/Tauri用户手势、窗口路由、资源交付和主程序入口仍留到最终接入阶段。

谱面构造阶段与时钟调度阶段现已完成隔离验收。生产宿主直接接收已登记的 `ChartConstructionResult`；60/120 请求、双 Float32 时钟、0.8 秒 launcher lead、CC03/CC08 专用生命周期、判定 offset、自适应 `counter[1]/[2]/[3]` 的 `101/21/6` 回退、BPM-before-Note、实时反序 Update、survivor AfterUpdate 和暂停冻结均已按最终 Reverse 证据恢复。

时钟与调度验收记录位于 `tmp/simulator-clock-scheduling-acceptance.md`。S01–S10 已完成。

Auto Live A00–A10已完成第十四次提交后独立逐项重验收。验收排除Reverse脏工作树，以纯`c2dc5c7f` clone和SHA-256锁定原始样本运行两套verifier；完整A10、证据index、独立topology及新组合探针通过。root/source/receiver/父ownership、Slide child角色、失败重绑、有限clock结果与G19 fault跨dispose边界均已关闭，见`tmp/simulator-auto-live-acceptance.md`。

OneFrame 容量现在由原作证据固定为 5，不再接受宿主或测试容量配置。公开的 `OneFrameJudgementBatch` 只承载已闭合的判定投影，不冒充原作完整 `OneFrameTotalData`；Score/Life/Skill/Fever、render 与 audio 由各自已恢复的领域 owner 消费该投影，不向 OneFrame 类型塞入未经证据确认的原作字段。

“手动输入与判定”M00–M11已完成提交后独立验收，锁定实机版本`jp.co.craftegg.band` 10.1.4（230）及Reverse提交`ce5353fdc54a3ba8188f3dccd4accdc6c2ef4ce2`。V01、D01–D15、MJ01–MJ26全部关闭；manual outer-frame/capability、15-slot finger与16-button owner、ordinary/Slide candidate、Float32窗口、Normal/Flick/Directional/Multiple/Long/Slide、strict timeout、五槽聚合、pause/fault/dispose和cleanup均已通过总入口与全上游回归。任务书见`tmp/simulator-manual-input-judgement-task.md`，验收记录见`tmp/simulator-manual-input-judgement-acceptance.md`。可信geometry backend提供button、ScreenToWorld、scale与Slide raw geometry owner；默认backend继续失败关闭而不伪造lane/world/scale。应用输入adapter与主程序接入仍属后续阶段。

“分数、生命与状态”B00–B12已完成独立隔离验收，记录位于`tmp/simulator-score-life-state-acceptance.md`。冻结包含326方法、25布局、19枚举、ordinary/HABAHIRO `979/731`、12条R1、8个当前ARM64语义簇/48方法、125项portable处置与36个closed BS case；Reverse `44d2f20bf4cf19eb4c91e5b025101ec154f31e60`关闭V01/D01–D24。Production `9726880`恢复Score/Combo/Record、Life/guard/Never Die/Game Over、Skill/active effect/Crescendo、Fever和special-mode领域链；测试`9d382f2`通过Score/Life总入口、production BMS、dependency/evidence index及first-slice/chart/clock/Auto/manual全回归。Continue、active-heal无consumer、缺失profile及未观察fault/dispose/duplicate partial mutation继续在领域mutation前返回`evidence-required`；不导出账号、room、deck/member/card/Skill身份或raw pointer。

“资源与Pixi渲染”阶段RP00–RP14已完成独立验收，任务书见`tmp/simulator-resource-pixi-rendering-task.md`，验收记录见`tmp/simulator-resource-pixi-rendering-acceptance.md`。Reverse `ab5cc366a4a03d24a215e379849824e5ddf5f72f`包含R1–R7；测试只消费 `src/simulator/testing/fixtures/` 中登记的最小快照；final R7为625,192 events、3,480 aggregate frames、51个observed owner和21个setter，21个remaining PR及PR01–PR40 evidence gate全部关闭。Production `37304ec`完成全ordinary Note family、Advanced 42/120、material/threshold、field、完整HUD与engine-clock animation；oracle `b49666d`固定`poppin_shuffle_special` 656 batches/159,832 commands/digest与HAB degraded 371 batches/4,902 commands。PR矩阵为40 closed、0 partial、0 blocked；从独立clean pushed `b49666d`运行14-stage总入口通过，RP13/RP14均通过。

HABAHIRO完整功能专项HR01–HR12已完成；证据/parity说明见`tmp/simulator-habahiro-approximation-task.md`，验收记录见`tmp/simulator-habahiro-approximation-acceptance.md`。Production使用`current-external-complete`，从Bestdori固定allowlist准备并校验11项payload，解析179个source Sprite row，完整消费宽Note、Long/Slide 42/120 mesh、sync/Multiple line、field/judge/mask及engine-clock `flash-start → field change → complete`。运行时不显示“Approximate”标签、不暴露approximation flag，也不产生对应semantic command；HA-D01–HA-D12只保留在文本中。固定全谱oracle为371 batches、6,130 frames、217,595 commands、digest `74d11cf3742de6e955a46ddd0f5d1b5c8e620f74e3e52502a7feae364f3ad8b5`，legacy degraded与ordinary digest保持不变。原始HAB UnityFS、natural HAB R1、Root_effect原clip和original frame仍是文档中的`open-not-claimed` parity边界，不代表功能缺失或运行时降级。

“音频”E00–E07、G00、I00–I05、T00、A00已完成提交后独立验收，任务书见`tmp/simulator-audio-task.md`，验收记录见`tmp/simulator-audio-acceptance.md`。Reverse `50798c00b009cba87a99229024d925b69e9cff98`关闭85行总门（80 closed、5 current-route excluded、0 blocking）；Production恢复typed immutable command、19资源严格prepare、BGM/判定/Hold/Skill/clear/GameOver路由、deterministic offline PCM、Recording和Web Audio backend、outer-frame原子提交、first fault及dispose。C39 ordinary/HABAHIRO为1,277/713 commands；C40为2,408帧、19,264 bytes、SHA-256 `3A5E38BF7DF5C02BF884D493D48732BC36B8EA811340BBDAF2E25D6AA37211E5`。Web Audio只作portable transport，不author engine clock；CRI/browser/OS/hardware波形与延迟等价不作声明，主程序用户手势与资源交付仍属块9。

逐谱BGM会话资源泛化已按Reverse `ffdb4257d6986bcbd7576f77e1703531f880183e`完成独立验收，任务书与记录分别见`tmp/simulator-session-bgm-generalization-task.md`、`tmp/simulator-session-bgm-generalization-acceptance.md`。Production不再含`bgm003`、`sound/bgm003`或旧单曲profile字面量；每个session由host显式提供恰好1项BGM profile/bytes，再与固定18项SE组成`session-external-portable-v1`，并严格校验logicalId、cue、length、SHA-256与decode metadata。BG-C01仅保留为测试回归，BG-C02使用非`bgm003` cue；缺失/重复BGM、SE alias、cue mismatch和integrity/decode错误均在提交前失败关闭。detached pushed `a922671`的独立`bgm653`探针和完整device-closure通过。系统不自动从BMS推导BgmId、不联网、不默认选择或fallback；实际资源交付及stage-9仍由后续宿主负责且当前未授权。

实施块8“实体设备闭环”已按双门制完成提交后独立验收，任务书见`tmp/simulator-device-closure-task.md`，验收记录见`tmp/simulator-device-closure-acceptance.md`。Reverse `9fb544b281d25fe0cefb4b2d6e692bb38df66a81`冻结97行双列closure、32-case command、5-case/17-root simulation、4-case semantic-frame、13行difference、120 systems/100 profiles与7项PNG；Production恢复typed资源/命令、owner route、current xorshift128/Float32确定性模拟、Pixi mapping、particle→audio→render outer-frame事务、terminal lifecycle及whole-engine MoveTime/ReturnTime replay。ordinary全谱为656 batches/7200 frames/1251 commands，digest `9B65E8D022E2407AECABCD09D0EE152B8CE0C27EB85C6BAB68AA46DCC6F71FC6`；HAB按C48通过371 batches共享route并由既有完整resource/Pixi replay覆盖visual表现。detached pushed `6a9df1f`独立probe及全部上游隔离回归通过：portable功能门closed，交付为`current-static-portable-complete`；原作物理/设备exact门诚实保留`open-not-claimed-fixed-device-limit`，不声称real 120/adaptive cadence、GPU/driver framebuffer、visible onset/peak或CRI/Android/speaker output等价。rejected run未重分类，Auto Live预算未消耗。`mainProgramIntegrationAuthorization=false`；按本轮范围，实体闭环完成后停止，不执行主程序接入。

`src/simulator/engine` 不依赖 React、Pixi、Tauri、DOM、编辑器谱面类型或窗口协议。宿主 API 是 GarupaEditor 的可移植边界，不宣称属于原作接口。

在达到需要整体联调的重构节点前，不要求中间提交能够构建、启动或保持既有模拟器行为；外部编辑器入口与接入点仍可能引用尚未重建的模块。

仅在新实现具备完整测试条件时执行整体测试，并以当时明确的新接口和行为作为验收基线。
