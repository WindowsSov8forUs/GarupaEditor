# 时钟与调度证据开放边界

## 当前门状态

- S01 静态证据冻结：已完成。
- S02 实体设备证据闭环：已完成；Reverse 最终提交 `2ba3bdbbab9be2de6fedb9b22f623bd80611c023` 的 `closure.json` 为 `s02_gate = closed`、`blocking_findings = []`。
- S03–S10：前置硬门已解除。
- Reverse 静态基线：`74ab76f6838847d98aae1a15741a5f024e3774ff`。
- 锁定游戏版本：`jp.co.craftegg.band` 10.1.4 / 230（arm64-v8a）。

## 最终闭合的动态边界

- `counter[3]` 5→6：既有 pass-2 runs 确认候选 4 子步在阈值帧回退为 1。
- `counter[2]` 20→21：runs 081/083 两次独立确认候选 3 子步在阈值帧回退为 1。
- `counter[1]` 100→101：runs 086/087 两次独立确认候选 2 子步在阈值帧回退为 1。
- 完整 `101/21/6` 历史回退、严格 bucket 阈值、先递增后比较和 `counter[0]` 只记录语义均已闭合。

## 只读捕捉不可得但不阻断的保真度例外

1. **HABAHIRO 零 BPM-change 60 模式实体样本**
   - 锁定谱面 `786 miracle_april SPECIAL` 只在限时活动开放，当前账号不可选择。
   - 根据已有冻结的静态生产证据还原；无法依赖实体证据，不确保百分百还原。
   - 不用合成谱面或其他宽谱伪造实体证明。

2. **30 槽 BPM 对象池游标回绕与复用**
   - 完整缓存扫描覆盖 81 个 bundle、4,176 个 BMS；单谱面最多 16 个 BPM command，无法触发第 31 次 acquire。
   - 根据已有冻结证据还原；无法依赖实体证据，不确保百分百还原。
   - 不用合成谱面伪造原作生产运行证明。

## 持续开放且后置的范围

- 采集器诱发慢帧证明 2/3/4 子步分支与守恒关系，但不得外推未插桩客户端的 delta 分布。
- UI radio 到 High Frequency 持久字段的具体 callback 未端到端观察；60/120 read site、持久字段与 UI owner 已闭合。
- move-time、快照、`ReturnTime`、真实 Note 行为、判定、输入、音频、渲染和主程序入口属于后续阶段。
- 浏览器、Surface、显示器物理 cadence 以及真实音频 transport 相位不属于本阶段。
- 具体生产 Note 进入尚未恢复的 Move/Wait/Stop/OnUpdate/AfterUpdate 时必须返回 `evidence-required`。

## 证据纪律

- 运行实现只消费最终提交中的已冻结结论，不读取本证据目录。
- 禁止引用旧 GarupaEditor 模拟器、Reverse 未跟踪的 `.claude/`、`runtime/tools/` 或 `runtime/captures/`。
- 两项非阻断例外必须持续显式披露，不得改写成实体闭合或“百分百复原”。
