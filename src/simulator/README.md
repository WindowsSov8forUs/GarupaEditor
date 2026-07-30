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

## 分支状态

第一切片 T01–T11 已完成隔离验收：原作管理器对象图、音符四态、夹具驱动的分族对象池、活跃列表回调、确定性子步顺序、暂停续跑门、OneFrame 容器所有权、统一 Reflect、记录后端和测试快照均已落地。验收记录位于 `tmp/simulator-first-slice-acceptance.md`。

可见渲染、实际音频、真实输入、完整判定和主程序入口仍未实现；第一切片完成不表示模拟器或 GarupaEditor 整体可运行。

谱面构造阶段与时钟调度阶段现已完成隔离验收。生产宿主直接接收已登记的 `ChartConstructionResult`；60/120 请求、双 Float32 时钟、0.8 秒 launcher lead、CC03/CC08 专用生命周期、判定 offset、自适应 `counter[1]/[2]/[3]` 的 `101/21/6` 回退、BPM-before-Note、实时反序 Update、survivor AfterUpdate 和暂停冻结均已按最终 Reverse 证据恢复。

时钟与调度验收记录位于 `tmp/simulator-clock-scheduling-acceptance.md`。S01–S10 已完成。

Auto Live A00–A10已完成第十四次提交后独立逐项重验收。验收排除Reverse脏工作树，以纯`c2dc5c7f` clone和SHA-256锁定原始样本运行两套verifier；完整A10、证据index、独立topology及新组合探针通过。root/source/receiver/父ownership、Slide child角色、失败重绑、有限clock结果与G19 fault跨dispose边界均已关闭，见`tmp/simulator-auto-live-acceptance.md`。

OneFrame 容量现在由原作证据固定为 5，不再接受宿主或测试容量配置。公开的 `OneFrameJudgementBatch` 仅包含已闭合的 Auto Live/手动判定字段，不是原作完整 `OneFrameTotalData`。分数、Power、生命、Skill/Fever、音频、粒子、渲染和 HUD 字段在类型上保持缺席，而不是填零。

“手动输入与判定”M00–M11已完成提交后独立验收，锁定实机版本`jp.co.craftegg.band` 10.1.4（230）及Reverse提交`ce5353fdc54a3ba8188f3dccd4accdc6c2ef4ce2`。V01、D01–D15、MJ01–MJ26全部关闭；manual outer-frame/capability、15-slot finger与16-button owner、ordinary/Slide candidate、Float32窗口、Normal/Flick/Directional/Multiple/Long/Slide、strict timeout、五槽聚合、pause/fault/dispose和cleanup均已通过总入口与全上游回归。任务书见`tmp/simulator-manual-input-judgement-task.md`，验收记录见`tmp/simulator-manual-input-judgement-acceptance.md`。可信geometry backend提供button、ScreenToWorld、scale与Slide raw geometry owner；默认backend继续失败关闭而不伪造lane/world/scale。应用输入adapter与主程序接入仍属后续阶段。

当前阶段进入“分数、生命与状态”B00–B12，任务书位于`tmp/simulator-score-life-state-task.md`。B00已完成；B01已由Reverse `6c902656c72f3983fb04386038dcfe38f0d53797`关闭10.1.4静态重基线（326方法、25布局、19枚举），冻结包位于`tmp/simulator-reverse-evidence/score-life-state/`。Reverse `1ee976ea1de24cb0567762a74e2d091ae4c78464`已锁定ordinary/HABAHIRO production BMS及R0 cache provenance；`72aa279fb07041b04ca649df918fa35ab0490d91`锁定1863事件无输入R1，部分关闭D18/D22的Life初始化、11个Miss与single Game Over；`5ce2a7ef325def61986a93053ad85c2f4973f25b`锁定2166事件正判定R1的1个Perfect、Score 1404与Combo/计数；shell七lane控制因超时aborted且无raw晋升，`445ac26856e597fb6c12c708e7a31ecf995d06e1`固定6304字节ARM64 input-event控制器与native v2计划，`4ac4ea186efade9091c6f4377ab7ad7dc852a2c5`据此锁定7122事件active-Skill R1：`0→1→2→3→0`、5.0s/0.75s timer、once-heal `800→1100`及单Skill start/end的entry冻结1.0→1.2→1.0。该轨迹仅部分推进D14/D18/D20，不外推Fever、guard、Never Die或多个/重叠Skill。`38cee0b409246323b46099e291331a78a267bcec`冻结Retry-only的post-Game-Over v3计划，`4f0ce1a02a83747db617695cde69ad47ac8ae78f`锁定6375事件R1：Game Over后11.875秒无已hook业务调用，Retry复用InGameRecord并重置Game Over、Score、Life、Combo与计数；Continue与星石动作仍禁止且未观察。该轨迹仅部分推进D22。`business_state_gate`仍为open：D18/D20/D22剩余范围、D19、D21、D23剩余deck/start-data/master rows、D24及BS01–BS36仍为`required-before-code`；B02关闭前禁止实施B03–B12。当前业务字段继续失败关闭，不以0、1、clamp或identity补齐。

`src/simulator/engine` 不依赖 React、Pixi、Tauri、DOM、编辑器谱面类型或窗口协议。宿主 API 是 GarupaEditor 的可移植边界，不宣称属于原作接口。

在达到需要整体联调的重构节点前，不要求中间提交能够构建、启动或保持既有模拟器行为；外部编辑器入口与接入点仍可能引用尚未重建的模块。

仅在新实现具备完整测试条件时执行整体测试，并以当时明确的新接口和行为作为验收基线。
