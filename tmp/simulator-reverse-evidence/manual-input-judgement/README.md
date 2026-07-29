# 手动输入与判定冻结证据包

本目录冻结Reverse最终证据提交`1432b7def25faafee4cc713423305d2c1fb7def4`：

- 10.1.4/230的117个独立ARM64方法、14个owner type、13个enum；
- 闭合`NoteSingleBase` timeout/forcePerfect与完整`NoteFlickBase` Began/Wait/空Ended/合成move所有权；
- 修正后的Slide Wait/over-Wait与Slide十组lane-band构造；
- Easy/Hard/Expert song 653 `幾億光年`的5条正式R1 raw trace；
- Long实体head/release、Long双timeout、Slide root/after timeout及两指0/1全phase；
- Float32 exact边界、portable输入契约和MJ01–MJ26固定事件oracle；
- 两个Reverse离线verifier及完整SHA256SUMS。

V01与D01–D15均已关闭，Reverse `manual_input_gate=closed`且
`blocking_findings=[]`。这只解除后续M03生产实现硬门，不表示GarupaEditor已经实现或验收
手动输入；生产、测试和独立验收仍必须分批。

运行时代码不得读取本目录。模拟器TypeScript生产与测试不得执行其中Python、访问Reverse工作树
或联网；Python仅是已冻结的Reverse离线生成/校验源。Garupa `verify.mjs`不调用Python。

验证：

```powershell
node tmp/simulator-reverse-evidence/manual-input-judgement/verify.mjs
node tmp/simulator-reverse-evidence/manual-input-judgement/verify.mjs --index
```
