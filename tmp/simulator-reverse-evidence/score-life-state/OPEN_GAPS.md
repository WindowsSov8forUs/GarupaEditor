# OPEN GAPS

## 已关闭

- `V01`：10.1.4 / code 230 / ARM64 版本重基线。
- `D01-static`：326 方法、25 布局、19 枚举、命名常量、rodata 与独立 ARM64 范围。
- D02–D17 的 `static` 子结论：详见冻结 `score_life_state_static_findings.json` 与 `static_closure.json`。
- `D23-BMS`：ordinary `poppin_shuffle_special`与HABAHIRO `786_miracle_april_habahiro_special`的10.1.4设备cache provenance及TextAsset字节。
- R1 capture tooling：50个目标与静态contract一致；仅`Interceptor.attach`，无return replacement/memory write。
- `D18/D22-partial`：无输入Retry R1锁定稳定InGameRecord identity、Life `1000/1000/2000`、11个Miss、slot-order Life归零及single Game Over `0→1`。
- 正判定/Skill计划：v1 220动作保留为superseded控制且无trace晋升；v2仅将输入前等待改为500ms，状态为`pending`，不是R1结论。

## required-before-code

- `D18`剩余：positive judgement、active Skill、Fever、heal、guard、Never Die及special-mode对象identity与before/after字段。
- `D19`：BS01–BS36 fixed-event oracle，全部 `unknown_fields=[]`。
- `D20`：同帧 Skill/Fever/Life/Combo/五槽冻结时点。
- `D21`：生命周期与 failure atomicity。
- `D22`剩余：post-Game-Over manager gate、score decrease mode、reset、continue、seek与ReturnTime边界。
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
r1_traces=1
production_bms=2
capture_plans=2
pending_capture_plans=1
superseded_capture_plans=1
blocking_findings=[D18-remaining,D19,D20,D21,D22-remaining,D23-remaining,D24]
```

B02 关闭前，B03–B12 production 继续禁止。
