# 手动输入与判定证据门状态

## 已关闭

Reverse `1432b7def25faafee4cc713423305d2c1fb7def4`已关闭：

- V01：10.1.4/230完整版本重基线；
- D01：Slide Wait/over-Wait独立边界；
- D02：type、enum、finger/button及数组容量；
- D03：bottom-left Float32坐标与owner-issued resolver capability；
- D04：ordinary/Slide/wide/tie的严格替换与owner scan顺序；
- D05：1/60、窗口、Fast/Slow和Miss interval bits；
- D06：finger 0/1两指全phase、枚举顺序及0..14 owner范围；
- D07：Single strict timeout、Flick Began缓存/7-frame Wait/synthetic owner，以及Flick 0.04、Directional 0.01 exact strict阈值；
- D08：Multiple count/side/group owner与两指raw producer；
- D09：Long实体Good/Slow head、grace/move/release路径；
- D10：Slide十组band、cursor/result owner及实体root/after身份；
- D11：Long双timeout及Slide root/after timeout顺序；
- D12：Long physical None release→Miss与finger清理、Slide release路径；
- D13：五槽、Long双slot单Reflect及第六槽terminal fault边界；
- D14：outer-frame once-only、pause/adaptive/fault/dispose顺序；
- D15：whole-frame preflight与malformed/foreign/later-invalid零mutation边界；
- MJ01–MJ26：10.1.4固定事件oracle，无`unknown_fields`。

```text
runtime_oracle = closed
manual_input_gate = closed
blocking_findings = []
```

## 非阻断边界

- Score/Life/Skill/Fever/audio/particle/rendering/HUD仍属后续阶段。
- Unity PlayerLoop与OS采样延迟不作声明。
- DOM/Tauri/Pixi/主程序输入适配与接入未实现。
- 证据关闭只允许开始M03；不等于生产或最终验收关闭。
