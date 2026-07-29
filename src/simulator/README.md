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

OneFrame 容量现在由原作证据固定为 5，不再接受宿主或测试容量配置。公开的 `OneFrameJudgementBatch` 仅包含本阶段闭合的 Auto Live 判定字段，不是原作完整 `OneFrameTotalData`。分数、Power、生命、Skill/Fever、音频、粒子、渲染和 HUD 字段在类型上保持缺席，而不是填零。

当前阶段是“手动输入与判定”，锁定实机版本`jp.co.craftegg.band` 10.1.4（230），任务书位于`tmp/simulator-manual-input-judgement-task.md`。Reverse当前证据提交`ce5353fdc54a3ba8188f3dccd4accdc6c2ef4ce2`已关闭V01、D01–D15与MJ01–MJ26；M00–M02完成，M03生产实现硬门已解除。M03已完成显式manual outer-frame、Float32 raw position和owner-bound opaque button resolution边界。M04已建立整帧dispatch事务、15-slot finger owner、16个GamePlayButton、phase复用、wide containment及ordinary strict candidate scan，但Slide current/near-line仍失败关闭。M05已完成Float32窗口、Normal/Flick/Directional与Single timeout；M06已完成Multiple Directional group owner/type10；M07已完成Long Began/hold/move/release/grace；M08已完成Slide current/near-line、band/cursor、head/intermediate/terminal、invisible/release与MJ18–MJ22测试；同帧多manual聚合留待M10。可信geometry backend提供button、ScreenToWorld和scale owner，默认backend继续失败关闭而不伪造lane/world/scale。局部完成不等于手动输入阶段验收关闭。

`src/simulator/engine` 不依赖 React、Pixi、Tauri、DOM、编辑器谱面类型或窗口协议。宿主 API 是 GarupaEditor 的可移植边界，不宣称属于原作接口。

在达到需要整体联调的重构节点前，不要求中间提交能够构建、启动或保持既有模拟器行为；外部编辑器入口与接入点仍可能引用尚未重建的模块。

仅在新实现具备完整测试条件时执行整体测试，并以当时明确的新接口和行为作为验收基线。
