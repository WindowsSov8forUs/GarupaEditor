# 分数、生命与状态证据包

本目录冻结 Reverse 静态提交 `6c902656c72f3983fb04386038dcfe38f0d53797`、R0输入提交 `1ee976ea1de24cb0567762a74e2d091ae4c78464`、R1子批提交 `72aa279fb07041b04ca649df918fa35ab0490d91`、正判定采集计划提交 `e65f3411d1a91cfa5ecf0d7b29e99605b04e8a41`、提前输入v2计划提交 `3adf31f987830ce5b82aba0d92813b69fda3cec7`、正判定R1提交 `5ce2a7ef325def61986a93053ad85c2f4973f25b`、七lane shell计划提交 `eb7aba5467569b577cd942957dd65bdce600bc9d`、原生控制v2提交 `445ac26856e597fb6c12c708e7a31ecf995d06e1`、active-Skill R1提交 `4ac4ea186efade9091c6f4377ab7ad7dc852a2c5`、Retry生命周期计划提交 `38cee0b409246323b46099e291331a78a267bcec`、Retry生命周期R1提交 `4f0ce1a02a83747db617695cde69ad47ac8ae78f`、fixed-event partial oracle提交 `659292c85e474e89d817c46c6cdd830ba7de07f5`、production chart count提交 `25c053326d9b2eb3f3c6f13d8f02206b78b42074`、哈希格式关闭提交 `c7dbaba81699adec896796167074cb85cdc94e2e`、fixed-event计数整合提交 `f9f15b446f2c7f5b24f5f2ba380b543419383df1`、初始化profile计划提交 `a032f8fe82d045b6d3b5c8853cb923803e0c5435`、ordinary初始化R1提交 `3c95190f4b6326da97e21c8e590f625a7582dc22` 与fixed-event重建提交 `9eb9ac0ff97e191908099a53ce505cef057d26e4`。

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
- post-Game-Over Retry v3完整保留native run，增加12秒Game Over后观察和一次Retry/确认/reset观察；Continue与星石动作禁止；
- v3实际观察Game Over后11.875秒无已hook业务调用，Retry复用同一InGameRecord并把Game Over `1→0`、Score `44403→0`、Life `0→1000`、max Combo `6→0`及计数清零，再以max Note 540进入InitBaseScore；
- privacy-minimized ordinary初始化R1冻结11个连续事件：`poppin_shuffle_special` SPECIAL Lv.27、Life `1000/1000/2000`、Miss/Bad `-100/-50`、total/rate/base bits `0x483C8A31/0x3F9C28F6/0x4434718E`，账号、房间与deck element内容均不进入证据；
- `BS01–BS36` partial oracle已冻结：BS05/BS06/BS11为静态confirmed，20个case为partial，13个case blocked；BS01的5个初始化unknown已清零但保留deck-row blocker，总计`unknown_fields=146`、`blocking_findings=89`；D19/D24仍未关闭；
- production chart count独立oracle按10.1.4 `NoteManager.analyzeBMS`规则固定ordinary `979`与HABAHIRO `731`，已写入BS01/BS02，移除4个chart unknown并将BS02从blocked推进为partial；
- `R1=5`且`business_state_gate=open`，不得实施B03–B12 production。

B02仍必须补齐D18/D20剩余范围、D19的146个unknown fields与89个blocking findings、D21、D22的score-decrease/Continue/seek/ReturnTime、D23剩余HABAHIRO初始化、deck member/nonzero event/Skill/Fever/special-mode master provenance及D24；不得把单Skill或Retry轨迹外推为Fever、guard、Never Die、多/重叠Skill或完整生命周期oracle。

验证：

```powershell
node tmp/simulator-reverse-evidence/score-life-state/verify.mjs
node tmp/simulator-reverse-evidence/score-life-state/verify.mjs --index
```

`verify.mjs` 校验十五个Reverse证据节点、source/copy/index三方字节、manifest、冻结SHA256SUMS、静态contract/findings/closure、BMS/cache record、production chart count `979/731`、五条R1压缩raw trace、计划来源/动作、Skill生命周期/同帧冻结/once-heal、Retry-only安全边界与reset轨迹、BS01–BS36 partial oracle、观察型capture约束和业务门状态。
