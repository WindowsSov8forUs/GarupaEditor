# Live/Rehearsal × Manual/Auto 合同

## Authority

- Reverse模式/生命周期：`6c0dfb76`，`artifacts/investigations/live-rehearsal-runtime-contract-10-1-4/`。
- Reverse多比例布局与真实控件owner：`9167dce77d0472a000b509f993b0e66e44e4797f`，`simulator-multiaspect-layout-runtime-contract-10-1-4/`；旧`rehearsal-control-rendering-10-1-4`截图geometry仅作observation，不再是production authority。
- Life初始化/Full伤害：Reverse `2cbea93d`，`artifacts/investigations/simulator-public-life-profile-10-1-4/`，PLP-E01–PLP-E07。
- 谱面MV Live：Reverse `38802391`，`mv-live-runtime-contract-10-1-4/`与`mv-live-portable-media-profile-10-1-4/`；完整合同见[`mv-live-contract.md`](./mv-live-contract.md)。
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

Standard四种Public模式从`Prepare(0)`依次进入`OPFirstAnimStart(1)`、`OPFirstAnimEnd(2)`、`OPLastAnimStart(3)`、`PlayingNone(4)`、`PlayingSound(5)`；0–3不得推进Note、input、judgement、Score/Life/Combo或gameplay particle。启动音频是允许的独立owner：BGM先以零voice gain建立并paused；Live Manual/Auto创建`SE_RHYTHM_GAYA`全buffer owned loop（volume 1.0、0.5秒fade-in），Practice Manual/Auto保持null；Live非null voice等待backend ended后release，Live null和Practice bypass分列。music edge先发布PlayingNone，再从current Gaya gain用1.5秒fade-to-zero/stop并resume prepared BGM，下一状态进入PlayingSound。

Retry创建fresh Practice链，不继承旧owner；MoveTime reconstruction不创建Gaya/voice/信息演出，物理输出在目标publication前抑制。pause/resume、abort、terminal fault与dispose均清理loop/source/gain/decoded资源。`startupDirectionPortable`因此恢复`closed-portable`，但speaker onset、CRI/HCA、Android与原Unity framebuffer exact仍不声明。

Launch根仍精确三键`{chartData,presentation,config}`。Schema 9 presentation将SD角色与开场语音固定为null，另有必填nullable `mv`；non-null只允许Live Manual/Auto，插入`MovieBeforeSound(17)`并按signed delay决定movie在BGM前或后启动。MV背景Gaya=false；negative delay明确允许PlayingSound/gameplay先于movie。Practice无法选择Simple movie display，因此Rehearsal MV、Retry/MoveTime MV失败关闭。purpose仍由simulator内部拥有且不进入Public。

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

控件消费[`adaptive-layout-contract.md`](./adaptive-layout-contract.md)的current prefab/StarUI owner：

- rewind/advance由Left/Right+Center safe anchor、`±72` child和`104×104` UISprite派生；
- 命中使用原作world-circle radius `0.12`，不再使用旧截图bbox或人工`100×100`矩形；
- time background由Right+Top hierarchy与`172×32` widget派生；
- Rehearsal Auto caption由Left+Top scene root、`(130,-135)` content、`(0,1)` background和`206×38` widget派生；
- exact current atlas rows、NineSlice border和sgm font无fallback；
- 两种Rehearsal共享同一initial surface revision，Live均隐藏。

1600×720上的约`(142.208,360)`与`(1457.792,360)`只是参数化公式的一组回归结果。截图不提供production数值；GPU/fixed-device exact仍不声明。

## 明确删除

`playMode`、`practice.enabled`、`startMilliseconds`、deferred scene publication、suppressed initial WebAudio output与caller-authored replay checkpoint均不属于最终合同。旧IPS-P01–P05只保留历史审计，不再提供production capability。
