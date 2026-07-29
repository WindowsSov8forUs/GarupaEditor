# 分数、生命与状态证据包

本目录冻结 Reverse 静态提交 `6c902656c72f3983fb04386038dcfe38f0d53797`、R0输入提交 `1ee976ea1de24cb0567762a74e2d091ae4c78464`、R1子批提交 `72aa279fb07041b04ca649df918fa35ab0490d91`、正判定采集计划提交 `e65f3411d1a91cfa5ecf0d7b29e99605b04e8a41`、提前输入v2计划提交 `3adf31f987830ce5b82aba0d92813b69fda3cec7`、正判定R1提交 `5ce2a7ef325def61986a93053ad85c2f4973f25b` 与七lane多指计划提交 `eb7aba5467569b577cd942957dd65bdce600bc9d`。

B01/V01静态门已关闭，B02仅部分推进：

- `326` 个方法全部按 managed owner/method/signature 独立映射；
- `25` 个布局、`19` 个枚举无未知项；
- ARM64 TSV 与锁定 ELF 字节一致；
- OneFrame、Score、Life、Skill、Fever 的已确认静态语义记录在冻结 findings 中；
- ordinary/HABAHIRO production BMS 由连接设备10.1.4 cache直接提取并锁定；
- capture harness的50个地址均匹配静态contract，且只含观察型attach；
- 一条无输入Retry R1冻结1863个连续事件：Life初始化`1000/1000/2000`、11个Miss、210次Reflect与single Game Over `0→1`；
- 该轨迹只部分关闭D18/D22，`R1=1`但`business_state_gate=open`，不得实施B03–B12 production；
- v1 220动作计划保留为superseded控制来源且无trace晋升；v2只把输入前等待由7000ms改为500ms并已产生2166事件R1；
- v2实际观察1个Perfect、`addScore` bits `0x44AF8052`、Reflect后Score 1404、Combo 1与10个Miss，但active Skill始终缺席；5个ABI不安全raw字段明确排除；
- 独立多指采集器保持同一50 hooks，以已提交R17 Linux MT协议执行7 slots、250×80ms控制，并强制恢复SELinux；计划当前为pending，尚无trace。

B02仍必须补齐D18/D22剩余范围、D19–D21、D23剩余deck/start-data/master provenance、D24及BS01–BS36；不得把单条无输入轨迹外推为Skill/Fever/heal/guard/Never Die或完整生命周期oracle。

验证：

```powershell
node tmp/simulator-reverse-evidence/score-life-state/verify.mjs
node tmp/simulator-reverse-evidence/score-life-state/verify.mjs --index
```

`verify.mjs` 校验七个Reverse commit、source/copy/index三方字节、manifest、冻结SHA256SUMS、静态contract/findings/closure、BMS/cache record、R1压缩raw trace、正判定计划来源/动作、观察型capture约束和业务门状态。
