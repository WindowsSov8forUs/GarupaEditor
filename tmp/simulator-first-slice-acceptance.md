# 模拟器第一切片验收记录

## 验收身份

- 验收日期：2026-07-26
- 目标分支：`codex/refactor-simulator-implementation`
- 第一切片任务书：`tmp/simulator-first-slice-task.md`
- 唯一原作证据仓库：`HOST________\VSCode\GirlsBandParty-Reverse`
- 锁定原作证据提交：`f4392a327f536275cf1f1733e27b778ee2ce600c`
- 验收范围：T01–T11 的证据包、宿主边界、对象图、池化、确定性调度、暂停、OneFrame 容器、记录后端和隔离测试。
- 排除范围：主程序入口、编辑器谱面适配、BMS 解析、真实判定、可见渲染、实际音频、真实输入、窗口通信和完整 Unity PlayerLoop。

## 提交边界

| 批次 | 提交 | 内容 |
| --- | --- | --- |
| 第一批 | `a2c7044` | 冻结 E01–E13、manifest、证据缺口和哈希校验 |
| 第二批 | `e1e3fe7` | 建立宿主、原作管理器对象图、Note 类型与四态证据门 |
| 第三批 | `96259b8` | 建立 SetupNotes、对象池、活跃列表、子步调度与暂停 |
| 第四批 | `c57f7f0` | 建立 OneFrame 容器、统一 Reflect、记录后端与快照 |
| 第五批 | 本记录所在提交 | 建立隔离测试入口、完整定向测试和验收记录 |

任务书原始文档提交为 `57a24fd`。以上五个后续实施提交按任务书第 8 节的行为边界拆分，没有把主程序适配混入模拟器提交。

## 定向测试覆盖

测试入口：`npm.cmd run simulator:test:first-slice`。

| 任务书必测场景 | 覆盖结果 |
| --- | --- |
| 管理器对象图构造和单一所有权 | 通过；确认四个 owner 引用、唯一池对象 ID 和确定构造边界 |
| initialize、step、pause、resume、dispose 顺序 | 通过；生命周期幂等、暂停 step 和恢复 step 分别验证 |
| 四档子步选择边界 | 通过；覆盖 `0.018`、`0.033`、`0.05` 两侧及等值 |
| 同时音符组延迟一个子步 | 通过；激活子步无 Update，下一子步反向执行 |
| 反向 Update 和 AfterUpdate 顺序 | 通过；`C,B,A` 两阶段轨迹一致 |
| Update 中 Deactive 过滤 | 通过；B 即时移除且不进入 AfterUpdate |
| 列表自移除和下一子步 Count | 通过；当前子步保留 A，下一子步不再出现 B |
| 暂停冻结全部进度 | 通过；时钟、组游标、列表、池、OneFrame 与轨迹保持不变 |
| OneFrame 获取、Reflect 和回收 | 通过；池序收集、统一清除、耗尽失败关闭 |
| 未闭合能力失败关闭 | 通过；G01、输入、触摸和 OneFrame 业务填充均返回 `evidence-required` |
| 禁止跨层依赖 | 通过；测试入口同时运行 `verifyDependencies.mjs` |
| dispose 幂等 | 通过；重复调用不改变快照或新增后端事件 |

补充验证已覆盖源顺序激活、重复激活不重复追加、Deactive 对象仍由池持有、Note 仅经注册回调请求 OneFrame 容器、快照确定性以及序列化无副作用。

## 验收命令与结果

```powershell
npm.cmd run simulator:test:first-slice
npx.cmd tsc -p src/simulator/tsconfig.json
node src/simulator/testing/verifyDependencies.mjs
node tmp/simulator-reverse-evidence/first-slice/verify.mjs
node tmp/simulator-reverse-evidence/first-slice/verify.mjs --index
git diff --check
```

- 第一切片定向测试：通过。
- 模拟器隔离 TypeScript 类型检查：通过。
- 禁止依赖扫描：通过。
- 13 项冻结证据的源文件、工作树副本和 Git 索引 SHA-256：通过。
- Git 差异检查：通过。
- 未运行 `npm run build`、Vite 构建、Tauri 构建、主程序测试或完整模拟器联调。

## 保留证据门

- G01：`UnitsPerBar` 名称与数值未闭合，默认音乐推进和组位置比较失败关闭。
- G02：相同位置成员的上游构造顺序未闭合，夹具必须显式携带源顺序且不得重排。
- G03：跨 Note 低索引移除实例未闭合，固定递减索引失效时停止。
- G04：Unity PlayerLoop 相位未闭合，宿主 `step` 不冒充 Unity 帧相位。
- G05：暂停状态完整枚举和精确门条件未闭合，只实现可移植冻结门。
- G06：慢帧历史强制单步计数器未闭合，只实现已确认四档阈值。

E12/E13 只证明输入 owner 与派生职责边界；真实触摸、判定、分数、生命、HUD、音效和资源行为仍保持 `evidence-required`。

## 验收结论

第一切片已经达到“原作引擎框架与确定性生命周期”的定义：对象所有权、预构造夹具池化、活跃列表语义、两阶段子步顺序、暂停冻结、OneFrame 容器边界和无副作用观察设施均可隔离验证。该结论不表示模拟器可运行，也不表示原作完整引擎、视觉、音频、输入或主程序接入已经完成。
