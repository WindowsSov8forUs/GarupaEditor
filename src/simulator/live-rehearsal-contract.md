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

判定短音共用的是派发 owner，不是互斥声部。`CE.SePlayer.PlayOneShot → SoundResource.Play → CriAtomSource.Play → InternalPlayCue.Start` 不主动停止前一次播放；Web Audio 保留旧 source 直至自然结束或显式生命周期清理，稳定 owner 的播放观察仍对应最新请求。依据 Reverse `75f44ceb0493e98daf1d656f5722581368f17798` 的 `audio-runtime-contract-10-1-4/one_shot_start_semantics.json`。不仿真 CRI 的声部分配和硬件混音。

浏览器可见性事件是宿主接口适配：同帧的暂停/恢复命令按提交后的会话状态依次消费，输入侧同步推进本批次的暂停状态。只恢复可见性适配自身施加的暂停，不能解除用户菜单暂停；非 playable 的入场和通关阶段不调用仅接受 PlayingSound/PauseSound 的游玩暂停接口。该宿主规则不声称复刻 Android OnApplicationPause 或 Unity 生命周期。

入场场地线按 SD08 的独立协程推进：请求后等待 2.5 秒，再用独立的 1 秒时钟淡入，不把等待越界余量带入淡入。进入 PlayingSound 后仍继续推进至结束；MoveTime 重建保持已完成状态。`StartupDirectionController` 的 lineAlpha 经组合场景作用于实际 field-line / judge-line 对象并保留资源基础颜色，不再写入空容器。来源为 Reverse `startup-direction-runtime-contract-10-1-4` 与 `startup-direction-portable-pack-10-1-4`；实际 Pixi 对象的内存消费检查覆盖开始播放时未完成和最终 alpha=1，不构成 GPU 或整个入场演出验收。

Schema 13必填Primary A `-30..30`、Secondary B `-5..5`、SyncLine、NoteColor、VisibleTapLaneEffect与MvDarkness `0..70 step10`。配置在initial冻结；Retry fresh必须复用同一identity，MoveTime reconstruction复用配置但显式bypass Primary startup counter，Pause/Resume不重载且不热切换。

A>0延迟BGM resume A个outer updates；A<0先启动BGM，再冻结gameplay/input/Note/judgement/Score/Life/particle `abs(A)`帧；B仍是独立Note position/Slide轴。Pause冻结Primary与MV dark-cover/lane-effect动画，Pause入口清除活动lane effect；resume不补算冻结帧。视觉bool不改变业务判定和音频/粒子owner。

## Life初始化与生命周期

Public chart的BGM字段只接受非空`Uint8Array`；cue、SHA-256、codec/sample metadata均由simulator在严格MP3检查与浏览器解码后内部生成。Public chart另只接受显式`isFullLength: boolean`，不接受五个Life数值。simulator内部固定普通单曲初始化`initialLife=1000`、`playerMaxLife=1000`、`lifeUpperLimit=2000`；non-full使用Miss/Bad `-100/-50`，full使用`-50/-25`。该boolean只携带原作`musicDataType == "full"`的已解析结果，不从BGM duration、Garupa JSON内容、文件名、sessionMode或inputMode推断。initial engine、Retry和MoveTime fresh generation复用同一frozen分类。

- Live Life归零：走现有terminal Game Over链，立即停止玩法输入；会话保留音频资源，至少覆盖既有两次 Pause 命令的累计延迟（0.05 秒、再 0.1 秒）后才关闭，避免同帧 dispose 抹掉已安排的音频输出。延迟由 `AudioCommandProducer` 的原命令共同派生，不增加 Continue 对话框或完整 GameOver 演出。
- 帧末先选择成功结束，再选择Life归零失败。Reverse `c3e3e48f43d0ef2412482a691709150fc022c605` 的 `simulator-game-clear-native-domain-10-1-4/game_end_branch_order.json` 绑定 `transitionGameEndState@0x32FD008`、`isGameClear@0x32FB778` 与现有updatePlayState/onGameOver原指令。生产在全部判定、Record、HUD反映后选择分支；失败音频暂停、粒子清理、lane-effect all-off只在失败分支提交，随后发布GameState 8并停止后续玩法输入。自然结束与Life归零同帧时只启动成功分支，不能先在判定批次中清理失败粒子或暂停成功音频。Rehearsal仍保留Life归零事实并继续。此修复沿用关闭会话的既有合同，不增加Continue对话框。
- Rehearsal Life归零：Record保留`singleGameOver`事实，但不关闭会话。LR-R01实测本轮69次Life0/GameOver后的`ExecUpdate`；此前已提交R1另有1216次。
- Reverse `99d40bcc`以19条accepted R1（并由`770af437`补全恢复倒计时owner/三PNG）、四个精确mode rows、level3 `Pause`/三种modal serialized owners、现有RhythmGameUI/UICommon/sgm资源及六组参数化布局关闭旧`41f4ecfe`阻断。Pause touch-began先于MoveTime/gameplay；modal覆盖触摸且按钮在release回调；Resume保持engine paused并执行3秒countdown后恢复，Retry fresh、Abort与两类cancel均使用opaque one-use命令。Android Back进入右侧Resume；Desktop native X仍是平台关闭。
- 自然结束仍进入Rehearsal结果；使用MoveTime后的原作结果语义不得被当作普通Live结果。

依据：PLP-E01–PLP-E07、LR-R01、LR-C02与current committed Live no-input Game Over证据。Medley继承与premium Continue仍排除。

## MoveTime

- 仅Rehearsal可用。
- 原作按钮固定-5/+5秒，touch-began触发，moved/ended为空。
- 自动整数秒snapshot，不接收调用方checkpoint或任意目标。
- 后退目标从不晚于目标且最多提前16秒的snapshot重建；LR-R03/LR-R05观察到`returnTime(5) -> advanceTime(16,true)`。
- 前进观察为`advanceTime(5,false)`；目标为当前整数秒加5并限制在BGM时长的整数秒上限。若当前时钟已超过该整数边界，保留当前小数时刻，不倒退。
- 重建复用Float32 ordinary pipeline、禁止外部输入，经过GameState 14/15/16，Stop Music后以`trunc(InGameSec*1000)`Load Music并恢复。
- Note、Command、Record、chart-owned Skill appearance、render、particle和audio必须作为一个事务恢复；不允许clock-only seek。

定位恢复前按原作清零当前Combo、清除singleGameOver、恢复Life=1000及默认1000/2000边界；启用的AP提示重新开始，历史判定计数不清零。HUD清除旧判定、连击和AddScore，重置Life动画；Record与HUD在同一事务中发布。练习重建历史保留这些恢复边界，连续定位不会丢失先前的重置。CS-V1仍按目标恢复分数与已消费计分单元。

定位新生成的推进帧使用GameState 14：输入不分发，音符按`IsAutoPlay || GameState == MoveTime`选择强制Perfect，且不触发普通播放的自然结束迁移。会话Manual/Auto身份不改变。历史中的定位推进帧保留此语义，不能重放成空输入Manual帧；已发生的手动判定不重算。Garupa扩展沿用相同定位政策，跳过已消费节点并推进连接链游标。Long/Slide头部强制判定后进入Stop，Slide终端仍使用终端判定类型。原作依据为已交付`manual-input-runtime-contract-10-1-4/arm64`的Single/Long/Slide分支、Began和尾部处理；22个相关导出1,817条指令与锁定ELF字节一致，Single分支8组原指令执行结果与实际MoveState选择一致。此项验证不代表全功能算法闭合。

依据：LR-E03–LR-E20、LR-R03–LR-R05、LR-C03；Reverse `baea2e8843245efbbd91611c0118bcf69314efa2` 的 `live-rehearsal-runtime-contract-10-1-4/move_time_boundary_correction.json` 及 `e7b3d8ac42e661bddc087d878b6f60f1b3a5d19e` 的 `move_time_resume_life.json`。后两项已核对9个原作指令窗口576字节；实际Record对照4组原作执行输出、20个恢复字段一致，分数/计数/历史最大值保留。HUD消费与事务路径源级核对、两级TypeScript及运行合同检查通过；未新增测试文件或运行应用。

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
