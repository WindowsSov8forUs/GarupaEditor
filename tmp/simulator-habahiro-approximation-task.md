# HABAHIRO 可审计近似完整实现任务书

日期：2026-08-03

## 1. 用户授权与规则优先级

本任务是已关闭“资源与 Pixi 渲染”阶段后的专项补充。用户明确要求：HABAHIRO 不得因无法获得原作自然运行时、UnityFS 或原始帧而停留在未实现状态；应以当前 10.1.4 静态证据为主、已有动态证据和可审计推导为辅，缺失资源允许从 `bestdori.com` 资源站获取，并明确提示结果可能与原作不同。

本专项据此替代旧任务书中“未观察即永久失败关闭”的 HABAHIRO 专项处置，但不放宽 ordinary 模式、领域判定、Score/Life、资源哈希、transaction、session、Float32、pause、fault 和 dispose 边界。

## 2. 交付定义

交付模式固定为：

- `mode = habahiro`
- `fidelity = approximate-current-external`
- visible label：`Approximate HABAHIRO`
- machine-readable flag：`rendering-fidelity-approximate-habahiro`
- 不宣称 Unity AssetBundle byte parity、自然运行时顺序 parity、原始 framebuffer parity 或 GPU raster parity。

“近似”只表示证据等级和差异披露，不表示允许省略功能。最终必须实现全部谱面 Note family、宽音符资源、Long/Slide mesh、sync/Multiple line、field/judge/mask、lane-change、pause/reset/reuse/release，并完整重放固定 HABAHIRO production chart。

## 3. 依据层级

1. **当前 10.1.4 静态证据**：Reverse `ab5cc366a4a03d24a215e379849824e5ddf5f72f` 中 current ARM64、layout、resource route、R7 profile。
2. **当前外部资源profile**：`habahiro_current_external_resource_profile.json`；Bestdori 2026-03-31 release window、179 Sprite rows、9 image/material files及固定SHA-256。
3. **已有动态证据**：ordinary/R4/R7 owner、geometry、setter和lifecycle轨迹；仅迁移共同owner语义，不宣称已观察HAB自然轨迹。
4. **可审计推导**：当HAB专属动态值不可得时，采用静态控制流、谱面range、ordinary共同owner和显式宿主参数形成确定性实现；每项推导必须进入difference matrix。
5. **资源补足**：只允许固定`bestdori.com` HTTPS URL；必须在使用前校验byte length、SHA-256、PNG dimensions与`.sprites`结构。禁止未锁定URL、镜像、alias或hash漂移。

## 4. 资源策略

- Production允许显式调用HAB专用Bestdori准备器；engine仍不联网，网络只存在于host/backend资源准备边界。
- 自动下载只在用户显式选择HAB approximate profile后发生；ordinary及其他profile不得触发。
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

必须持续显示并记录以下可能差异：

- Bestdori导出资源可能与游戏内部UnityFS打包、材质或导入设置不同；
- HAB自然runtime的同帧pool identity、setter顺序和pause相位未直接观察；
- mesh width singleton原值不可得，由显式宿主参数替代；
- flash clip曲线、Root_effect、field/judge精确纹理与事件时刻可能不同；
- mask、透明排序、采样、GPU raster和physical frame可能不同。

这些差异不得再作为“不实现”的理由，但也不得从文档、UI label、snapshot或oracle中删除。

## 7. 固定验收项

| ID | 验收项 |
| --- | --- |
| HR01 | explicit approximate profile、visible label、machine-readable fidelity，无silent fallback |
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

- 审计已完成：现有实现只有宽root ordinary-projection proxy和同帧两阶段diagnostic；Long/Slide child、mesh/line、field/judge、完整lane-change与Bestdori准备器仍缺。
- 当前外部资源profile已锁定179 rows及资源hash，但尚未由production下载/解析/消费。
- 本专项重新打开HAB functional completion；旧`exact open-not-claimed`将保留为parity声明边界，而不再代表功能未实现。

## 10. 2026-08-03 一次性资源与推导冻结

- 按固定Bestdori URL一次下载explorer、bundle、`.sprites`、6张atlas PNG及3张line/material PNG；12项byte length与SHA-256全部匹配Reverse current external profile，原始bytes留在临时目录且不入库。
- 解析bundle preload range建立texture PathID→PNG映射；`.sprites`得到179个unique exact key，按PNG分组为31/28/35/28/28/28/1行；Unity bottom-left rect转换为Pixi top-left后全部通过dimension边界。
- 从current 10.1.4 `libil2cpp.so`只读恢复`GetMeshWidthRate`常量：base `1.05f`（`3F866666`）、coefficient `0.0300000906f`（`3CF5C2C0`）；宿主setting继续显式输入。
- 冻结`tmp/simulator-habahiro-approximation-evidence/`：pinned assets、179 atlas rows、mesh-width formula、0.25秒显式推导flash profile和HA-D01–HA-D12 difference matrix。verifier输出`functional-blockers=0 parity=false`。
- 自本记录提交并push后，允许按resource→engine→Pixi→oracle顺序集中实施；实现不得删除visible approximation label或差异矩阵。
