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

“分数、生命与状态”B00–B12已完成独立隔离验收，记录位于`tmp/simulator-score-life-state-acceptance.md`。冻结包含326方法、25布局、19枚举、ordinary/HABAHIRO `979/731`、12条R1、8个当前ARM64语义簇/48方法、125项portable处置与36个closed BS case；Reverse `44d2f20bf4cf19eb4c91e5b025101ec154f31e60`关闭V01/D01–D24。Production `9726880`恢复Score/Combo/Record、Life/guard/Never Die/Game Over、Skill/active effect/Crescendo、Fever和special-mode领域链；测试`9d382f2`通过Score/Life总入口、production BMS、dependency/evidence index及first-slice/chart/clock/Auto/manual全回归。Continue、active-heal无consumer、缺失profile及未观察fault/dispose/duplicate partial mutation继续在领域mutation前返回`evidence-required`；不导出账号、room、deck/member/card/Skill身份或raw pointer。

当前阶段为“资源与Pixi渲染”，任务书见`tmp/simulator-resource-pixi-rendering-task.md`，验收记录见`tmp/simulator-resource-pixi-rendering-acceptance.md`。Reverse `4b4ebdfada2c2deea7cb9b6d838e61b1e3240876`与Garupa 807项冻结包锁定ordinary R1 87,364 events、geometry R2 87,037 events/636 frames、visible HUD R3 19,888 events/631 frames/22 setters、Note family R4 118,152 events/1,258 aggregate frames/30 owners/6个新增Slide slices、7个1600×720实体frame，以及Long child、projection、resource/HUD/animation profile。R4授权front Flick/Directional icon、observed Slide mesh+line lifecycle和MultipleDirectional connect/back-line；Long-after Flick、Slide Wait runtime、add-Long/add-Slide/after Multiple、advanced/threshold仍false。Production此前已实现local hash/preflight资源、Pixi Sprite、22/60 base NoteMesh、ordinary sync textured quad、Normal与Long+Normal tail完整生命周期、explicit polygon mask、visible Score/Combo/Life、Combo/Life owner-local Float32 animation sampling和可见`Approximate HABAHIRO`标签；R4正向接线进行中，production矩阵在重验前仍为14 closed、14 partial、12 blocked，RP14不通过。原始HAB UnityFS、natural HAB R1与original frame保持`habahiro_exact_parity_gate=open-not-claimed`；禁止把新证据、失败关闭或绿色回归解释为完整阶段/parity，禁止静默fallback、production/test联网与资源二进制入库。

`src/simulator/engine` 不依赖 React、Pixi、Tauri、DOM、编辑器谱面类型或窗口协议。宿主 API 是 GarupaEditor 的可移植边界，不宣称属于原作接口。

在达到需要整体联调的重构节点前，不要求中间提交能够构建、启动或保持既有模拟器行为；外部编辑器入口与接入点仍可能引用尚未重建的模块。

仅在新实现具备完整测试条件时执行整体测试，并以当时明确的新接口和行为作为验收基线。
