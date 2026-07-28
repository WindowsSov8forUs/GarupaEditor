# Auto Live 证据门状态

## 证据门与实现阻断项

Reverse 已冻结的 G01–G22 证据门关闭：

```text
overall_status = confirmed
auto_live_gate = closed
blocking_findings = []
```

G01–G17 保持关闭。第三次审计的 G19/G20 由 Reverse `24706edcb02155fca575c6fde6aa9c7f0fe131ba` 关闭；其中 G18 的 connected-component 解释随后被更完整调用者证据否定。Reverse `57c1e03be474eeb1006ff56c8fc3d5a9a117d573` 新增 focused `activateNoteAndConnectSyncLine` ARM64 并以 G21 修正：只比较 source activation order 中紧邻的 previous/current playable root；其他 playable root 会断开 Multiple run，equal button 也因非相邻而另起 run。G19 terminal fault latch 与 G20 actual observation 要求不变。

第五至第八次实现审计发现的required-before-close阻断均已关闭；第九次实现审计新增两个开放阻断：

1. **已关闭：** `SimulatorEngineHost.pause/resume` 现于 idempotent shortcut 前检查 fault；host 级全部非允许 API、只读 snapshot 与 dispose 均有测试。
2. **已关闭：** Reverse `c2dc5c7f37718a170c9e9b93d5a86b42e9d1a2ab` 以 G22 冻结两个 normalized trace 的 frame 1–991/317 Float32 delta bits 与 committed CC08 BMS；生产测试经engine重放并调用`getAdjustedMusicPosition`，不使用expected BPM、private cursor/BPM lookup或删除outer frame。
3. **已关闭：** 公共`SimulatorEngineHost.step`现于`InGameDirector.update`前检查manager fault；AL16与提交后独立复现确认fault后合法delta、NaN、±Infinity与负delta均返回G19锁存失败。无fault时原有非法delta验证不变。

4. **已关闭：** `NoteSlide.forcePerfectPendingAfter` 已按冻结 E15 对 invisible/visible current child统一先调用 adjusted-position owner、检查有限值并执行before返回，到点后才skip/judge。AL10覆盖root/child前一Float32与equal；AL19逐对象覆盖普通89个、HABAHIRO 27个首child为invisible的production Slide root；AL22覆盖non-finite原子失败。完整A10、source/copy/index、Reverse verifier及提交后独立临时产物复现均通过。

5. **已关闭：** `validatePlayMode` 现返回新建冻结的规范化判别联合，`InGameCalculatedData` 再复制冻结且getter不暴露可修改值。AL01覆盖合法Auto创建后Skill→mode14突变仍保持identity Auto与真实crossing、合法manual创建后改Auto仍保持manual，以及owner getter `Reflect.set`拒绝；AL22原有创建时非法值拒绝保持。完整A10、source/copy/index、Reverse verifier及提交后独立临时产物复现均通过。

6. **开放，required-before-close：** OneFrame Setup只检查字段为整数/有限值，仍会接受`noteType=999`、任意Multiple callback count及与来源不一致的absolute position并占用slot。该项不要求新增Reverse行为默认值；必须只接受R02/R03已闭合的生产request语义，其他组合在任何写入前返回`evidence-required`，并补AL22原子回归。

7. **开放，required-before-close：** 公共host在disposed后让`resume()`和`getAdjustedMusicPosition()`返回`ok`；创建后直接dispose再initialize还会先执行Awake并记录frame-rate请求。必须在所有shortcut/后端调用前统一检查disposed生命周期，只允许既有snapshot与幂等dispose，并补AL18公共API与backend trace回归。

G22同时固定adaptive method fixture在一个setup outer frame后于full manager outer-frame index 1判定。GarupaEditor冻结包含`auto-live-actual-replay.json`与逐字节相同的`653_ikuoku_easy.bms.txt`；actual replay与公共fault边界均已完成第六次全量重验收，未被第七次Slide审计推翻。

## 持续非阻断边界

1. 手动输入、普通超时 Miss 和释放判定属于下一阶段。
2. 分数、生命、Skill、Fever、音频、粒子、渲染与 HUD 不在本阶段；不得填零冒充。
3. Unity PlayerLoop 呈现、GPU 和设备输出相位不作声明。
4. HABAHIRO Auto Live 运行仍只有静态生产谱面依据，不宣称已有实体运行样本或百分百保真。
5. Multiple Directional 的真实 touch 阈值仍属于手动输入；AddLong/AddSlide visual helper 的 Sprite/BackLine/连接表现仍后置。

这些边界不能用于扩张Auto Live阶段结论，也不阻断补充证据已确认的托管范围。当前存在上述两个Auto Live required-before-close实现阻断；关闭前不得进入下一阶段，关闭后手动输入仍须建立独立证据门。
