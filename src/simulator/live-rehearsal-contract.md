# Live/Rehearsal × Manual/Auto 合同

## Authority

- Reverse：`6c0dfb76`，`artifacts/investigations/live-rehearsal-runtime-contract-10-1-4/`与`rehearsal-control-rendering-10-1-4/`。
- Life初始化/Full伤害：Reverse `2cbea93d`，`artifacts/investigations/simulator-public-life-profile-10-1-4/`，PLP-E01–PLP-E07。
- 锁定样本：`jp.co.craftegg.band` 10.1.4 / 230 / arm64-v8a。
- 产品例外：CS-V1计分及timeline revision由本项目[`scoring-contract.md`](./scoring-contract.md)授权，不冒充原作Score。

## 两条正交轴

Public只接受：

```ts
sessionMode: "live" | "rehearsal";
inputMode: "manual" | "auto";
```

Canonical identity由模拟器一次性生成：

| sessionMode | inputMode | InGameMode | Practice | Demo | AutoLive | AutoPlay |
| --- | --- | --- | --- | --- | --- | --- |
| live | manual | SingleNormal | false | false | false | false |
| live | auto | SingleNormal | false | false | true | true |
| rehearsal | manual | Practice | true | false | false | false |
| rehearsal | auto | Practice | true | true | false | true |

依据：LR-E01、LR-E02、LR-R01、LR-R02、LR-C01。任何字段不允许从另一轴反推；Rehearsal Auto是Demo Play，不是Auto Live。

## 启动方向与完整音频调用图

Reverse `78e6a70e` 的SD01–SD16约束presentation、视觉owner、状态0→5与内部purpose；Reverse `b17e64e98423bed3718ac2e76a43cde5c451ee1f`的`startup-audio-callgraph-10-1-4/`补齐44个current ARM64方法、10条observation-only R1、资源与生命周期。`reachable_unclassified_count`、`unknown_predicate_count`、`missing_resource_count`和runtime hook failure均为0。

四种Public模式从`Prepare(0)`依次进入`OPFirstAnimStart(1)`、`OPFirstAnimEnd(2)`、`OPLastAnimStart(3)`、`PlayingNone(4)`、`PlayingSound(5)`；0–3不得推进Note、input、judgement、Score/Life/Combo或gameplay particle。启动音频是允许的独立owner：BGM先以零voice gain建立并paused；Live Manual/Auto创建`SE_RHYTHM_GAYA`全buffer owned loop（volume 1.0、0.5秒fade-in），Practice Manual/Auto保持null；Live非null voice等待backend ended后release，Live null和Practice bypass分列。music edge先发布PlayingNone，再从current Gaya gain用1.5秒fade-to-zero/stop并resume prepared BGM，下一状态进入PlayingSound。

Retry创建fresh Practice链，不继承旧owner；MoveTime reconstruction不创建Gaya/voice/信息演出，物理输出在目标publication前抑制。pause/resume、abort、terminal fault与dispose均清理loop/source/gain/decoded资源。`startupDirectionPortable`因此恢复`closed-portable`，但speaker onset、CRI/HCA、Android与原Unity framebuffer exact仍不声明。

Launch根仍精确三键`{chartData,presentation,config}`。presentation是调用方已选择的本地化文字与显式PNG/MP3，不改变chartData三字段；purpose仍由simulator内部拥有且不进入Public。

## Life初始化与生命周期

Public chart的BGM字段只接受非空`Uint8Array`；cue、SHA-256、codec/sample metadata均由simulator在严格MP3检查与浏览器解码后内部生成。Public chart另只接受显式`isFullLength: boolean`，不接受五个Life数值。simulator内部固定普通单曲初始化`initialLife=1000`、`playerMaxLife=1000`、`lifeUpperLimit=2000`；non-full使用Miss/Bad `-100/-50`，full使用`-50/-25`。该boolean只携带原作`musicDataType == "full"`的已解析结果，不从BGM duration、Garupa JSON内容、文件名、sessionMode或inputMode推断。initial engine、Retry和MoveTime fresh generation复用同一frozen分类。

- Live Life归零：走现有terminal Game Over链并关闭会话。
- Rehearsal Life归零：Record保留`singleGameOver`事实，但不关闭会话。LR-R01实测本轮69次Life0/GameOver后的`ExecUpdate`；此前已提交R1另有1216次。
- Rehearsal pause menu为Abort、Retry、Resume；premium Continue排除。
- 自然结束仍进入Rehearsal结果；使用MoveTime后的原作结果语义不得被当作普通Live结果。

依据：PLP-E01–PLP-E07、LR-R01、LR-C02与current committed Live no-input Game Over证据。Medley继承与premium Continue仍排除。

## MoveTime

- 仅Rehearsal可用。
- 原作按钮固定-5/+5秒，touch-began触发，moved/ended为空。
- 自动整数秒snapshot，不接收调用方checkpoint或任意目标。
- 后退目标从不晚于目标且最多提前16秒的snapshot重建；LR-R03/LR-R05观察到`returnTime(5) -> advanceTime(16,true)`。
- 前进观察为`advanceTime(5,false)`。
- 重建复用Float32 ordinary pipeline、禁止外部输入，经过GameState 14/15/16，Stop Music后以`trunc(InGameSec*1000)`Load Music并恢复。
- Note、Command、Record、chart-owned Skill appearance、render、particle和audio必须作为一个事务恢复；不允许clock-only seek。

依据：LR-E03–LR-E20、LR-R03–LR-R05、LR-C03。

## Visible controls

1600×720 portable scene：

- rewind中心`(142,360)`；atlas frame`(912,924,97,99)`；
- advance中心`(1457.5,360)`；atlas frame`(903,315,96,99)`；
- 两种Rehearsal共享几何，Live均隐藏；Auto显示Demo badge；
- 资源复用已晋升current`rhythm-game-ui.png`原字节，无重复、fallback或系统字体替代。

这只关闭current portable controls，不声明Unity Prefab Transform、跨GPU framebuffer或fixed-device exact。

## 明确删除

`playMode`、`practice.enabled`、`startMilliseconds`、deferred scene publication、suppressed initial WebAudio output与caller-authored replay checkpoint均不属于最终合同。旧IPS-P01–P05只保留历史审计，不再提供production capability。
