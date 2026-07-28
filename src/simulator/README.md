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

Auto Live A00–A10已完成第十次最终独立重验收。除G19公共fault、G21 topology、G22 exact/adaptive replay、Slide E15 position gate和模式所有权外，OneFrame闭合payload语义与disposed公共生命周期也已关闭：非法note type/phase/count/position/button零写入，disposed后非允许API在任何shortcut或后端副作用前失败关闭。完整隔离回归、Reverse verifier、证据index、独立topology和提交后临时产物复现全部通过，验收见`tmp/simulator-auto-live-acceptance.md`。

OneFrame 容量现在由原作证据固定为 5，不再接受宿主或测试容量配置。公开的 `OneFrameJudgementBatch` 仅包含本阶段闭合的 Auto Live 判定字段，不是原作完整 `OneFrameTotalData`。分数、Power、生命、Skill/Fever、音频、粒子、渲染和 HUD 字段在类型上保持缺席，而不是填零。

下一阶段是“手动输入与判定”，但开始生产实现前必须先建立并关闭独立Reverse证据硬门。真实触摸、Multiple Directional距离阈值、手指所有权、判定窗口、普通timeout Miss、释放和Hold行为继续`evidence-required`；BackLine/Sprite/音频/粒子仍后置。

`src/simulator/engine` 不依赖 React、Pixi、Tauri、DOM、编辑器谱面类型或窗口协议。宿主 API 是 GarupaEditor 的可移植边界，不宣称属于原作接口。

在达到需要整体联调的重构节点前，不要求中间提交能够构建、启动或保持既有模拟器行为；外部编辑器入口与接入点仍可能引用尚未重建的模块。

仅在新实现具备完整测试条件时执行整体测试，并以当时明确的新接口和行为作为验收基线。
