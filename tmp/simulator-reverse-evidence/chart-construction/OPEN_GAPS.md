# 谱面构造阶段证据缺口

本文件登记锁定提交 `74ab76f6838847d98aae1a15741a5f024e3774ff` 下仍未闭合的谱面构造相关边界。开放项不得由旧模拟器、常见 BMS 约定、Python 原型或默认值补齐。

## G01：非零 BPM 变化生产 oracle

- 状态：`open-production-oracle`
- 已确认：CC03 解析两字符十六进制 BPM；CC08 通过 `#BPMxx` 查表；起始 `#BPM` 不计入变化数量；BPM 数值与原始字符串并行保存。
- 当前限制：F01 与 F03 的 BPM change count 均为 0，只能证明起始 BPM 和无变化生产路径。
- 允许工作：依据 E01–E04、E13 建立静态算法测试。
- 关闭条件：冻结一份带非零 CC03 或 CC08 的生产谱面或实体设备观测，并记录原始字节、构造记录、BPM 列表、位置和消费顺序。
- 禁止：用合成测试宣称非零 BPM 生产闭合。

## G02：`NoteManager.noteSyncEdgeMargin` 序列化值

- 状态：`open-runtime-configuration`
- 已确认：E10 已闭合 front、Long end、Slide end 和 Slide side-node 的静态端点身份及连接顺序。
- 当前限制：序列化边距值尚无静态或实体设备证据。
- 本阶段边界：谱面工厂只保留建立同步所需的记录顺序和端点身份，不读取或提供该值。
- 关闭条件：从版本匹配资源或实体设备取得值与消费路径。
- 禁止：设置 0、经验值或旧模拟器值作为默认值。

## G03：激活后的同步线断线与重连时机

- 状态：`open-runtime-lifecycle`
- 已确认：E10 的静态投影可从构造结果恢复 192 条普通谱面关系和 266 条 HABAHIRO 关系。
- 当前限制：实时 Note 状态造成的断线、重连和线对象回收仍属于 `NoteManager` 生命周期。
- 本阶段边界：同步图只能作为测试 oracle 投影，不能写入 `NoteBatchInformationListFactory` 返回数据。
- 关闭条件：冻结真实调用者、触发状态、发生相位和对象所有权。
- 禁止：增加 `SyncConnectionSpec` 原作字段或提前实现线对象生命周期。

## G04：命令记录的运行时消费者

- 状态：`open-downstream-consumers`
- 已确认：BPM、Skill、Fever 和 lane-change 可作为 `NoteInformation` 构造数据保留；F03 在绝对位置 1728 含一条 lane-change 记录。
- 当前限制：Skill/Fever 状态机、BPM 音频 transport 回调、lane-change 动画事件与材质切换不属于谱面构造。
- 本阶段边界：只恢复字段、索引、位置、原始字符串和记录所有权。
- 关闭条件：后续阶段分别冻结对应运行时调用链。
- 禁止：从构造阶段触发 UI、分数、音频、动画或渲染行为。
