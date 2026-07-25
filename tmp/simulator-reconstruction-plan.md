# 模拟器重构整体计划

## 总体原则

- 运行实现维持 GarupaEditor 当前 TypeScript、React、Vite、Pixi 技术栈方向。
- `GirlsBandParty-Reverse` 是唯一行为依据；旧模拟器代码不得作为参考或迁移来源。
- “一比一复原”限定为：复原逆向证据已确认的原作对象边界、职责、依赖关系、状态机和调度顺序。
- 未确认的 Unity PlayerLoop、GPU、CRIWARE 或运行时细节必须显式留空，不能以近似实现冒充原作行为。
- 不修改 `App.tsx`、编辑器控制器、窗口路由或启动载荷；主程序未来根据模拟器公开的需求重新设计入口。

## 第一切片：原作引擎框架

### 临时证据包

在 `HOST________\VSCode\GarupaEditor\tmp\simulator-reverse-evidence` 建立暂时受版本控制的证据区，包含：

- `manifest.json`：逆向仓库提交、源文件路径、SHA-256、确认状态和目标模块。
- `artifacts/`：只复制当前切片必要的最小 JSON、TSV、调查结论与反编译片段。
- `fixtures/`：对象图、生命周期调用序列、状态快照和事件轨迹。
- `OPEN_GAPS.md`：记录缺少的静态或实体设备证据以及所需采集目标。

运行时代码不得读取该目录；它只服务于实现审计和测试。

### 框架结构

在 `src/simulator` 建立三个严格分离的层次：

- `host/`：GarupaEditor 未来可调用的可移植宿主边界，不宣称属于原作结构。
- `engine/`：按证据恢复的原作管理器、实体、状态和生命周期。
- `backends/`：Pixi、Web Audio、资源加载和输入适配接口；第一切片只提供记录型空后端。

首批恢复的原作框架边界：

- `InGameManager`：组合并持有游戏运行期管理器。
- `InGameMusicScoreController`：音乐位置、BPM 与暂停状态。
- `NoteManager`、`SlideNoteManager`：音符构造、激活列表、对象池和分阶段更新。
- `InputManager`、`GamePlayButton`：输入分发边界，不实现入口层事件转换。
- `InGameOneFrameJudgementController`：`OneFrameData` 收集与统一反映边界。
- `NoteBase` 及 Long、Slide、Flick、After、Multiple Directional 等已确认派生实体。
- 渲染、音频、HUD 和资源管理仅建立原作职责对应的端口，不提前实现表现。

只暴露一个宿主 API：

- `createSimulatorEngine(input, backends)`：构造完整引擎对象图。
- `initialize()`：依证据执行初始化阶段。
- `step(deltaTime)`：驱动一次确定性更新。
- `pause()` / `resume()`：控制已确认的暂停边界。
- `snapshot()`：输出测试用状态与调用轨迹。
- `dispose()`：释放模拟器拥有的资源。

宿主 API 是项目适配层；原作管理器内部不得依赖编辑器谱面类型、React、Tauri 或现有窗口协议。

### 第一切片验收

- 能用预构造的 `NoteBatchInformationList` 证据夹具建立完整管理器和音符对象图。
- 初始化、Update、AfterUpdate、暂停和销毁调用顺序与证据夹具一致。
- 活跃音符列表、对象池、OneFrameData 容器和后端端口具备正确所有权。
- 尚未恢复的行为返回明确的 `evidence-required` 状态，不提供默认猜测。
- 不要求绘制画面、播放音频、接受真实输入或接入主程序。
- 不要求 GarupaEditor 整体构建通过，只运行模拟器隔离类型检查和框架测试。

## 后续实施块

### 1. 谱面构造

- 恢复 `NoteBatchInformationListFactory`、BMS 文本转换、Bezier/HABAHIRO、同步线和终端节点构造。
- 以生产谱面 oracle 验证对象数量、顺序、连接关系和命令节点。

### 2. 时钟与调度

- 恢复音乐位置、BPM 切换、60/120 FPS、适应性子步、反向活跃列表 Update 和 AfterUpdate。
- PlayerLoop 精确相位未闭合前，只复原已确认的托管层顺序。

### 3. Auto Live

- 恢复 Force Perfect、Long/Slide 分阶段完成、Flick 路由和 OneFrameData 聚合。
- 以 Python 原型生成的固定事件轨迹作为离线 oracle，不引入 Python 运行依赖。

### 4. 手动输入与判定

- 恢复触点仲裁、手指所有权、判定窗口、移动阈值、长滑尾判、超时 Miss 和方向 Flick。
- 每个未闭合输入分支先进入实体设备采证任务。

### 5. 分数、生命与状态

- 恢复 Combo、基础分、修正率、技能、Fever、伤害和 Never Die 等已确认链路。
- 主数据缺失时要求调用者显式提供，不填入推测值。

### 6. 资源与 Pixi 渲染

- 按证据恢复 NoteImageController、网格、Sprite、同步线、遮罩、对象池和 HUD 消费链。
- Pixi 只作为原作渲染职责的后端实现；不得改变引擎领域模型来迎合 Pixi。

### 7. 音频

- 恢复 BGM、判定音、Hold 音效、暂停恢复、音量与 Fade 路由。
- Web Audio 是可移植后端；CRI 原生延迟与混音未知部分保持独立边界。

### 8. 实体设备闭环

- 对静态证据无法确定的更新帧、对象身份、动画状态、随机流和音画时序建立逐项采集任务。
- 每次采集先回填 `GirlsBandParty-Reverse`，再刷新临时证据包并实现对应模块。

### 9. 主程序接入

- 仅在模拟器输入、资源和生命周期需求稳定后，由主程序设计新的进入方式。
- 此阶段才处理编辑器谱面适配、窗口通信、移动端路由和 UI 入口。

## 测试与提交策略

- 增加仅面向模拟器的 TypeScript 测试配置；可采用 Vitest，不改变生产技术栈。
- 每个块至少覆盖证据清单校验、确定性轨迹、状态快照、失败关闭和未知行为拒绝。
- 每个测试必须指向临时证据包中的具体来源和哈希。
- 分块采用语义化中文提交，不混合证据整理、核心状态机、后端表现和主程序接入。
- 日常只运行当前块的隔离测试；到明确联调节点再运行 GarupaEditor 整体构建和完整模拟器回归。
