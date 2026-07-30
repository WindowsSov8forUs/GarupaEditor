# OPEN GAPS

## 已关闭

- `V01`：10.1.4 / code 230 / ARM64 版本重基线。
- `D01-static`：326 方法、25 布局、19 枚举、命名常量、rodata 与独立 ARM64 范围。
- D02–D17 的 `static` 子结论：详见冻结 `score_life_state_static_findings.json` 与 `static_closure.json`。
- `D23-BMS`：ordinary `poppin_shuffle_special`与HABAHIRO `786_miracle_april_habahiro_special`的10.1.4设备cache provenance及TextAsset字节。
- R1 capture tooling：50个目标与静态contract一致；仅`Interceptor.attach`，无return replacement/memory write。
- `D18/D22-partial`：无输入Retry R1锁定稳定InGameRecord identity、Life `1000/1000/2000`、11个Miss、slot-order Life归零及single Game Over `0→1`。
- `D18-positive-partial`：v2 R1锁定1个Perfect业务OneFrame、Score 1404、Combo/Perfect计数与10个Miss。
- `D14/D18/D20-Skill-partial`：原生七lane R1锁定Skill `0→1→2→3→0`、5.0s/0.75s timer、once-heal `800+300=1100`、Begin前两个entry冻结1.0且在Playing后Reflect仍消费1.0、Playing后18个entry冻结1.2/ScoreUpType1、finish后恢复1.0。
- 正判定/Skill计划：v1保留为superseded；v2与原生ARM64七lane v2均已晋升raw；shell七lane控制因超时aborted且无raw。
- `D22-Retry-partial`：v3 R1锁定Game Over后11.875秒无已hook manager/business调用；非破坏性Retry复用同一InGameRecord并重置Game Over、Score、Life、Combo、判定/输入计数与cached Skill Life，再以max Note 540进入InitBaseScore。Continue与星石动作显式禁止且未观察。
- `D19-partial`：BS01–BS36 partial oracle已生成并独立校验；BS05/BS06/BS11为静态confirmed，20个case为partial，13个case blocked；`unknown_fields=151`、`blocking_findings=91`，因此D19仍required-before-code。
- `D03/D19/D23-chart-count-partial`：production chart count独立oracle按10.1.4 ARM64规则固定ordinary `979`与HABAHIRO `731`；已移除BS01/BS02的4个chart unknown并将BS02推进为partial，base-score与初始化顺序仍开放。

## required-before-code

- `D18`剩余：Fever、guard、Never Die、多个/重叠Skill及special-mode对象identity与before/after字段。
- `D19`剩余：BS01–BS36尚有151个unknown fields与91个blocking findings，必须补齐master/R1/failure证据后才能全部`unknown_fields=[]`。
- `D20`剩余：Fever切换、多个/重叠Skill及Skill/Fever/Life/Combo/五槽交错；单Skill start/end冻结子范围已锁定。
- `D21`：生命周期与 failure atomicity。
- `D22`剩余：score decrease mode、Continue（采集禁止）、seek与ReturnTime边界。
- `D23`剩余：score level、difficulty、deck/start-data及result/damage/Skill/Fever/event/Auto/Festival/Medley/Garupa master rows provenance。
- `D24`：最终 closure 与 portable contract。

## 门状态

```text
version_rebaseline=closed
business_state_gate=open
production_authorization=false
unknown_methods=[]
unknown_layouts=[]
unknown_fields=[]
r1_traces=4
production_bms=2
capture_plans=5
executed_capture_plans=3
pending_capture_plans=0
fixed_event_cases=36
fixed_event_confirmed=3
fixed_event_partial=20
fixed_event_blocked=13
fixed_event_unknown_fields=151
fixed_event_blocking_findings=91
production_chart_counts=979,731
chart_count_unknown_fields=0
aborted_capture_plans=1
superseded_capture_plans=1
excluded_raw_fields=5
blocking_findings=[D18-remaining,D19,D20-remaining,D21,D22-remaining,D23-remaining,D24]
```

B02 关闭前，B03–B12 production 继续禁止。
