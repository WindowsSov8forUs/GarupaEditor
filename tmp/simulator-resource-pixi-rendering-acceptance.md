# 资源与 Pixi 渲染阶段独立验收记录

日期：2026-08-01

## 1. 验收结论

**结论：RP13 回归入口通过；RP14 阶段完成验收不通过，阶段保持进行中。**

本次验收不把“证据 closure 已确认”和“production 已可见实现”混为一谈。当前已完成 typed resource contract、本地 provider、Sprite、ordinary projection、22/60 base NoteMesh、sync-line quad、field/judge 显式 setup producer、基础 HUD semantic、observed life-heal semantic，以及完整 RP12 fault/context/dispose 矩阵；但下列 production surface 仍明确失败关闭：

- NoteManager 尚无完整、已证实的 `specificSpeed/RealMoveSecond/sourceZ/scene` 输入，motion producer 未接入 Note lifecycle；
- Advanced/Multiple mesh/back-line、threshold shader 与 SpriteMask runtime ordering 未实现；
- Pixi `set-hud`、mask、slider、`play/stop-animation` 仍拒绝，HUD/动画没有可见 portable mapping；
- ordinary field producer 尚未由 host scene plan 接入实际 session；
- HABAHIRO degraded 的可见 fidelity label 依赖 HUD mapping，因而 production scene 尚不能交付；exact HABAHIRO gate 继续开放。

因此不得将 `src/simulator/README.md` 改成“资源与 Pixi 渲染阶段已完成”，不得宣称原作 parity。

## 2. 锁定状态

- Garupa 分支：`codex/refactor-simulator-implementation`
- 验收前已推送 HEAD：`ac315e4445c6341fd8cd083b08e67729eafb5e4f`
- Reverse 分支：`main`
- Reverse 证据提交：`dd61e432202d2f1cc651b755cd69e09e73083947`
- 验收前双仓远端差异：均为 `0 0`
- Garupa 唯一无关工作树项：`tmp/current-device.png`，未读取、未暂存、未修改。
- Reverse 既有无关项：`.claude/`、`runtime/tools/`，未消费、未暂存、未修改。

## 3. 证据验收

`tmp/simulator-reverse-evidence/resource-pixi-rendering/verify.mjs`通过：

- entries：743；methods/layouts/enums：673/32/19；
- cache/ingameskin/base resources：11026/57/100；
- ordinary R1：87,364 events；geometry R2：87,037 events / 636 frames；
- mesh owners：510；line owners：80；projection/profile/producer/HUD-runtime：各 1；
- HUD caller：14,084；HUD-animation caller：1,452；observed life-heal order：2；
- H01–H28、D01–D18、PR01–PR40 evidence closure：closed；
- delivery authorization：true；exact HABAHIRO：open-not-claimed。

冻结包未包含 APK、UnityFS、资源图片/字体/clip bytes、raw R1/R2 trace、实体 PNG、IDA 数据库或 Reverse `runtime/tools/`。

## 4. RP00–RP14 实施验收

| 项 | 结论 | 说明 |
| --- | --- | --- |
| RP00 | 通过 | 旧资源/旧入口边界与当前分支状态已锁定。 |
| RP01 | 通过 | 任务书、失败关闭、fidelity 与排除边界已建立。 |
| RP02 | 通过 | 743 项 frozen manifest/source/index verifier 可校验。 |
| RP03 | 通过 | typed resource/scene/command/backend contract、原子事务与 recording backend 已实现。 |
| RP04 | **部分** | Sprite key、pool root、motion/mesh/line pure producer 已实现；motion lifecycle 与完整 child graph 未接。 |
| RP05 | **部分** | ordinary/directional root Sprite 与 field/judge explicit producer 已实现；flick icon/visible field session/HAB lane change 未实现。 |
| RP06 | **部分** | base mesh 与 sync-line 已实现；advanced/Multiple/threshold/mask 未实现。 |
| RP07 | **部分** | stable root pool identity、activate/deactivate/session release 已实现；完整 mesh/line/child reuse graph 未接。 |
| RP08 | **部分** | Score/Combo/Result/Life semantic HUD 原子命令已实现；Pixi 可见 HUD 未实现。 |
| RP09 | **部分** | R1 observed life-heal semantic 已实现；其余 overlay/animation 及 Pixi sampling 未实现。 |
| RP10 | 通过 | local bytes、SHA-256、PNG metadata、cache/refcount、无网络、atomic prepare 已实现。 |
| RP11 | **部分** | Pixi Sprite/Mesh/sync-line/projection/order 已实现；Mask/Text/Slider/Animation 仍拒绝。 |
| RP12 | 通过 | prepare/command/context/capability/mutation/dispose 矩阵通过。 |
| RP13 | 通过 | production runner 与 14-stage 全回归入口从临时产物通过。 |
| RP14 | **不通过** | 因 RP04–RP09、RP11 production 缺口仍在，不满足阶段完成门。 |

## 5. PR01–PR40 production 状态

证据 case 均已闭合，但 production 验收按实际实现分组：

- **通过**：PR01–PR06、PR11、PR13、PR33–PR39 的当前已声明子路径。
- **部分**：PR07、PR09–PR10、PR15、PR18–PR20、PR22–PR30。
- **未实现/失败关闭**：PR08 flick icon animation、PR12 advanced mesh、PR14 Multiple back line、PR16 threshold、PR17 mask、PR21 pause animation clock、PR31–PR32 animation sampling、PR40 可见 degraded fidelity label。

这份分组不回写或降低 frozen PR evidence status；它只记录 production 消费完成度。

## 6. 验证结果

验收前已从已推送 HEAD 串行执行：

```powershell
npm.cmd run simulator:test:resource-pixi-rendering
```

结果：14 stages 全部通过，包括：

1. resource/Pixi production（evidence、static audit、isolated `tsc`、contracts、producer、实际 Pixi、failure）；
2. first-slice；
3. chart boundary；
4. chart parsing；
5. chart batches；
6. chart graphs；
7. chart multi-range；
8. chart command data；
9. chart finalize；
10. chart production（ordinary 与 HABAHIRO BMS）；
11. clock scheduling；
12. Auto Live；
13. manual acceptance（MJ01–MJ26）；
14. Score/Life/State（BS01–BS36）。

production static audit确认：production 无网络 API/remote URL/Bestdori、无 Reverse 工作树或 frozen evidence runtime read；simulator scripts 无 Python/网络依赖。未运行 Vite/Tauri 或 GarupaEditor 整体构建。

## 7. RP12 独立确认

- provider throw 在 decode 前失败；decode rejection、dimension mismatch 与 Texture alias 均回滚；
- unsupported semantic command 非 terminal 且不消费 sequence；
- missing/duplicate/cross-session/overlap/foreign capability/context/mutation exception 锁定首错并清空 scene/reservation；
- object 先于 atlas subtexture，base Texture/source 最后 `destroy(true)`；
- host stage 不销毁；重复 dispose 幂等。

## 8. 后续硬门

后续实施应重新拆成三个批量 job，避免逐证据停顿：

1. Note lifecycle/child graph：补齐 runtime scene/motion 输入，并接 root/icon/mesh/sync/Multiple owner；
2. visible Pixi：一次实现 mask + bitmap HUD/slider + deterministic animation profile/sampling；
3. production acceptance：补 PR remaining oracle、degraded visible label，再重跑 RP13/RP14。

在这三个批次关闭前，本阶段状态必须保持“进行中”。
