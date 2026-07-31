# OPEN GAPS

## 门状态

```text
version_rebaseline=closed
business_state_gate=closed
production_authorization=true
unknown_methods=[]
unknown_layouts=[]
unknown_fields=[]
blocking_findings=[]
r1_traces=12
production_bms=2
fixed_event_cases=36
fixed_event_confirmed=36
fixed_event_partial=0
fixed_event_blocked=0
fixed_event_unknown_fields=0
fixed_event_blocking_findings=0
production_chart_counts=979,731
```

## 已关闭

- `V01`：10.1.4 / code 230 / ARM64 版本重基线。
- `D01–D17`：326个方法、25个布局、19个枚举、Float32/整数/列表/状态机与special-mode语义。
- `D18`：12条R1覆盖普通初始化、Score/Life/Game Over、Skill lifecycle/effect、pause/Retry/ReturnTime与Playing manager reset；不可自然到达的active Fever/special identity仅在portable surface按当前ARM64语义和caller profile恢复，不冒充R1。
- `D19`：BS01–BS36全部`confirmed-portable`，`unknown_fields=[]`、`blocking_findings=[]`。
- `D20`：OneFrame逐entry冻结、Skill start/end R1及portable完整preflight→slot-order commit边界。
- `D21`：pause/Retry实测；未观察fault/dispose/duplicate native partial mutation统一在portable preflight阶段以`evidence-required`零mutation拒绝。
- `D22`：Game Over、Retry、Practice ReturnTime已观察；Continue因premium-currency安全策略明确排除并返回`evidence-required`。
- `D23`：ordinary/HABAHIRO BMS、MasterMusic、deck aggregate已锁定；具体master/profile值改为owner/session-bound caller-required数值输入，缺失或非法时mutation前`evidence-required`。
- `D24`：`closure.json`锁定owner、profile、session、lifecycle、mutation与unsupported-path规则。

## Portable 排除项

以下不是开放缺口，而是闭合后的失败关闭边界：

- premium-currency Continue；
- 账号、room、deck/member/card/Skill身份和raw pointer导出；
- 缺失、非法、非有限、重叠或不完整master/profile；
- 未由native R1证明的fault/dispose/duplicate partial mutation。

这些路径不得no-op、默认、clamp或近似；统一在领域mutation前返回`evidence-required`。
