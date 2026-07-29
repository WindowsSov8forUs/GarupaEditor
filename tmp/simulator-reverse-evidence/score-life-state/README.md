# 分数、生命与状态证据包

本目录冻结 Reverse 静态提交 `6c902656c72f3983fb04386038dcfe38f0d53797` 与R0输入提交 `1ee976ea1de24cb0567762a74e2d091ae4c78464`。

当前仅关闭 B01/V01 静态门：

- `326` 个方法全部按 managed owner/method/signature 独立映射；
- `25` 个布局、`19` 个枚举无未知项；
- ARM64 TSV 与锁定 ELF 字节一致；
- OneFrame、Score、Life、Skill、Fever 的已确认静态语义记录在冻结 findings 中；
- ordinary/HABAHIRO production BMS 由连接设备10.1.4 cache直接提取并锁定；
- capture harness的50个地址均匹配静态contract，且只含观察型attach；
- `R1=0`、`business_state_gate=open`，不得实施 B03–B12 production。

B02 仍必须补齐 D18–D24中的R1、deck/start-data/master provenance及BS01–BS36。D23仅关闭BMS子范围；不得把本包静态/R0结论冒充运行时 oracle。

验证：

```powershell
node tmp/simulator-reverse-evidence/score-life-state/verify.mjs
node tmp/simulator-reverse-evidence/score-life-state/verify.mjs --index
```

`verify.mjs` 校验两个Reverse commit、source/copy/index三方字节、manifest、冻结SHA256SUMS、静态contract/findings/closure、BMS/cache record、观察型capture约束和业务门状态。
