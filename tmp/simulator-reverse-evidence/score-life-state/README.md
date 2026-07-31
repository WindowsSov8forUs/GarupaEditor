# 分数、生命与状态证据包

本目录冻结 `jp.co.craftegg.band` 10.1.4（code 230，`arm64-v8a`）分数、生命、Skill、Fever与special-mode阶段的静态、production输入、R1、fixed-event和portable contract证据。最终Reverse闭合提交为`44d2f20bf4cf19eb4c91e5b025101ec154f31e60`；逐文件commit、字节数和SHA-256见`manifest.json`。

## 闭合结果

- 静态基线：326方法、25布局、19枚举、326个独立ARM64 TSV。
- Production输入：ordinary/HABAHIRO BMS及设备cache provenance；maxNoteCount固定`979/731`。
- R1：12条confirmed observation-only轨迹，覆盖Life/Game Over、正判定Score、Skill四态/once effect/active rows、one-note maxima/overheal、pause/ReturnTime、Skill-Playing pause和Playing Retry manager reset。
- 当前ARM64迁移：8个语义簇、48个当前方法；10.1.3文件仅作为哈希锁定的阅读指南，结论由10.1.4 target slice承载。
- Portable contract：125个原unknown全部转为恢复语义、caller-required owner/session profile，或显式零mutation `evidence-required`。
- Fixed event：BS01–BS36全部`confirmed-portable`，partial/blocked/unknown/blocker均为0。
- Closure：V01与D01–D24全部closed，`business_state_gate=closed`、`production_authorization=true`。

## 关键边界

- Continue因premium-currency安全策略不采集、不实现近似，固定返回`evidence-required`且零mutation。
- 缺失、非法、非有限、重叠或不完整profile在领域mutation前返回`evidence-required`。
- 账号、room、deck/member/card/Skill身份、raw pointer和display string不进入portable输入、trace或生产类型。
- 未观察的fault/dispose/duplicate native partial mutation不被猜测；portable surface采用完整preflight零mutation拒绝。
- HABAHIRO限时runtime initialization不可自然到达；portable fixture由锁定BMS、MasterMusic score level 26、base公式和caller deck aggregate确定，不冒充实体R1。

## 新增闭合证据

- `runtime/ordinary-auto-skill-playing-retry-reset-r1.trace.json.gz`：1471连续事件；Retry前`skill-01`为Playing，确认后第二次`ExecAwakeStart`创建state0/empty/current-null/stock8 manager，完整区间无public `Stop`或`processOfSkillFinished`。
- `score_life_state_migrated_static_oracle.json`：base/event/special/Skill/Fever八簇当前ARM64语义。
- `score_life_state_portable_contract.json`：每个原unknown的实现、caller profile或拒绝处置。
- `score_life_state_fixed_event_oracle.json`：36个闭合case及其portable closure投影。
- `closure.json`：V01/D01–D24最终门状态。

## 验证

```powershell
node tmp/simulator-reverse-evidence/score-life-state/verify.mjs
node tmp/simulator-reverse-evidence/score-life-state/verify.mjs --index
```

`verify.mjs`校验464个冻结文件的Reverse提交对象/source working tree/copy/index四方字节、逐文件SHA-256、提交祖先关系、12条R1、8簇/48方法迁移、125项portable处置、BS01–BS36和V01/D01–D24闭合状态。
