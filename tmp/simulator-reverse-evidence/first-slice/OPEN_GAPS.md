# 第一切片证据缺口

本文件记录影响第一切片严格复原的开放边界，并保留已经闭合缺口的证据路由。开放项不得由实现默认值、旧模拟器行为或常见音游做法替代。

## 已闭合

### G01：音乐位置刻度与音符组激活窗口

- 状态：`closed`
- 原作字段：`NoteManager.MUSIC_BAR_DIVISION_COUNT`
- 确认值：`192`
- 已恢复：主时钟与发射器时钟推进、单次跨小节处理、批次整数绝对位置、当前位置开区间与发射器位置闭区间激活。
- 来源：E14、E15、E16。
- 未用于行为的剩余说明：阈值设计动机不影响执行语义。

### G06：自适应子步历史计数器

- 状态：`closed`
- 已恢复：BPM 变化计数门、四个持久 `uint` 计数器、递增后判定、`101/21/6` 次回退边界、第四计数器只记录不直接回退，以及 `deltaTime`/`ExecuteFrame` 同步平分。
- 来源：E14、E15、E16。
- 未用于行为的剩余说明：非对称阈值的设计原因未出现在托管元数据中。

### G02：相同位置成员的上游构造顺序

- 状态：`closed`
- 已恢复：BMS 按文本行序解析；按钮组按首次出现顺序追加；组内材料按 `absolutePos` 二分插入；相同按钮同位置合并而不创建第二成员。
- 第一切片边界：直接消费预构造 `informationList` 的最终顺序，不实现 BMS 工厂，不增加 `sourceOrder`，不执行 lane、button、位置或类型排序。
- 来源：E17、E18、E19、E20。

### G03：跨 Note 低索引移除实例

- 状态：`closed-scoped-negative`
- 已恢复：反向遍历使用固定递减索引，自移除立即作用于实时列表，After 列表保持追加时内容，下一子步重新读取 Count。
- 第一切片边界：已表示 Update 调用图不存在移除另一个低索引活跃 Note 的确认调用者；禁止为测试制造该入口。
- 后续边界：判定/输入切片若引入多方向侧链消费，必须同时冻结真实调用者和发生相位。
- 来源：E07、E17、E18、E20、E21。

## 第一切片已闭合缺口

第一切片当前没有仍处于 `evidence-required` 的 G01–G06 缺口。以下 G04/G05 已按第一切片实际对象图闭合；列出的外部时序与 UI 行为仍属于后续切片，不得反向扩张为第一切片实现。

### G04：Unity PlayerLoop 精确相位

- 状态：`closed-scoped`
- 已恢复：`Update.ScriptRunBehaviourUpdate -> InGameDirector.Update -> InGameManager.ExecUpdate -> updatePlayState -> NoteManager.ExecUpdate` 的原作引擎入口链。
- 已确认：`Update.ScriptRunBehaviourUpdate` 是 Update 阶段第 1/4 个原生子节点；已发现的三个直接 `SetPlayerLoop` 写入者均保留相关原生兄弟顺序。
- 第一切片边界：恢复 `InGameDirector.Update` 对 `InGameManager.ExecUpdate` 的所有权；宿主 `step` 只提供可移植帧触发，不冒充 Unity API。
- 后续边界：无对象依赖的其他 MonoBehaviour 回调相对顺序，以及渲染线程、GPU、显示与采集时钟不进入第一切片。
- 来源：E22–E25；E03、E05、E07 用于下游调度。

### G05：暂停状态的精确更新门条件

- 状态：`closed`
- 已恢复：`GameState.PlayingNone = 4`、`PlayingSound = 5`、`PauseNone = 6`、`PauseSound = 7`，以及 `CE.PauseState.None = 0`、`Pause = 1`、`Resume = 2`。
- 已恢复：`isPaused` 对 PauseState 1/2 与 GameState 6/7 的精确公式；只有 GameState 4/5 进入 `updatePlayState`，GameState 7 只保留 `InputManager.ExecInput` 边界而不进入 `NoteManager.ExecUpdate`。
- 第一切片边界：可移植 `pause/resume` 直接映射到证据确认的稳态 `PauseSound/PlayingSound`，不伪造暂停 UI 与倒计时回调。
- 后续边界：暂停面板动画、恢复倒计时、接口槽真实名称和具体音频设备行为继续留在后续切片。
- 来源：E09、E22–E25。
