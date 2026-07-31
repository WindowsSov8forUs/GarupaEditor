# 分数、生命与状态证据包

本目录冻结 Reverse 静态/R0及既有R1基线，并向前冻结 ordinary 初始化 `3c95190f4b6326da97e21c8e590f625a7582dc22`、deck aggregate计划/证据 `0bdb5cd59494076d92d3d5d6596608af476fec3e` / `b9b1a6deb334edf921a6f563ec0c270d49f0476f`、music-786计划/证据 `8b5d7dfb1a4b26a686b7e0a9cfcf093cb37e5386` / `287cd8689a6d498fbd45c35b82d16a96c97916c1`、ordinary Auto零tail计划 `6ee113568b2b06abce524beff4a57d83290c9f8d` 与one-note R1/oracle提交 `77fea929e1f99c1051b5211aa28836fd57c45117`，以及匿名Skill effect profile计划/证据 `9e217703c028e2f09be7fa2b30d791b6f7a4a338` / `a3c56662b979e1682340a7a47fa8553a8a95ee67`、演练pause/ReturnTime Retry-2计划/证据 `645375cd3b52a5bca4ff8b1a715e5a663eff6872` / `4bbfaa9bacc6c6db5a5097bcf4e173a532e5cd0d`。完整逐文件commit/hash见`manifest.json`。

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
- deck aggregate R1锁定五元素数组、三分量`0x47617330/0x478A9AE2/0x477B7FCF`、首加`0x47FB547A`与total `0x483C8A31`；成员行继续因隐私边界失败关闭；
- music-786自然UI R1锁定796行列表、五难度与SPECIAL score level 26 fallback，但限时关闭使HABAHIRO runtime initialization继续不可用；
- ordinary Auto零tail R1含5501个连续事件、979个one-note leave、6个Skill lifecycle/5个匿名alias；strict maxima为`541@1→703@82→1136@219`，equal score保留早先对象；Life直接`1000→1200→1500`且player max为1000；
- 第9条R1含5497个连续事件，锁定5个匿名numeric Skill profile、6次trigger/finish、7个ordered active rows、under-Life 600 heal400在Life1000抑制，以及heal300/heal200产生`1000→1300→1500`；不含账号/member/card/skill ID、pointer或display string；
- 第10条R1含6826个连续事件：Practice mode 10在Life0/single-game-over1时仍持续1216次ExecUpdate；pause settled quiet为5016ms/4878ms；rewind长按调用`InGameMoveTimeController.returnTime(5)→NoteManager→CommandNoteManager`并把快照从Life0/GameOver1恢复到Life1000/GameOver0；
- `BS01–BS36` partial oracle已冻结：BS01/BS05/BS06/BS11共4个confirmed，23个case partial，9个case blocked，总计`unknown_fields=127`、`blocking_findings=82`；D19/D24仍未关闭；
- production chart count独立oracle按10.1.4 `NoteManager.analyzeBMS`规则固定ordinary `979`与HABAHIRO `731`，已写入BS01/BS02，移除4个chart unknown并将BS02从blocked推进为partial；
- `R1=10`且`business_state_gate=open`，不得实施B03–B12 production。

B02仍必须补齐D18/D20剩余范围、D19的127个unknown fields与82个blocking findings、D21剩余Skill-Playing pause/fault/dispose/duplicate、D22的score-decrease/Continue/forward-seek/non-Practice ReturnTime、D23剩余HABAHIRO初始化、deck member/nonzero event、未观察guard/Never Die/percentage-heal/special-effect Skill、Fever/special-mode master provenance及D24；不得把六个顺序Skill外推为重叠Skill或Fever。

验证：

```powershell
node tmp/simulator-reverse-evidence/score-life-state/verify.mjs
node tmp/simulator-reverse-evidence/score-life-state/verify.mjs --index
```

`verify.mjs` 校验全部Reverse证据节点、source/copy/index三方字节、manifest、冻结SHA256SUMS、静态contract/findings/closure、BMS/cache record、production chart count `979/731`、十条R1压缩raw trace、deck aggregate、music-786、ordinary Auto Skill/one-note/overheal/effect profile及Practice pause/ReturnTime、计划来源/动作、Retry-only安全边界与reset轨迹、BS01–BS36 partial oracle、观察型capture约束和业务门状态。
