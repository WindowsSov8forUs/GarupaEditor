# 资源与 Pixi 渲染阶段独立验收记录

日期：2026-08-03

## 1. 验收结论

**RP00–RP14 全部通过，资源与 Pixi 渲染阶段完成。**

PR01–PR40 production-consumption 矩阵为：**40 closed（其中 PR04/PR19/PR40 为 disclosed degraded HABAHIRO 轨）、0 partial、0 blocked**。exact HABAHIRO 继续保持 `open-not-claimed`，不属于本阶段已选择 degraded 交付轨的 parity 声明。

## 2. 锁定状态

- Garupa 分支：`codex/refactor-simulator-implementation`
- production 提交：`37304ec`（R7完整消费链）
- oracle 提交 / 验收运行 HEAD：`b49666d`（PR01–PR40正向oracle）
- Reverse 分支：`main`
- Garupa消费的Reverse证据基线：`ab5cc366a4a03d24a215e379849824e5ddf5f72f`
- Garupa冻结提交：`3aab575`
- 验收运行时远端差异：`0 0`
- RP13在独立 detached clean worktree 的已推送 `b49666d` 上运行；结束后已移除该worktree。
- Reverse无关未跟踪目录`.claude/`、`runtime/tools/`未读取、未暂存、未消费。

## 3. R7证据门

冻结包与`verify.mjs`确认：

- entries：850；methods/layouts/enums：673/32/19；
- final R7：625,192 events、3,480 aggregate frames、51 observed owners、21 setters；
- 21个remaining PR全部`confirmed-current-r7`；PR01–PR40 evidence gate全部关闭；
- Advanced：42 vertices / 120 indices / 21 UV pairs；
- current threshold：`_Threshold >= gl_FragCoord.y`，Pixi top-left等价条件为`pixel_y >= viewport_height - threshold`；
- HUD current static/runtime覆盖Combo/AP、Score、AddScore、Result/JudgeTiming、ScoreUp 1–5、Life/Guard/NeverDie、Judge Skill、Fever与GameOver顺序；
- `unknown_fields=[]`、`blocking_findings=[]`；
- exact HABAHIRO：`open-not-claimed`；degraded HABAHIRO：authorized/disclosed。

## 4. Production闭合

### Note / geometry / material

- Skill、Flick/Directional顶层动画、Long与Slide非Normal terminal、MultipleDirectional add/after side visual均进入固定pool、stable identity、engine-clock sample和原子teardown。
- virtual-lane owner消费Advanced 42/120 strip；base路径保留22/60；两者均保留Float32逐步运算。
- Long/curve material绑定进入NoteMesh owner；`44322D84` current threshold由typed command传输，Pixi以GPU mask实现bottom-left shader select等价映射。
- ordinary全family授权前仍执行整批结构预检；非法lane、空Slide chain、未知enum/key继续在mutation前失败关闭。

### Field / lifecycle

- field line、judge line、visible-inside polygon mask、显式ordering与session reverse release具有recording及actual Pixi正向oracle。
- pause不进入engine update，因此Note/icon/mesh/line/field/HUD owner-local时间冻结；resume从原状态继续。
- pool first acquire、复用identity、重复/foreign capability、child-first release与terminal fault cleanup均保持原子边界。

### HUD / animation

- Combo执行0/positive/unchanged gate、ordinary/AP key切换、scale clip、1秒hide与AP alpha loop。
- Score固定8位，leading gray/significant pink并消费typed gauge fill。
- AddScore固定4对象round-robin、8级depth cycle和3×0.14秒engine-clock运动。
- Result消费None/Auto/Fast/Slow、1秒lifetime；ScoreUp 1–4保留Sprite/tint，type 5按`trunc(rate*10)`输出Crescendo一位小数。
- Life保留primary/secondary、0.2 danger、0.25 warning、Guard suppression、Heal/Guard/NeverDie shared overlay及later-eligible-wins。
- Score Skill、Judge Skill和Fever Ready→Start→End具有独立owner；GameOver同一HUD transaction停止活跃overlay并隐藏临时owner。

### Pixi / production replay

- actual Pixi覆盖Sprite、base/advanced Mesh、long/curve material、threshold、sync/Multiple line、mask、field、8位Score、AddScore、Result/Crescendo、Life overlays、Judge Skill和Fever。
- `poppin_shuffle_special` ordinary exact replay：656 batches、159,832 commands，固定digest：`e174b8f0ab2e943ba84ab45a2ee8ecaca9fbcdc235fb32176c7cf6c18834a0ec`。
- `786_miracle_april_habahiro_special` disclosed degraded replay：371 batches、4,902 commands，position 1728严格`flash-start → change-lane`并显示`Approximate HABAHIRO`。
- 两条replay在dispose后均为0 render owner。

## 5. RP00–RP14

| 项 | 结论 | 说明 |
| --- | --- | --- |
| RP00–RP03 | 通过 | 任务书、R7证据门、typed contract、resource/session/transaction边界关闭。 |
| RP04–RP07 | 通过 | 全ordinary Note family、field、base/advanced mesh、threshold、pool/lifecycle关闭。 |
| RP08–RP09 | 通过 | HUD与engine-clock animation全路线关闭。 |
| RP10 | 通过 | local bytes/hash/metadata/decode/cache/refcount，无网络与fallback。 |
| RP11 | 通过 | 全部授权semantic→Pixi portable mapping具有actual oracle。 |
| RP12 | 通过 | prepare/command/context/mutation/dispose/terminal precedence通过。 |
| RP13 | 通过 | clean pushed `b49666d`运行14-stage总入口全部通过。 |
| RP14 | **通过** | PR01–PR40为40/0/0，无剩余production blocker。 |

## 6. 验证结果

在独立clean pushed HEAD `b49666d`执行：

```powershell
npm.cmd run simulator:test:resource-pixi-rendering
```

结果：

- evidence verifier：850 entries，R7 gate closed；
- static dependency audit：network=off、Reverse runtime read=off、Python runtime dependency=off；
- PR production verifier：`closed=40 partial=0 blocked=0 RP14=passed`；
- render contracts：9组通过；
- geometry、actual Pixi、failure、双production replay通过；
- first-slice、chart construction、clock、Auto Live、manual、Score/Life/State全回归通过；
- 总入口：`stages=14`。

未运行Vite/Tauri或GarupaEditor整体构建，符合阶段隔离验收规则。

## 7. 保留边界

- exact HABAHIRO仍缺current UnityFS、natural HAB R1与original physical frame，因此继续`open-not-claimed`；本阶段只关闭显式degraded/disclosed轨。
- Unity GPU binary parity、driver raster、NGUI batching、Font hinting、粒子内部模拟仍排除；已实现的是冻结current semantic的Pixi portable equivalent。
- 主程序React/Tauri接入、编辑器skin下载协议适配仍属于后续块9。
