# 手动输入与判定证据门状态

## 已关闭

- V01：10.1.4/230手动目标重基线；99/99方法按managed identity重新解析。
- D01：Slide `WaitState 0x321B414–0x321B628`与
  `execOverWaitState 0x321B628–0x321B69C`为独立ARM64范围。
- D02：12个owner type字段、8个enum numeric identity、finger/button字段及
  `InputManager` finger数组长度15。

## Required Before Code

以下项仍为`required-before-code`，M03–M11禁止实施：

- D03：portable坐标、lane resolver及button capability边界。
- D04：ordinary/Slide/wide/tie/simultaneous候选顺序。
- D05：窗口、rounding、Fast/Slow与tolerance实体bits。
- D06：finger范围、无owner、Stationary/Canceled与multi-touch顺序。
- D07：Flick/Directional exact movement边界与坐标转换。
- D08：Multiple真实touch、side/count/group所有权。
- D09：Long hold/move/grace/release完整实体轨迹。
- D10：Slide paired band/cursor/VirtualPerfectLine/Great correction。
- D11：Long/Slide timeout equal与同帧/invisible顺序。
- D12：release映射、skip及finger/button清理顺序。
- D13：manual producer到五槽OneFrame/第六槽/Reflect顺序。
- D14：outer-frame/adaptive/pause/resume/fault/dispose组合。
- D15：malformed/foreign/later-invalid whole-domain failure atomicity。
- MJ01–MJ26：全部须来自10.1.4 committed raw input/fixed output轨迹。

当前源`closure.json`正确保持：

```text
runtime_oracle = blocked
manual_input_gate = blocked
```
