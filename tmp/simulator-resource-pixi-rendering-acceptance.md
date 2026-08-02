# 资源与 Pixi 渲染阶段独立验收记录

日期：2026-08-02

## 1. 验收结论

**RP13 从已推送 HEAD 通过；RP14 不通过，资源与 Pixi 渲染阶段保持进行中。**

本次验收严格区分：

- Reverse evidence closure；
- 当前证据授权下的失败关闭；
- production 正向可见功能闭合。

最终 production-consumption 矩阵为：**14 closed/closed-current-subset、14 partial、12 blocked/blocked-degraded**。runner 全绿只说明当前已实现子集及失败边界一致，不等于 PR01–PR40 全部正向实现。

## 2. 锁定状态

- Garupa 分支：`codex/refactor-simulator-implementation`
- 验收运行 HEAD：`92e0deaca0d42e2680a2a7beb7360d498702265c`
- Reverse 分支：`main`
- Garupa消费的Reverse证据基线：`4b4ebdfada2c2deea7cb9b6d838e61b1e3240876`
- Reverse当前远端HEAD：`4b4ebdfa`（R4三条confirmed trace与保守授权profile已晋升）
- Garupa 与远端差异：`0 0`
- Reverse 与远端差异：`0 0`
- Garupa 验收运行前后工作树：clean
- Reverse 保留无关未跟踪目录：`.claude/`、`runtime/tools/`；未读取、未暂存、未消费。

## 3. 证据验收

`tmp/simulator-reverse-evidence/resource-pixi-rendering/verify.mjs`通过：

- entries：807；methods/layouts/enums：673/32/19；
- resources：11,026 / 57 / 100；HUD/Skill/Note/ScoreUp profile：8/4/4/5；
- ordinary R1：87,364 events；geometry R2：87,037 events / 636 frames；
- Long child：1 profile / 13 isolated ARM64 slices；
- visible HUD R3：22 setter targets、22 ARM64 slices、19,888 events、631 frames；
- Note family R4：30 owner targets、6个新增Slide slices、118,152 events、1,258 aggregate frames；
- mesh owners：510；line owners：80；
- HAB degraded：2 profiles / 12 differences / 179 Sprite keys；
- delivery gate：closed；production authorization：true；
- exact HABAHIRO：open-not-claimed。

R3只授权bitmap Score/Combo/Life、score-skill observed overlay、serialized field/sudden mask边界、Combo/GameJudge restart和portable Combo/Life Heal sampling。R4另授权front Flick/Directional icon、observed Slide mesh+line和MultipleDirectional connect/back-line；Guard/NeverDie/Judge、Long-after Flick、Slide Wait runtime、add-Long/add-Slide/after Multiple、Advanced与threshold仍显式false。

## 4. 本轮新增闭合

- ordinary Long + Normal tail：root/after/base-mesh stable identity、Wait→Move→Stop、22/60 mesh refresh、atomic deactivate与child-first release；
- visible Pixi：exact Combo/AP digit subtexture、Score/Result/AddScore/fidelity portable Text、Life双Graphics fill、explicit polygon mask；
- animation：engine-clock Float32 `sample-animation`、Combo/Life owner-local restart/sample/stop、pause不进入`ExecUpdate`因此冻结；
- life fill：按current ARM64固定`ratio=currentLife/1000`、primary=`min(ratio,1)`、secondary=`max(ratio-1,0)`；
- degraded disclosure：actual Pixi scene显示严格文本`Approximate HABAHIRO`并参与reverse release；
- 未授权family：virtual Long、非Normal Long tail、Flick/Directional icon、Slide chain、Multiple side/back-line分family精确失败且整批零mutation。

## 5. RP00–RP14

| 项 | 结论 | 说明 |
| --- | --- | --- |
| RP00–RP03 | 通过 | 任务书、证据门、typed contract、resource/session/transaction边界完成。 |
| RP04 | 部分 | Normal与Long+Normal tail producer完成；Flick/Slide/Multiple正向child未授权。 |
| RP05 | 部分 | ordinary root与显式field/judge/mask producer存在；field host scene未接，icon/HAB lane change未实现。 |
| RP06 | 部分 | base Long mesh、ordinary Normal sync、polygon mask完成；advanced/threshold/Slide/Multiple back line未实现。 |
| RP07 | 部分 | root/Long/sync stable identity、teardown、session release完成；其余family pool graph未实现。 |
| RP08 | 部分 | Score/Combo/Life与基础Result/AddScore可见映射完成；完整layout/lifetime/round-robin未完成。 |
| RP09 | 部分 | Combo/Life Heal portable clock完成；Guard/NeverDie/Judge/score-skill完整owner链未完成。 |
| RP10 | 通过 | local provider、hash、metadata、decode/cache/refcount与无网络完成。 |
| RP11 | 部分 | Sprite/base Mesh/sync line/mask/HUD/fill/Combo-Life animation完成；任务书全部组件族未完成。 |
| RP12 | 通过 | prepare/command/context/mutation/dispose/terminal precedence矩阵完成。 |
| RP13 | 通过 | 已推送HEAD串行14-stage总入口通过。 |
| RP14 | **不通过** | 12个blocked production case仍缺正向实现。 |

## 6. PR01–PR40 production矩阵

- **Closed / current subset（14）**：PR01–PR05、PR10、PR13、PR16、PR23、PR33、PR35–PR38。
- **Partial（14）**：PR06、PR11、PR15、PR18、PR20–PR22、PR24–PR27、PR29、PR31、PR34。
- **Blocked / degraded blocked（12）**：PR07–PR09、PR12、PR14、PR17、PR19、PR28、PR30、PR32、PR39–PR40。

其中：

- PR04仅以显式degraded资源交付关闭，exact HAB保持开放；
- PR16只关闭simultaneous ordinary Normal sync；
- PR18已有backend/producer mask正向oracle，但host field scene未接，因此仍partial；
- PR40只关闭visible degraded label，不关闭HAB lane-change、natural runtime与original frame。

## 7. 验证结果

从已推送`92e0dea`串行执行：

```powershell
npm.cmd run simulator:test:resource-pixi-rendering
node tmp/simulator-reverse-evidence/resource-pixi-rendering/verify.mjs
```

结果：

- resource/Pixi production：通过；
- PR production verifier：`closed=14 partial=14 blocked=12 RP14=blocked`；
- render contracts：9组通过；
- actual Pixi、failure、resource、geometry、Long、HUD/mask/animation/degraded label：通过；
- first-slice、chart、clock、Auto Live、manual、Score/Life/State：14-stage全部通过；
- dependency、network、Reverse runtime read、Python runtime dependency反审：通过。

未运行Vite/Tauri或GarupaEditor整体构建，符合阶段隔离验证约定。

## 8. RP14阻断项

阶段完成仍需要新的、已提交并冻结的Reverse runtime授权，然后才能实现并验收：

1. Slide intermediate与N+1 segment/curve mesh lifecycle；
2. Flick/Directional icon hierarchy、sorting与runtime phase；
3. Multiple side visual、back line、reconnect和shared teardown；
4. advanced mesh、threshold/material完整路径；
5. field/mask实际host scene接线及ordinary production chart replay；
6. AddScore round-robin、Result lifetime、Score gauge、warning/Guard/NeverDie/Judge/Skill完整HUD；
7. HAB lane-change production scene；exact HAB UnityFS/natural R1/original frame继续open-not-claimed。

因此不得把`src/simulator/README.md`更新为阶段完成，也不得宣称原作完整parity。

## 9. R4取证关闭复核

最终验收后继续关闭Note family runtime证据，根因与结果如下：

- Live bootstrap会终止预先运行的Frida server，即使无session；修正为自然Start后等待bootstrap，再启动device-loopback server并attach；
- Flick、Slide、Multiple三组均通过capture summary、hook-failure、privacy和owner/setter完成门，共118,152 events / 1,258 aggregate frames；
- Reverse `4b4ebdfa`提交并push三条trace与profile；Garupa冻结807项，实体PNG继续排除，source verifier通过；
- 新授权仅覆盖front Flick/Directional、observed Slide mesh+line和MultipleDirectional connect/back-line；Long-after Flick、Slide Wait runtime、add-Long/add-Slide/after Multiple、Advanced与threshold仍false。

R4动态取证阻断已解除，但本记录的production矩阵在R4实现与正向oracle完成前仍保持14/14/12，不能把新证据本身记为production闭合。
