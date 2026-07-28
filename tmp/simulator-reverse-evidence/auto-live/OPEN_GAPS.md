# Auto Live 证据门状态

## 证据门与实现阻断项

Reverse 已冻结的 G01–G21 证据门本身仍关闭：

```text
overall_status = confirmed
auto_live_gate = closed
blocking_findings = []
```

G01–G17 保持关闭。第三次审计的 G19/G20 由 Reverse `24706edcb02155fca575c6fde6aa9c7f0fe131ba` 关闭；其中 G18 的 connected-component 解释随后被更完整调用者证据否定。Reverse `57c1e03be474eeb1006ff56c8fc3d5a9a117d573` 新增 focused `activateNoteAndConnectSyncLine` ARM64 并以 G21 修正：只比较 source activation order 中紧邻的 previous/current playable root；其他 playable root 会断开 Multiple run，equal button 也因非相邻而另起 run。G19 terminal fault latch 与 G20 actual observation 要求不变。

第五次实现审计发现两个 required-before-close 阻断；其中第 1 项现已由 GarupaEditor 生产修复关闭，第 2 项仍开放：

1. **已关闭：** `SimulatorEngineHost.pause/resume` 现于 idempotent shortcut 前检查 fault；host 级全部非允许 API、只读 snapshot 与 dispose 均有测试。
2. G20 要求 exact B±5/0 由 `InGameMusicScoreController.getAdjustedMusicPosition` 实际执行并观察 entry cursor/per-step BPM/result bits；当前测试仍输入 expected `step_bpms` 或手工调用 private lookup + advance/rewind。committed pass2已冻结 entry cursor与输出步骤，但尚未证明有可让 production controller到达该 cursor 的确定性重放输入。

若第 2 项不能仅由现有已提交输入闭合，则新增 G22（`required-before-code`）：冻结 exact controller replay输入及 adaptive outer-frame identity；Reverse提交并冻结前不得用 production test hook、private字段写入或 expected BPM冒充 actual owner trace。

## 持续非阻断边界

1. 手动输入、普通超时 Miss 和释放判定属于下一阶段。
2. 分数、生命、Skill、Fever、音频、粒子、渲染与 HUD 不在本阶段；不得填零冒充。
3. Unity PlayerLoop 呈现、GPU 和设备输出相位不作声明。
4. HABAHIRO Auto Live 运行仍只有静态生产谱面依据，不宣称已有实体运行样本或百分百保真。
5. Multiple Directional 的真实 touch 阈值仍属于手动输入；AddLong/AddSlide visual helper 的 Sprite/BackLine/连接表现仍后置。

这些边界不能用于扩张 Auto Live 阶段结论，也不阻断补充证据已确认的托管范围。生产实现仍须直接消费补充 fixed trace 后才能重新验收。
