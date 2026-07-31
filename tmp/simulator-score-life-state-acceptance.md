# 模拟器分数、生命与状态阶段验收记录

## 1. 验收结论

“分数、生命与状态”B00–B12已完成并通过隔离验收。

- 锁定样本：`jp.co.craftegg.band` 10.1.4（version code 230，`arm64-v8a`）。
- `libil2cpp.so`：`815DF62582B35F3EF2223AB033FAC6DC909DE492D548DD28950BF1F98F058D8F`。
- `global-metadata.dat`：`298D92CB0DC44B11681C5478F3BB08CE5476321361CE962096095CC31812961F`。
- Reverse最终闭合提交：`44d2f20bf4cf19eb4c91e5b025101ec154f31e60`。
- Garupa证据冻结提交：`3647eac`。
- Production提交：`9726880`。
- 定向测试提交：`9d382f23aa0c56d720eeb45abb812a4862a96cc0`。
- `business_state_gate=closed`，`production_authorization=true`。

## 2. 证据验收

冻结包`tmp/simulator-reverse-evidence/score-life-state/`通过source commit、Reverse working tree、copy和Git index四方字节校验：

- 464个冻结条目；
- 326个方法、25个布局、19个枚举、326个ARM64 TSV；
- 2个production BMS，ordinary/HABAHIRO maxNoteCount分别为`979/731`；
- 12条observation-only R1；
- 8个当前ARM64语义簇、48个当前方法；
- 125个原unknown均有恢复语义、caller-required profile或显式失败关闭处置；
- BS01–BS36为36 confirmed、0 partial、0 blocked、0 unknown、0 blocker；
- V01及D01–D24全部closed。

Continue、身份字段导出、缺失profile和未观察的native fault/dispose/duplicate partial mutation没有用默认值或no-op冒充：Continue与未闭合路径固定在领域mutation前返回`evidence-required`。

## 3. Production验收

### B03 配置与owner

- `ScoreLifeStateProfile`带schema/session并在构造前完整校验、复制和深冻结。
- `ScoreUtility`、`InGameRecord`、`SituationSkillManager`、`FeverTimeManager`和`ScoreLifeStateManager`保持单一owner。
- Host只能提供原作master/start-data数值profile；最终Score、Life、Combo、Skill/Fever状态均由engine owner产生。

### B04–B06 Score与Reflect

- parent-owned chart按10.1.4规则计算ordinary/HABAHIRO `979/731`，包括Long tail、visible Slide child、Directional Multiple共享root、HABAHIRO lane-change/auxiliary排除。
- score-level rate和base score保持逐阶段`Math.fround`；ordinary初始化匹配`0x3F9C28F6/0x4434718E`。
- OneFrame在Setup时冻结adjusted result、Score/Power、Skill/Fever/Crescendo rate、ScoreUpType、guard和Never Die。
- Reflect按固定五槽先清/消费、先变更Combo再选rate、分阶段toward-zero，并保持同raw首项代表和one-note strict maximum/equal retention。

### B07 Life与Game Over

- Life初始化、player max、business upper limit分离；允许证据确认的overheal并在upper limit处clamp。
- Miss/Bad为`-100/-50`，Good/Great/Perfect为0。
- fixed/rate damage、zero-rate guard、Never Die equality和Life 5已实现。
- lethal Life触发single Game Over；Game Over后的正Life mutation按确认链拒绝。

### B08–B09 Skill

- Skill Note success/failure、duplicate suppression、queue、Begin→Playing→Finishing→None、5.0/profile duration、0.75 finishing和next-frame reservation已恢复。
- once fixed/rate Life effect及under-Life gate已恢复。
- active effect enum 0–10按有consumer分支恢复：judge、damage、Never Die、score over/under Life、continuous worst、only-perfect、under-great-half和Crescendo。
- active heal没有确认Note consumer，profile在初始化前失败关闭而非no-op。

### B10 Fever

- Great/Perfect difficulty point表、80 pass、duplicate suppression、anonymous member adapter、Ready/Start/End、success/failed、reset、callback reservation和Level1 `2.0/0x40000000`已恢复。
- Fever adapter不模拟Photon时序或身份数据。

### B11 Special mode/event

- Auto coefficient、Festival result/Combo bypass与stage rate、Medley/Garupa ordered inclusive ranges和已确认fallback已恢复。
- Free Live event bonus使用独立base/record，Festival stage multiplier不乘bonus score。
- 缺失、非法、非有限、重叠或不完整profile在领域mutation前返回`evidence-required`。

## 4. 验证结果

在GarupaEditor提交`9d382f23aa0c56d720eeb45abb812a4862a96cc0`且远端差异`0 0`时执行：

```powershell
npx.cmd tsc -p src/simulator/tsconfig.json
npm.cmd run simulator:test:score-life-state
node tmp/simulator-reverse-evidence/score-life-state/verify.mjs --index
npm.cmd run simulator:test:manual-input
```

结果：

- TypeScript隔离检查通过；
- Score/Life总入口通过证据closure、production BMS `979/731`、B03–B11定向矩阵、dependency反审和证据校验；
- manual完整验收通过，并递归通过first-slice、全部chart构造/production、clock scheduling、Auto Live和全部manual judgement/input suites；
- score-life-state evidence index校验通过；
- engine无React、Pixi、Tauri、DOM、编辑器谱面类型、Reverse、Python或网络依赖；
- 无整体Vite/Tauri构建要求，本阶段按任务书只执行模拟器隔离验收。

## 5. B00–B12状态

| 任务 | 状态 |
| --- | --- |
| B00 阶段任务书 | closed |
| B01 10.1.4静态证据 | closed |
| B02 实体与fixed-event oracle | closed |
| B03 配置、领域数据与owner | closed |
| B04 基础分与maxNoteCount | closed |
| B05 单次判定业务投影 | closed |
| B06 Reflect、Combo、Score与Record | closed |
| B07 Life、guard、Never Die与Game Over | closed |
| B08 Skill Note与playlist | closed |
| B09 active Skill与Crescendo | closed |
| B10 Fever状态机 | closed |
| B11 special mode/event与组合生命周期 | closed |
| B12 production oracle与独立验收 | closed |

## 6. 阶段边界

本验收不包含HUD、动画、音频、粒子、Photon网络模拟、CRIWARE、Pixi/DOM/Tauri输入或主程序接入。上述内容仍属于后续实施块；不得将本阶段纯领域验收外推为完整模拟器可运行状态。
