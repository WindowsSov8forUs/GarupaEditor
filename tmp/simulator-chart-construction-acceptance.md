# 模拟器谱面构造阶段验收记录

## 验收身份

- 验收日期：2026-07-26
- 目标分支：`codex/refactor-simulator-implementation`
- 阶段任务书：`tmp/simulator-chart-construction-task.md`
- 唯一原作证据仓库：`HOST________\VSCode\GirlsBandParty-Reverse`
- 锁定原作证据提交：`74ab76f6838847d98aae1a15741a5f024e3774ff`
- 验收范围：C01–C10 的证据冻结、构造边界、Header/Bezier、BMS 解析、批次、Long/Slide、HABAHIRO、命令记录、终结过滤、静态同步准备和生产样本 oracle。
- 排除范围：判定、渲染、音频、真实输入、Skill/Fever/lane-change 消费、同步线运行时、`noteSyncEdgeMargin` 和主程序入口。

## 提交边界

| 批次 | 提交 | 内容 |
| --- | --- | --- |
| 任务书 | `d16bd14` | 记录谱面构造阶段范围、证据与执行边界 |
| 第一批 | `643c310` | 冻结 E01–E18、F01–F04、manifest、开放缺口和哈希校验器 |
| 第二批 | `dcfb049` | 建立原作形状类型、四个构造 owner、纯构造入口和失败关闭边界 |
| 第三批 | `79d77bc` | 恢复 Header/Bezier 与 BMS 文本构造管线 |
| 第四批 | `9402486` | 恢复批次、基础记录和同位置顺序 |
| 第五批 | `a186244` | 恢复 Long、Slide 与派生节点对象图 |
| 第六批 | `08f6d6c` | 恢复 HABAHIRO 多范围合并与双坐标旁路 |
| 第七批 | `16a1fe4` | 恢复 BPM、Skill、Fever 和命令模式构造数据 |
| 第八批 | `d147b4e` | 恢复四次终结过滤与静态同步准备 |
| 第九批 | 本记录所在提交 | 建立生产样本 oracle、完整隔离验证和阶段验收记录 |

## 生产样本验收

测试入口：`npm.cmd run simulator:test:chart-production`。测试只读取冻结证据包，不访问网络，不调用 Python。

| 验收项 | 普通谱面 | HABAHIRO 谱面 |
| --- | ---: | ---: |
| 批次 | 656 | 371 |
| 终结后构造记录 | 935 | 770 |
| playable roots | 825 | 598 |
| 源 Slide 节点 | 298 | 141 |
| 展开 Slide 节点 | 1577 | 626 |
| Slide roots | 93 | 51 |
| 静态同步关系 | 192 | 266 |
| lane-change | 0 | 1 条，位置 1728 |

- 普通 F01 构造结果与 E11 的批次、记录、起始 BPM、playable 类型、最大 Note 数、附加类型、Slide 展开和同步数量一致；Single、Directional、Long 与源 Slide 字段和 F02 全量多重集匹配。
- HABAHIRO F03 构造结果与 E12 的批次、记录、起始 BPM、playable 类型、最大 Note 数、CC 身份、Slide 展开、lane-change 和同步数量一致；来源 lane、Long 路径、Slide 节点与主路径和 F04 匹配。
- 普通 298 个源 Slide 节点是 1577 个展开节点的有序子序列；HABAHIRO 的 51 条主 Slide 路径同样保持在 626 个展开节点中，52 条同拍支撑事件只作为所属图成员参与 authoring 对照。
- 两份样本重复构造得到完全一致的序列化结果；测试身份、来源 CC 和同步关系均使用旁路投影，不污染原作形状记录。

## 隔离验证

```powershell
npx.cmd tsc -p src/simulator/tsconfig.json
npm.cmd run simulator:test:chart-production
npm.cmd run simulator:test:chart-finalize
npm.cmd run simulator:test:chart-command-data
npm.cmd run simulator:test:chart-multi-range
npm.cmd run simulator:test:chart-graphs
npm.cmd run simulator:test:chart-batches
npm.cmd run simulator:test:chart-parsing
npm.cmd run simulator:test:chart-boundary
npm.cmd run simulator:test:first-slice
git diff --check
node tmp/simulator-reverse-evidence/chart-construction/verify.mjs --index
```

- 模拟器隔离 TypeScript 类型检查：通过。
- 生产样本验收与谱面构造全部定向回归：通过。
- 第一切片回归和禁止跨层依赖扫描：通过。
- 22 项冻结证据与样本的源文件、工作树副本和 Git 索引 SHA-256：通过。
- Git 差异检查：通过。
- 未运行 `npm run build`、Vite 构建、Tauri 构建、主程序测试或完整模拟器联调。

## 开放边界

- F01/F03 均没有非零 BPM change；CC03/08 记录形状和静态算法已有隔离测试，但非零 BPM 生产或实体设备 oracle 仍未取得，因此不宣称该路径生产闭合。
- `noteSyncEdgeMargin`、激活后的同步线断线/重连和实际线对象生命周期仍待后续证据与实现。
- Skill、Fever 和 lane-change 当前只恢复构造记录，不包含分数、UI、状态机、协程、动画、材质切换或事件消费。
- 判定、渲染、音频、真实输入、主程序入口和编辑器谱面适配不属于本阶段。
- Python 原型仍只作为 Reverse 离线 oracle；GarupaEditor 的 TypeScript 实现、测试和 package scripts 均不依赖 Python。

## 验收结论

谱面构造阶段已在任务书定义范围内完成：从原始 BMS 到原作形状 `NoteBatchInformationList` 的 Header/Bezier、文本解析、批次顺序、Long/Slide 图、HABAHIRO 合并、命令记录、终结过滤和静态同步准备均由锁定 Reverse 证据及两份冻结生产样本验证。该结论只覆盖已确认的构造字段、数量、顺序和连接关系，不扩大到上述开放边界，也不承诺当前 GarupaEditor 整体可运行。
