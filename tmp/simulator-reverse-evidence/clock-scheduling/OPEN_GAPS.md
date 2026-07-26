# 时钟与调度证据开放缺口

## 当前门状态

- S01 静态证据冻结：已建立，须通过 `verify.mjs` 与 Git 索引校验后完成。
- S02 实体设备证据闭环：`required-before-code`。
- S03–S10：全部受 S02 阻断，S02 完成前禁止开始生产实现。
- Reverse 静态基线：`74ab76f6838847d98aae1a15741a5f024e3774ff`。
- Reverse 最终证据提交：尚未产生。

## S02 必须闭合的证据

1. 原作实际可消费、包含非零 CC03/CC08 的原始 BMS 与完整 SHA-256。
2. 启动时主音乐时钟的 bar、beat 与绝对位置。
3. 启动时 launcher 时钟的 bar、beat 与绝对位置。
4. launcher lead-time 的来源、单位、计算方式和写入时机。
5. 初始 `currentBPM`、`nextBPM`、对应原字符串及其相互关系。
6. active BPM 列表、BPM 对象池、待激活组游标的初始状态。
7. 60 与 120 请求模式下逐 frame、逐 substep 的双时钟、BPM 字段、活跃列表、组游标和回调轨迹。
8. 首个 BPM command 在 launcher 激活、active 列表驻留、current BPM 切换及即时移除的准确时机。

任何字段无法从实体设备确认，S02 均不得标记完成，也不得以默认值、推定值或旧实现补齐。

## 明确后置或持续开放的边界

- move-time、快照、`ReturnTime` 和 16 秒无输入回放后置，不属于本阶段。
- 浏览器、Surface 或显示器的物理 frame pacing 未确认；本阶段只恢复 60/120 请求边界。
- 真实音频 transport 与双音乐时钟的设备层相位未确认。
- 具体生产 Note 的 Move、Wait、Stop、Deactive、输入、判定和渲染行为仍开放；进入未恢复行为必须返回 `evidence-required`。
- Unity PlayerLoop 相对其他 MonoBehaviour 的完整位置仍未闭合。

## 证据纪律

- 禁止引用旧 GarupaEditor 模拟器实现。
- 禁止引用 Reverse 未跟踪的 `runtime/tools/`。
- 禁止用未经 Reverse 登记的网络样本补齐运行时证据。
- S02 证据必须先回填并提交到 Reverse，再更新本证据包的最终锁定提交、manifest 和任务书。
