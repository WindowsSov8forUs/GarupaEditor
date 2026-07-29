# 分数、生命与状态证据包

本目录冻结 Reverse 提交 `6c902656c72f3983fb04386038dcfe38f0d53797` 中的 10.1.4 静态重基线。

当前仅关闭 B01/V01 静态门：

- `326` 个方法全部按 managed owner/method/signature 独立映射；
- `25` 个布局、`19` 个枚举无未知项；
- ARM64 TSV 与锁定 ELF 字节一致；
- OneFrame、Score、Life、Skill、Fever 的已确认静态语义记录在冻结 findings 中；
- `business_state_gate=open`，不得实施 B03–B12 production。

B02 仍必须补齐 D18–D24、生产 BMS/master provenance、R1 原始轨迹和 BS01–BS36。不得把本包静态结论冒充运行时 oracle。

验证：

```powershell
node tmp/simulator-reverse-evidence/score-life-state/verify.mjs
node tmp/simulator-reverse-evidence/score-life-state/verify.mjs --index
```

`verify.mjs` 校验 Reverse commit、source/copy/index 三方字节、manifest、冻结 SHA256SUMS、静态 contract/findings/closure 和业务门状态。
