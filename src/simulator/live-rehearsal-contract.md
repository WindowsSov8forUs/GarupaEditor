# Live/Rehearsal × Manual/Auto 合同

## 运行政策分类

Reverse证据用于标注原作事实；未覆盖分支必须绑定显式产品语义并只产生内部notice，不得以`evidence-required`中止合法模式动作。资源/状态损坏仍按[`../runtime-contract-policy.md`](../runtime-contract-policy.md)处理。

## Authority

- Reverse模式/生命周期：原始合同`6c0dfb76`，当前消费于已同步tip `6cddb142806ffdb933cc6a237f69f4dd16e9ca97`；`live_rehearsal_runtime_contract.json` SHA-256 `71F35CF156DE56EAB1075E607D039879961B979CEBC8AB7E8E730D629EC5349F`。
- Reverse多比例布局与真实控件owner：`9167dce77d0472a000b509f993b0e66e44e4797f`，`simulator-multiaspect-layout-runtime-contract-10-1-4/`；旧`rehearsal-control-rendering-10-1-4`截图geometry仅作observation，不再是production authority。
- Life初始化/Full伤害：Reverse `2cbea93d`，`artifacts/investigations/simulator-public-life-profile-10-1-4/`，PLP-E01–PLP-E07。
- 谱面MV Live：Reverse `38802391`，`mv-live-runtime-contract-10-1-4/`与`mv-live-portable-media-profile-10-1-4/`；完整合同见[`mv-live-contract.md`](./mv-live-contract.md)。
- 锁定样本：`jp.co.craftegg.band` 10.1.4 / 230 / arm64-v8a。
- 原作Live设置：Reverse `aae7e4fe`/`50bc40b6`，OLS-E01–E37、OLS-R01–R06、OLS-P01、OLS-C01；完整合同见[`original-live-settings-contract.md`](./original-live-settings-contract.md)。
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

依据：LR-E01、LR-E02、LR-R01、LR-R02、LR-C01。任何字段不允许从另一轴反推；Rehearsal Auto是Demo Play，不是Auto Live。该四行身份、Life-zero、pause particle clock、natural terminal与MoveTime owner路由在当前CPU/lifecycle范围为`closed-native-algorithm-equivalent`；它不包含physical A/V或fixed-device raster。

## 启动方向与普通路线完整音频调用图

Reverse `c8562fe478a9719cc582256f0edcdc988bb208e5`将SD01–SD16纠正为SD01–SD17，并同步修订`startup-audio-callgraph-10-1-4/`：44个current ARM64方法、10条observation-only R1、资源与生命周期在**账号教程gate未命中的普通路线**上保持zero-count完整。四种accepted ordinary trace都只有一次`tap-session-start`并到达4→5；封面/标题`RhythmGameStartAnimation`没有第二次输入等待。首次Live若`TutorialManager.IsComplete == false && CurrentTutorialState == live(2)`则打开B1–B4四页教程、禁用Pause，并由最终Close callback继续到PlayingNone；该账号分支的视觉资源和动态interaction closure仍未授权，且不是Live设置或平台音频能力。`reachable_unclassified_count`、`unknown_predicate_count`、`missing_resource_count`和runtime hook failure在普通授权范围均为0。

Standard四种Public模式固定映射为账号教程gate未命中的普通路线，从`Prepare(0)`依次自动进入`OPFirstAnimStart(1)`、`OPFirstAnimEnd(2)`、`OPLastAnimStart(3)`、`PlayingNone(4)`、`PlayingSound(5)`；0–3不得推进Note、input、judgement、Score/Life/Combo或gameplay particle，Public不接收账号教程状态或tap-to-start字段。启动音频是允许的独立owner：BGM先以零voice gain建立并paused；Live Manual/Auto创建`SE_RHYTHM_GAYA`全buffer owned loop（volume 1.0、0.5秒fade-in），Practice Manual/Auto保持null；原作nullable voice分支保留为调用图证据，但current production内部固定缺SoundResource并直接走bypass，Public不携带voice字段。music edge先发布PlayingNone，再从current Gaya gain用1.5秒fade-to-zero/stop并resume prepared BGM，下一状态进入PlayingSound。

Reverse `99d40bcc`的四模式Pause矩阵及`770af437`倒计时资源补充确认Live Manual/Auto与Rehearsal Manual/Demo均进入同一三按钮Pause菜单；Retry确认后创建fresh InGame generation，不继承旧owner。MoveTime reconstruction不创建Gaya/voice/信息演出，物理输出在目标publication前抑制。pause/resume、abort、terminal fault与dispose均清理loop/source/gain/decoded资源。`startupDirectionPortable`因此恢复`closed-portable`，但speaker onset、CRI/HCA、Android与原Unity framebuffer exact仍不声明。

Launch owned投影仍为`{chartData,presentation,config}`；键顺序和额外host metadata不参与行为。Schema 13 presentation不再包含SD角色或开场语音字段；simulator内部固定建立冻结空SD集合与缺SoundResource路径。Presentation另有必填nullable `mv`；non-null只允许Live Manual/Auto，插入`MovieBeforeSound(17)`并按signed delay决定movie在BGM前或后启动。MV背景Gaya=false；negative delay明确允许PlayingSound/gameplay先于movie。Practice无法选择Simple movie display，因此Rehearsal MV、Retry/MoveTime MV动作在ownership transfer前保持不可用并返回编辑器，不伪装为standard背景。purpose仍由simulator内部拥有且不进入Public。Skin recipe同样在initial冻结：Live Auto只让Judge回默认而保留其他特殊组件，Rehearsal两种input均按Practice禁用聚合组件；Retry/MoveTime fresh build必须匹配同一canonical Skin identity。

## Original Live settings lifecycle

Schema 13必填Primary A `-30..30`、Secondary B `-5..5`、SyncLine、NoteColor、VisibleTapLaneEffect与MvDarkness `0..70 step10`。配置在initial冻结；Retry fresh必须复用同一identity，MoveTime reconstruction复用配置但显式bypass Primary startup counter，Pause/Resume不重载且不热切换。

A>0延迟BGM resume A个outer updates；A<0先启动BGM，再冻结gameplay/input/Note/judgement/Score/Life/particle `abs(A)`帧；B仍是独立Note position/Slide轴。Pause冻结Primary与MV dark-cover/lane-effect动画，Pause入口清除活动lane effect；resume不补算冻结帧。视觉bool不改变业务判定和音频/粒子owner。

## Life初始化与生命周期

Public chart的BGM字段只接受非空`Uint8Array`；cue、SHA-256、codec/sample metadata均由simulator在严格MP3检查与浏览器解码后内部生成。Public chart另只接受显式`isFullLength: boolean`，不接受五个Life数值。simulator内部固定普通单曲初始化`initialLife=1000`、`playerMaxLife=1000`、`lifeUpperLimit=2000`；non-full使用Miss/Bad `-100/-50`，full使用`-50/-25`。该boolean只携带原作`musicDataType == "full"`的已解析结果，不从BGM duration、Garupa JSON内容、文件名、sessionMode或inputMode推断。initial engine、Retry和MoveTime fresh generation复用同一frozen分类。

- Live Life归零：走现有terminal Game Over链并关闭会话。
- Rehearsal Life归零：Record保留`singleGameOver`事实，但不关闭会话。LR-R01实测本轮69次Life0/GameOver后的`ExecUpdate`；此前已提交R1另有1216次。
- Reverse `99d40bcc`以19条accepted R1（并由`770af437`补全恢复倒计时owner/三PNG）、四个精确mode rows、level3 `Pause`/三种modal serialized owners、现有RhythmGameUI/UICommon/sgm资源及六组参数化布局关闭旧`41f4ecfe`阻断。Pause touch-began先于MoveTime/gameplay；modal覆盖触摸且按钮在release回调；Resume保持engine paused并执行3秒countdown后恢复，Retry fresh、Abort与两类cancel均使用opaque one-use命令。Android Back进入右侧Resume；Desktop native X仍是平台关闭。
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

## 帧级多域发布

OneFrame reflection、Score/Life、product-reflect、ParticleSystem state、audio semantic schedule、HUD与tap-lane采用同一个detached `FrameMutationPlan`。所有资源检查、命令验证、对象/mesh分配与backend preflight先完成；可能失败的portable/physical backend先提交，全部成功后才按OneFrame → Score/Life → product-reflect → particle → audio owner → render owner → tap-lane顺序发布Simulator状态。任一preflight或external commit失败时，尚未发布的OneFrame/Score/particle/HUD/lane状态保持上一提交点。

WebAudio的AudioNode/AudioParam和Pixi/GPU context属于不可物理回滚的external side-effect boundary。它们可能在terminal fault前产生局部设备效果，但不允许semantic audio或Simulator-owned frame state提前发布，也不形成跨设备原子性声明。Particle Pixi使用完整detached hidden generation，candidate attach失败时旧generation仍有效。

Product continuous timeline保持`PRODUCT_ONLY`，但同样遵守事务：可变状态可恢复，提交到OneFrame的节点先保持`inFlight`，只有下游同一reflection frame成功才转为judged。Natural completion把Game-clear particle、audio、NGUI、lane all-off与completion flag放在同一plan；MoveTime把particle suppression和lane cleanup预检后才进入fresh whole-engine reconstruction。

## Visible controls

控件消费[`adaptive-layout-contract.md`](./adaptive-layout-contract.md)的current prefab/StarUI owner：

- rewind/advance由Left/Right+Center safe anchor、`±72` child和`104×104` UISprite派生；
- 命中使用原作world-circle radius `0.12`，不再使用旧截图bbox或人工`100×100`矩形；
- time background由Right+Top hierarchy与`172×32` widget派生；
- Rehearsal Auto的`デモプレイ`badge与Live Auto的`オートライブ`caption均由Left+Top scene root、`(130,-135)` content、`(0,1)` background和`206×38` widget派生；Live Auto进一步锁定`label_round_white`、pink `(1,59/255,114/255,1)`、白色24pt label；
- exact current atlas rows、NineSlice border和sgm font无fallback；
- 两种Rehearsal共享同一initial surface revision；Live隐藏MoveTime控件，但Live Auto必须保留其独立caption。

1600×720上的约`(142.208,360)`与`(1457.792,360)`只是参数化公式的一组回归结果。截图不提供production数值；GPU/fixed-device exact仍不声明。

## 明确删除

`playMode`、`practice.enabled`、`startMilliseconds`、deferred scene publication、suppressed initial WebAudio output与caller-authored replay checkpoint均不属于最终合同。旧IPS-P01–P05只保留历史审计，不再提供production capability。
