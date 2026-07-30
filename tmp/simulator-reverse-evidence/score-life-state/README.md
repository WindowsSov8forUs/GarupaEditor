# 分数、生命与状态证据包

本目录冻结 Reverse 静态提交 `6c902656c72f3983fb04386038dcfe38f0d53797`、R0输入提交 `1ee976ea1de24cb0567762a74e2d091ae4c78464`、R1子批提交 `72aa279fb07041b04ca649df918fa35ab0490d91`、正判定采集计划提交 `e65f3411d1a91cfa5ecf0d7b29e99605b04e8a41`、提前输入v2计划提交 `3adf31f987830ce5b82aba0d92813b69fda3cec7`、正判定R1提交 `5ce2a7ef325def61986a93053ad85c2f4973f25b`、七lane shell计划提交 `eb7aba5467569b577cd942957dd65bdce600bc9d`、原生控制v2提交 `445ac26856e597fb6c12c708e7a31ecf995d06e1`、active-Skill R1提交 `4ac4ea186efade9091c6f4377ab7ad7dc852a2c5` 与Retry生命周期计划提交 `38cee0b409246323b46099e291331a78a267bcec`。

B01/V01静态门已关闭，B02仅部分推进：

- `326` 个方法全部按 managed owner/method/signature 独立映射；
- `25` 个布局、`19` 个枚举无未知项；
- ARM64 TSV 与锁定 ELF 字节一致；
- OneFrame、Score、Life、Skill、Fever 的已确认静态语义记录在冻结 findings 中；
- ordinary/HABAHIRO production BMS 由连接设备10.1.4 cache直接提取并锁定；
- capture harness的50个地址均匹配静态contract，且只含观察型attach；
- 一条无输入Retry R1冻结1863个连续事件：Life初始化`1000/1000/2000`、11个Miss、210次Reflect与single Game Over `0→1`；
- 该轨迹只部分关闭D18/D22，不能外推其他业务路径；
- v1 220动作计划保留为superseded控制来源且无trace晋升；v2只把输入前等待由7000ms改为500ms并已产生2166事件R1；
- v2实际观察1个Perfect、`addScore` bits `0x44AF8052`、Reflect后Score 1404、Combo 1与10个Miss；5个ABI不安全raw字段明确排除；
- shell多指控制因超出时间界限被aborted，无raw晋升且SELinux已独立恢复；
- 原生v2保持同一50 hooks，以6304字节ARM64 input-event控制器执行固定7 slots/250×80ms计划，已晋升7122事件R1；
- active-Skill R1观察`0→1→2→3→0`、5.0s Skill timer、0.75s finishing、once-heal `800→1100`、Begin前entry冻结1.0并在Playing后Reflect消费、Playing后18个entry冻结1.2/ScoreUpType1、finish后entry恢复1.0；D14/D18及D20单Skill start/end子范围仅部分推进；
- post-Game-Over Retry v3计划完整保留native run，增加12秒Game Over后观察和一次Retry/确认/reset观察；Continue与星石动作禁止，当前pending且不是运行时结论；
- `R1=3`且`business_state_gate=open`，不得实施B03–B12 production。

B02仍必须补齐D18/D20剩余范围、D19、D21、D22剩余、D23剩余deck/start-data/master provenance、D24及BS01–BS36；不得把单Skill轨迹外推为Fever、guard、Never Die、多/重叠Skill或完整生命周期oracle。

验证：

```powershell
node tmp/simulator-reverse-evidence/score-life-state/verify.mjs
node tmp/simulator-reverse-evidence/score-life-state/verify.mjs --index
```

`verify.mjs` 校验十个Reverse commit、source/copy/index三方字节、manifest、冻结SHA256SUMS、静态contract/findings/closure、BMS/cache record、三条R1压缩raw trace、计划来源/动作、Skill生命周期/同帧冻结/once-heal、Retry-only安全边界、观察型capture约束和业务门状态。
