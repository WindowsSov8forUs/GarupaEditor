# 模拟器第一切片验收记录

## 验收身份

- 验收日期：2026-07-26
- 目标分支：`codex/refactor-simulator-implementation`
- 第一切片任务书：`tmp/simulator-first-slice-task.md`
- 唯一原作证据仓库：`HOST________\VSCode\GirlsBandParty-Reverse`
- 锁定原作证据提交：`74ab76f6838847d98aae1a15741a5f024e3774ff`
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
| G01/G06 闭合批 | `9645372` / `e011359` | 冻结 E14–E16，恢复双音乐时钟、激活窗口、持久子步计数器和 ExecuteFrame |
| G02/G03 闭合批 | `71da6b5` / `1207b62` / `191e016` | 冻结 E17–E21，删除合成 sourceOrder，关闭第一切片跨 Note 移除推定 |
| G04/G05 闭合批 | `4296552` / `96cc62c` / `6498a57` | 冻结 E22–E25，恢复 InGameDirector 帧入口与真实 GameState/PauseState 更新门并记录验收 |

任务书原始文档提交为 `57a24fd`。以上五个后续实施提交按任务书第 8 节的行为边界拆分，没有把主程序适配混入模拟器提交。

## 定向测试覆盖

测试入口：`npm.cmd run simulator:test:first-slice`。

| 任务书必测场景 | 覆盖结果 |
| --- | --- |
| 管理器对象图构造和单一所有权 | 通过；确认 InGameDirector 到 InGameManager 的帧入口所有权、四个 manager 引用、唯一池对象 ID 和确定构造边界 |
| initialize、step、pause、resume、dispose 顺序 | 通过；生命周期幂等、暂停 step 和恢复 step 分别验证 |
| 四档子步选择边界 | 通过；覆盖 `0.018`、`0.033`、`0.05` 两侧及等值 |
| G01 音乐位置与激活窗口 | 通过；覆盖 192 刻度双时钟、单次跨小节、当前位置开区间、发射器位置闭区间、过期小节和空批次 |
| G06 历史计数器与 ExecuteFrame | 通过；覆盖 `101/21/6` 次回退、第四计数器无直接回退、无 BPM 变化固定单步和同步平分 |
| 同时音符组延迟一个子步 | 通过；激活子步无 Update，下一子步反向执行 |
| 反向 Update 和 AfterUpdate 顺序 | 通过；`C,B,A` 两阶段轨迹一致 |
| Update 中 Deactive 过滤 | 通过；B 即时移除且不进入 AfterUpdate |
| 列表自移除和下一子步 Count | 通过；当前子步保留 A，下一子步不再出现 B |
| 暂停冻结音符进度 | 通过；时钟、组游标、列表、池和 OneFrame 保持不变 |
| G05 状态与分派门 | 通过；PauseState 1/2、GameState 6/7 的 isPaused 公式精确，PauseSound 保留 InputManager 边界但阻断 NoteManager |
| OneFrame 获取、Reflect 和回收 | 通过；池序收集、统一清除、耗尽失败关闭 |
| 未闭合能力失败关闭 | 通过；真实触摸、判定和 OneFrame 业务填充均返回 `evidence-required` |
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
- 25 项冻结证据的源文件、工作树副本和 Git 索引 SHA-256：通过。
- Git 差异检查：通过。
- 未运行 `npm run build`、Vite 构建、Tauri 构建、主程序测试或完整模拟器联调。

## 已闭合证据门

- G01：确认原作字段 `NoteManager.MUSIC_BAR_DIVISION_COUNT = 192`，并恢复双时钟推进、批次绝对位置和音符组激活窗口。
- G06：确认四个持久 `uint` 计数器、BPM 变化计数门、递增后回退阈值和 `deltaTime`/`ExecuteFrame` 平分。

## G02–G05 闭合

- G02：按钮组按 BMS 首次出现顺序保留，组内按绝对位置排序；第一切片预构造列表只保留最终 `informationList` 顺序，不再要求 `sourceOrder`。
- G03：第一切片 Update 调用图内没有确认的跨 Note 低索引移除调用者；保留固定索引、自移除和下一子步刷新，不制造合成入口。
- G04：原作帧入口闭合为 `Update.ScriptRunBehaviourUpdate -> InGameDirector.Update -> InGameManager.ExecUpdate`；宿主 `step` 只作为可移植触发器。
- G05：完整确认第一切片使用的 GameState/PauseState 名称、值、isPaused 公式和 NoteManager 更新门；PauseSound 仅保留输入边界。

## 后续切片边界

- 无引擎对象依赖的其他 MonoBehaviour 回调相对顺序、完整原生 PlayerLoop 外围系统和渲染呈现时序不属于第一切片。
- 暂停 UI、恢复倒计时、具体音频设备与接口槽名称不属于第一切片。

E12/E13 只证明输入 owner 与派生职责边界；真实触摸、判定、分数、生命、HUD、音效和资源行为仍保持 `evidence-required`。

## 验收结论

第一切片已经在“原作引擎框架与确定性生命周期”的定义内严格复原，并闭合 G01–G06：原作帧入口与对象所有权、双音乐时钟、音符组激活窗口、等位置成员顺序、完整自适应子步、预构造夹具池化、活跃列表语义、两阶段子步顺序、真实暂停更新门、OneFrame 容器边界和无副作用观察设施均可隔离验证。该结论不表示原作完整引擎、视觉、音频、真实输入、完整 PlayerLoop 外围系统或主程序接入已经完成。
