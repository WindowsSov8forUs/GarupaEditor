# Auto Live 证据门状态

## 证据门与实现阻断项

Reverse 已冻结的 G01–G21 证据门本身仍关闭：

```text
overall_status = confirmed
auto_live_gate = closed
blocking_findings = []
```

G01–G17 保持关闭。第三次审计的 G19/G20 由 Reverse `24706edcb02155fca575c6fde6aa9c7f0fe131ba` 关闭；其中 G18 的 connected-component 解释随后被更完整调用者证据否定。Reverse `57c1e03be474eeb1006ff56c8fc3d5a9a117d573` 新增 focused `activateNoteAndConnectSyncLine` ARM64 并以 G21 修正：只比较 source activation order 中紧邻的 previous/current playable root；其他 playable root 会断开 Multiple run，equal button 也因非相邻而另起 run。G19 terminal fault latch 与 G20 actual observation 要求不变。

第五次实现审计发现两个 required-before-close 阻断；第 1 项已由 GarupaEditor 生产修复关闭，第 2 项所需证据现由 G22 关闭，生产消费与重验收仍待完成：

1. **已关闭：** `SimulatorEngineHost.pause/resume` 现于 idempotent shortcut 前检查 fault；host 级全部非允许 API、只读 snapshot 与 dispose 均有测试。
2. **证据已关闭、实现已消费、待阶段重验收：** Reverse `c2dc5c7f37718a170c9e9b93d5a86b42e9d1a2ab` 以 G22 冻结两个 normalized trace 的 frame 1–991/317 Float32 delta bits 与 committed CC08 BMS；生产测试现经 engine重放并调用 `getAdjustedMusicPosition`，不再使用 expected BPM、private cursor/BPM lookup或删除 outer frame。

G22 同时固定 adaptive method fixture在一个 setup outer frame后于 full manager outer-frame index 1 判定。GarupaEditor冻结包含 `auto-live-actual-replay.json` 与逐字节相同的 `653_ikuoku_easy.bms.txt`；A10代码门已解除，但 actual replay测试通过前阶段仍不能关闭。

## 持续非阻断边界

1. 手动输入、普通超时 Miss 和释放判定属于下一阶段。
2. 分数、生命、Skill、Fever、音频、粒子、渲染与 HUD 不在本阶段；不得填零冒充。
3. Unity PlayerLoop 呈现、GPU 和设备输出相位不作声明。
4. HABAHIRO Auto Live 运行仍只有静态生产谱面依据，不宣称已有实体运行样本或百分百保真。
5. Multiple Directional 的真实 touch 阈值仍属于手动输入；AddLong/AddSlide visual helper 的 Sprite/BackLine/连接表现仍后置。

这些边界不能用于扩张 Auto Live 阶段结论，也不阻断补充证据已确认的托管范围。生产实现仍须直接消费补充 fixed trace 后才能重新验收。
