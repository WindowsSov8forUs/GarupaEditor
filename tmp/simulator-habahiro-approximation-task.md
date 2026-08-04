# HABAHIRO 可审计近似完整实现任务书

日期：2026-08-03

## 1. 用户授权与规则优先级

本任务是已关闭“资源与 Pixi 渲染”阶段后的专项补充。用户明确要求：HABAHIRO 不得因无法获得原作自然运行时、UnityFS 或原始帧而停留在未实现状态；应以当前 10.1.4 静态证据为主、已有动态证据和可审计推导为辅，缺失资源允许从 `bestdori.com` 资源站获取，并明确提示结果可能与原作不同。

本专项据此替代旧任务书中“未观察即永久失败关闭”的 HABAHIRO 专项处置，但不放宽 ordinary 模式、领域判定、Score/Life、资源哈希、transaction、session、Float32、pause、fault 和 dispose 边界。

## 2. 交付定义

交付模式固定为：

- `mode = habahiro`
- `fidelity = current-external-complete`
- 运行时不显示“Approximate”标签，不暴露approximation flag；实现按完整HABAHIRO功能路线运行。
- Unity AssetBundle byte parity、自然运行时顺序、原始framebuffer和GPU raster的证据差异只在本文及验收文本中说明。

“近似”仅是证据来源与原作逐帧parity的**文档说明**，不是功能模式、运行时状态或实现裁剪。实现必须覆盖全部谱面Note family、宽音符资源、Long/Slide mesh、sync/Multiple line、field/judge/mask、lane-change、pause/reset/reuse/release，并完整重放固定HABAHIRO production chart。

## 3. 依据层级

1. **当前 10.1.4 静态证据**：Reverse `ab5cc366a4a03d24a215e379849824e5ddf5f72f` 中 current ARM64、layout、resource route、R7 profile。
2. **当前外部资源profile**：`habahiro_current_external_resource_profile.json`；Bestdori 2026-03-31 release window、179 Sprite rows、9 image/material files及固定SHA-256。
3. **已有动态证据**：ordinary/R4/R7 owner、geometry、setter和lifecycle轨迹；仅迁移共同owner语义，不宣称已观察HAB自然轨迹。
4. **可审计推导**：当HAB专属动态值不可得时，采用静态控制流、谱面range、ordinary共同owner和显式宿主参数形成确定性实现；每项推导必须进入difference matrix。
5. **资源补足**：只允许固定`bestdori.com` HTTPS URL；必须在使用前校验byte length、SHA-256、PNG dimensions与`.sprites`结构。禁止未锁定URL、镜像、alias或hash漂移。

## 4. 资源策略

- Production允许显式调用HAB专用Bestdori准备器；engine仍不联网，网络只存在于host/backend资源准备边界。
- 自动下载只在用户显式选择HAB `current-external-complete` profile后发生；ordinary及其他profile不得触发。
- Bestdori失败、hash变化、缺文件、非法`.sprites`、越界rect或重复key必须在renderer object创建前失败。
- 原始PNG/Bundle不提交仓库；提交固定manifest、parser、profile builder、mock transport测试和结构化oracle。
- Test总入口不得联网；使用最小合成bytes和冻结metadata验证同一流程。

## 5. 固定实现选择

以下为无法取得自然HAB动态值时的显式近似，不再返回`evidence-required`：

- 宽Note使用Bestdori current external 179-row exact combination key/rect/pivot/PPU。
- Directional overlay使用current `directionalflickskin01`，宽root使用对应HAB flick组合Sprite。
- motion中心取chart-authored contiguous range代表button；宽度取range button count。
- `NoteMesh.GetMeshWidthRate`要求宿主显式提供`habahiroMeshWidthSetting`；按current ARM64公式消费，不提供默认值。
- Long/Slide child、Advanced/base mesh、sync line、Multiple back-line、pool/reuse/pause/reset采用R7共同owner顺序。
- MultipleDirectional pool容量固定60。
- lane-change保持`marker → flash-start → change-lane → complete`；原clip事件时刻不可得时使用profile显式`flashDurationSeconds`，默认profile值必须在任务oracle中固定并显示为推导值。
- field/judge/mask使用current field/judge资源与静态assignment语义，缺失Root_effect以portable flash overlay代替。

## 6. 差异披露

以下可能差异只在任务书、验收记录和证据矩阵等文本中记录：

- Bestdori导出资源可能与游戏内部UnityFS打包、材质或导入设置不同；
- HAB自然runtime的同帧pool identity、setter顺序和pause相位未直接观察；
- mesh width singleton原值不可得，由显式宿主参数替代；
- flash clip曲线、Root_effect、field/judge精确纹理与事件时刻可能不同；
- mask、透明排序、采样、GPU raster和physical frame可能不同。

这些差异不得再作为“不实现”的理由，也不得从文档删除；production UI、snapshot、fidelity和semantic command不得把完整功能路线标记为“Approximate”。

## 7. 固定验收项

| ID | 验收项 |
| --- | --- |
| HR01 | explicit `current-external-complete` profile；无silent fallback、无运行时approximation label/flag |
| HR02 | pinned Bestdori allowlist、length/hash/dimension、失败原子 |
| HR03 | `.sprites`解析179 unique rows并按6 atlas textures分组 |
| HR04 | Normal/16/Skill/Flick/Long/Flash/SlideAmong宽range exact key绑定 |
| HR05 | Long/Slide child与base/advanced mesh全链 |
| HR06 | Directional/Multiple side visual、icon与connection graph |
| HR07 | sync line、60-slot Multiple line、fixed pool/reuse/release |
| HR08 | explicit HAB mesh-width setting与current static formula |
| HR09 | field/judge/mask pre/post lane-change state |
| HR10 | flash-start/change-lane/complete、profile clock与pause freeze |
| HR11 | retry/reset/fault/dispose和0残留owner |
| HR12 | `786_miracle_april_habahiro_special`全谱固定command/scene/difference oracle |

## 8. 执行顺序

1. 先冻结Bestdori manifest、`.sprites`结构化派生profile和difference matrix；不得先写production。
2. 一次完成resource provider/profile builder。
3. 一次完成engine producer、NoteManager、lane-change和field owner。
4. 一次完成Pixi portable mapping。
5. 建立HR01–HR12正向oracle及full-chart replay。
6. 从clean pushed HEAD运行资源/Pixi与全部上游回归，独立验收后关闭专项。

## 9. 当前状态

- **专项已完成并归档**：HR01–HR12全部通过；按“差异说明只留文本、运行时为完整功能路线”修订后，从已推送`45edd6c` detached clean worktree完成`simulator:test:habahiro`与14-stage全上游独立复验。
- Production已下载前校验固定Bestdori资源、解析179 rows，并完整消费宽Note、Long/Slide、line、field/judge/mask与分阶段lane-change。
- 旧`exact open-not-claimed`只保留为parity声明边界，不再代表HABAHIRO功能未实现。

## 10. 2026-08-03 一次性资源与推导冻结

- 按固定Bestdori URL一次下载bundle、`.sprites`、6张atlas PNG及3张line/material PNG；11项payload的byte length与SHA-256全部匹配Reverse current external profile，原始bytes留在临时目录且不入库。
- 解析bundle preload range建立texture PathID→PNG映射；`.sprites`得到179个unique exact key，按PNG分组为31/28/35/28/28/28/1行；Unity bottom-left rect转换为Pixi top-left后全部通过dimension边界。
- 从current 10.1.4 `libil2cpp.so`只读恢复`GetMeshWidthRate`常量：base `1.05f`（`3F866666`）、coefficient `0.0300000906f`（`3CF5C2C0`）；宿主setting继续显式输入。
- 冻结`tmp/simulator-habahiro-approximation-evidence/`：pinned assets、179 atlas rows、mesh-width formula、0.25秒显式推导flash profile和HA-D01–HA-D12 difference matrix。verifier输出`functional-blockers=0 parity=false`。
- 自本记录提交并push后，允许按resource→engine→Pixi→oracle顺序集中实施；差异矩阵必须保留在文本证据中。

## 11. 2026-08-04 集中实现结果

- resource：新增固定Bestdori allowlist、浏览器准备transport、11项length/SHA-256校验、bundle preload与`.sprites` parser、179-row source atlas profile、6 atlas texture绑定、3 material texture绑定及Multiple line显式alias；hash/metadata异常在profile生成前失败关闭。
- engine：使用`current-external-complete` fidelity和显式`HabahiroSceneInput`；宽root使用range exact key，Long/Slide恢复child、base/advanced 42/120 mesh与material，Flick/Directional/Multiple恢复icon/side/back-line，sync/fixed pool/reuse/release沿用R7 owner链。
- width：`getHabahiroMeshWidthRate`按current ARM64的`1.05f`与`0.0300000906f`逐步Float32计算，setting由宿主显式提供，缺失或range越界失败关闭。
- field/lane：初始化前完整验证field/judge/mask与0.25秒推导flash；运行时按engine clock执行`marker → flash-start → change-lane → complete`，pause不推进，整批preflight/commit失败保持原子。
- Pixi：消费HABAHIRO current-external projection、179-row atlas、base/advanced mesh、material、mask、field/judge、long flash icon及portable全屏flash；不使用ticker创作领域时间，也不渲染approximation说明。
- compatibility：旧`fidelity=degraded`只保留backend contract兼容，host在创建production engine前拒绝；ordinary 656-batch/159,832-command/digest保持不变。

## 12. HR01–HR12 关闭记录

| ID | 结果 | 固定oracle |
| --- | --- | --- |
| HR01–HR03 | passed | complete fidelity、无运行时approximation marker；11 pinned payload；179 source Sprite rows |
| HR04–HR08 | passed | 全range atlas、Long/Slide/Directional/Multiple/sync/fixed pool、42/120 mesh与Float32 width |
| HR09–HR10 | passed | field/judge/mask；`flash-start,change-lane,complete` engine-clock顺序 |
| HR11 | passed | session release后0 owner；tamper/parser/非法width失败关闭 |
| HR12 | passed | 371 batches、6,130 frames、217,595 commands、digest `74d11cf3742de6e955a46ddd0f5d1b5c8e620f74e3e52502a7feae364f3ad8b5` |

专项总入口：`npm.cmd run simulator:test:habahiro`。验收记录见`tmp/simulator-habahiro-approximation-acceptance.md`。

功能状态为closed；UnityFS bytes、natural HAB runtime顺序、Root_effect原clip和original physical frame parity仍明确为`open-not-claimed`，不得把本专项oracle表述为原作逐帧一致。
