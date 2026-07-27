# 时钟与调度证据开放缺口

## 当前门状态

- S01 静态证据冻结：已完成。
- S02 运行证据同步：Reverse `e96733cd96a5e7446d2b9adbc413bf77de0bcf98` 的 10.1.3/10.1.4 oracle 已冻结并可离线校验。
- S02 本地门状态：`blocked-by-adaptive-fallback-runtime-evidence`，当前仅第 2 项继续阻断。
- S03–S10：继续受 S02 阻断，禁止开始生产实现。
- Reverse 静态基线：`74ab76f6838847d98aae1a15741a5f024e3774ff`。
- Reverse 当前证据提交：`e96733cd96a5e7446d2b9adbc413bf77de0bcf98`。

## 已闭合的主要运行证据

- 原作实际消费的非零 CC03 与 CC08 生产 BMS、数值 BPM 和原字符串。
- 10.1.4 下 60/120 `Application.targetFrameRate` 请求。
- 初始主/launcher 双时钟、launcher lead、current/next BPM 及字符串。
- CC03/CC08 的 Setup、驻留、到点提交、inactive、callback 和即时移除主生命周期。
- 受采集器影响的 2/3/4 子步，以及 `counter[3]` 到 6 时当帧回退单步。
- 反向主 active list Update、BPM-before-Note、暂停冻结与原位续跑。
- 正判定偏移跨 BPM；负偏移跨 bar 时保留调用点 BPM 的实际语义。

## 只读捕捉前提下无法明确但不阻断

1. **HABAHIRO 零 BPM-change 60 模式实体样本**
   - 锁定谱面 `786 miracle_april SPECIAL` 只在限时活动开放，当前采集账号无法进入。
   - 标记为“根据已有证据进行还原，不阻断，无法依赖实体证据，不确保百分百还原”。
   - 现有静态生产验证继续保留，不用合成谱面或其他宽谱伪造实体证明。

2. **30 槽 BPM 对象池游标回绕与复用**
   - 已扫描 81 个 bundle、4176 个 BMS；445 个谱面含 BPM command，单谱面最大 16 个。
   - 只读捕捉无法得到单局第 31 次 acquire；标记为“根据已有证据进行还原，不阻断，无法依赖实体证据，不确保百分百还原”。
   - 不用合成谱面伪造原作生产运行证明。

## 仍阻断 S02 的证据

1. **自适应历史回退低 bucket 动态边界**
   - 静态重读与运行证据已修正映射：四计数器中 `counter[1]`、`counter[2]`、`counter[3]` 分别参与 `>100`、`>20`、`>=6`；`counter[0]` 只增量、不比较。
   - `counter[3] >= 6` 已动态闭合。
   - runs 061–067 已覆盖重到轻的探针配置：重配置立即把帧扰动到 bucket 2/3；轻配置稳定在 bucket 0，最多仅两个孤立 bucket-2 frame，且没有 bucket-1 frame。
   - 因而无法在保持必要只读观测的同时累积 `counter[1] = 101` 或 `counter[2] = 21`；这是观察扰动与运行时可达性边界，不是阈值或映射未知。
   - 在该动态边界另行决策前继续失败关闭并阻断 S03–S10。

## 已确认但必须修订原任务书的结论

- `NoteManager +0x74` 不是“当前谱面的有效 BPM command count”；它随同一进程中的谱面解析持续累积。
- 自适应回退比较的不是原 E04/E05 摘要中的 `counter[0]/[1]/[2]`，而是 `counter[1]/[2]/[3]`。
- 负 offset 跨越已提交 CC08 bar 边界时，每个 timed step 保持调用点的 `95.5` BPM；不能按旧任务书写成回到前一 bar 后重新读取 `99.5`。
- High Frequency 的运行消费路径在 `InGameDirector.Awake` 内联读取 `LiveCoreSettings +0xA9`；托管 getter 没有进入该路径。

## 明确后置或持续开放的边界

- move-time、快照、`ReturnTime` 和 16 秒无输入回放后置，不属于本阶段。
- 浏览器、Surface 或显示器的物理 frame pacing 未确认；本阶段只恢复 60/120 请求边界。
- 真实音频 transport 与双音乐时钟的设备层相位未确认。
- 具体生产 Note 的 Move、Wait、Stop、Deactive、输入、判定和渲染行为仍开放；进入未恢复行为必须返回 `evidence-required`。
- Unity PlayerLoop 相对其他 MonoBehaviour 的完整位置仍未闭合。
- UI radio 到 High Frequency 持久字段的端到端写入 callback 未观察到；本阶段只消费已确认设置值。

## 证据纪律

- R01 的 `closure.json` 保留 Reverse 原始结论；GarupaEditor 另行记录两项只读不可得的非阻断保真度例外，不篡改冻结证据。
- 禁止引用旧 GarupaEditor 模拟器实现。
- 禁止引用 Reverse 未跟踪的 `runtime/tools/` 或 `.claude/`。
- 禁止用未经 Reverse 登记的网络样本补齐运行时证据。
- 新证据必须先提交 Reverse，再更新本证据包、manifest、任务书和校验器。
