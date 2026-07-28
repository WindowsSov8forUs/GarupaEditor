# Auto Live 证据门状态

## 证据门与实现阻断项

Reverse 已冻结的 G01–G22 证据门关闭：

```text
overall_status = confirmed
auto_live_gate = closed
blocking_findings = []
```

G01–G17 保持关闭。第三次审计的 G19/G20 由 Reverse `24706edcb02155fca575c6fde6aa9c7f0fe131ba` 关闭；其中 G18 的 connected-component 解释随后被更完整调用者证据否定。Reverse `57c1e03be474eeb1006ff56c8fc3d5a9a117d573` 新增 focused `activateNoteAndConnectSyncLine` ARM64 并以 G21 修正：只比较 source activation order 中紧邻的 previous/current playable root；其他 playable root 会断开 Multiple run，equal button 也因非相邻而另起 run。G19 terminal fault latch 与 G20 actual observation 要求不变。

第五至第九次实现审计发现的既有required-before-close阻断均已关闭；第十一次独立审计新增三个开放实现阻断：

1. **已关闭：** `SimulatorEngineHost.pause/resume` 现于 idempotent shortcut 前检查 fault；host 级全部非允许 API、只读 snapshot 与 dispose 均有测试。
2. **已关闭：** Reverse `c2dc5c7f37718a170c9e9b93d5a86b42e9d1a2ab` 以 G22 冻结两个 normalized trace 的 frame 1–991/317 Float32 delta bits 与 committed CC08 BMS；生产测试经engine重放并调用`getAdjustedMusicPosition`，不使用expected BPM、private cursor/BPM lookup或删除outer frame。
3. **已关闭：** 公共`SimulatorEngineHost.step`现于`InGameDirector.update`前检查manager fault；AL16与提交后独立复现确认fault后合法delta、NaN、±Infinity与负delta均返回G19锁存失败。无fault时原有非法delta验证不变。

4. **已关闭：** `NoteSlide.forcePerfectPendingAfter` 已按冻结 E15 对 invisible/visible current child统一先调用 adjusted-position owner、检查有限值并执行before返回，到点后才skip/judge。AL10覆盖root/child前一Float32与equal；AL19逐对象覆盖普通89个、HABAHIRO 27个首child为invisible的production Slide root；AL22覆盖non-finite原子失败。完整A10、source/copy/index、Reverse verifier及提交后独立临时产物复现均通过。

5. **已关闭：** `validatePlayMode` 现返回新建冻结的规范化判别联合，`InGameCalculatedData` 再复制冻结且getter不暴露可修改值。AL01覆盖合法Auto创建后Skill→mode14突变仍保持identity Auto与真实crossing、合法manual创建后改Auto仍保持manual，以及owner getter `Reflect.set`拒绝；AL22原有创建时非法值拒绝保持。完整A10、source/copy/index、Reverse verifier及提交后独立临时产物复现均通过。

6. **已关闭：** OneFrame Setup现按root/child owner、phase、family、terminal/after type验证闭合note type、source/after position、playable buttons与Multiple callback count。AL22覆盖未知note type、phase/type错配、position错配、普通count非零、Multiple count为零和空button，全部在GetUsable/slot写入前返回`one-frame.invalid-auto-live-payload`且snapshot零变化。完整A10与提交后独立临时产物复现通过。

7. **已关闭：** manager现拥有adjusted-position生命周期门并公开只读state；host initialize/step/resume/getAdjusted在shortcut、director参数校验或Awake副作用前服从faulted/disposed状态。AL18覆盖dispose-before-initialize后initialize、合法/NaN step、pause、resume、getAdjusted失败，snapshot/幂等dispose允许且backend trace保持空。完整A10与提交后独立临时产物复现通过。

8. **开放，required-before-close：** `OneFrameDataHandle`只有可预测`containerId`；不同controller都会生成`one-frame:0`，Setup按字符串命中自身slot，因此foreign owner handle可被接收且pool发生写入。须改为不可跨owner伪造的capability，并覆盖同ID cross-controller与直接伪造handle。

9. **开放，required-before-close：** Setup对Multiple note type 10只要求callback count为正数，未验证它等于该source对应runtime group owner的`left+right+1`。合法Multiple source配`count=999`会提交。须绑定精确owner/count关系，不得以范围、clamp或生产样本最大值冒充。

10. **开放，required-before-close：** `activateCurrentBatch`按顺序先提交BPM与已验证root，后续坏Long/Slide图失败时不回滚；公共host锁存fault后可观察到`nextBatchIndex=0`但此前root active/BPM owner已变。G19只支持OneFrame第六槽前的native mutation，不支持portable图验证的部分batch activation。须在mutation前完成整批preflight，或先取得已提交Reverse证据锁定原作失败前状态。

G22同时固定adaptive method fixture在一个setup outer frame后于full manager outer-frame index 1判定。GarupaEditor冻结包含`auto-live-actual-replay.json`与逐字节相同的`653_ikuoku_easy.bms.txt`；actual replay与公共fault边界均已完成第六次全量重验收，未被第七次Slide审计推翻。

## 持续非阻断边界

1. 手动输入、普通超时 Miss 和释放判定属于下一阶段。
2. 分数、生命、Skill、Fever、音频、粒子、渲染与 HUD 不在本阶段；不得填零冒充。
3. Unity PlayerLoop 呈现、GPU 和设备输出相位不作声明。
4. HABAHIRO Auto Live 运行仍只有静态生产谱面依据，不宣称已有实体运行样本或百分百保真。
5. Multiple Directional 的真实 touch 阈值仍属于手动输入；AddLong/AddSlide visual helper 的 Sprite/BackLine/连接表现仍后置。

这些边界不能用于扩张Auto Live阶段结论，也不阻断补充证据已确认的托管范围。当前存在上述三个Auto Live required-before-close实现阻断；关闭前不得进入下一阶段，关闭后手动输入仍须建立独立证据门。
