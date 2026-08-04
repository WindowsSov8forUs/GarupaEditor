# 模拟器音频阶段任务书

## 1. 阶段身份与当前状态

- 阶段：模拟器彻底重构实施块7——音频。
- 上级计划：`tmp/simulator-reconstruction-plan.md`“后续实施块 / 7. 音频”。
- 上游：第一切片、谱面构造、时钟与调度、Auto Live、手动输入与判定、分数/生命/状态、资源与Pixi渲染均已关闭；HABAHIRO当前交付路线另有专项记录。
- 阶段起点提交：GarupaEditor `5b2d39ec647f1ae34ee4cca4a2d6d6038de16a16`；本次整理前任务书提交/分支HEAD为`7bfecd9f08c11164072e460b4314ea3eac6d4aeb`，`origin/codex/refactor-simulator-implementation...HEAD = 0 0`。
- 上游资源/Pixi验收：`tmp/simulator-resource-pixi-rendering-acceptance.md`。
- HABAHIRO专项：`tmp/simulator-habahiro-approximation-task.md`、`tmp/simulator-habahiro-approximation-acceptance.md`。
- 目标分支：`codex/refactor-simulator-implementation`；不得新建或切换分支。
- 锁定原作样本：`jp.co.craftegg.band` 10.1.4（version code 230，`arm64-v8a`）。
- 锁定`libil2cpp.so` SHA-256：`815DF62582B35F3EF2223AB033FAC6DC909DE492D548DD28950BF1F98F058D8F`。
- 锁定`global-metadata.dat` SHA-256：`298D92CB0DC44B11681C5478F3BB08CE5476321361CE962096095CC31812961F`。
- 当前可消费Reverse基线提交：`ab5cc366a4a03d24a215e379849824e5ddf5f72f`；只消费该提交及其祖先中已提交、已push、可校验对象。
- Reverse本地进展：`10aae92078cc283303a39f907dcb5b4e39442576`（`evidence(audio): 晋升10.1.4完整音频静态契约`）已形成464方法、19布局、13枚举和471个新增文件的**本地候选提交**，但当前`origin/main...HEAD = 0 1`，因此尚未晋升为Garupa可消费证据。
- Reverse工作树存在大量与本阶段不可混用的已修改/未跟踪对象；其内容以及`.claude/`、`runtime/tools/`和本地IDA数据库一律排除。只有显式限定到提交对象并通过校验、push后的音频证据才可消费。
- 当前状态：**AU00任务书已完成；AU01已有未push静态候选，AU02 runtime/resource/oracle与AU03冻结授权均未关闭。后续严格分为“统一一次性取证阶段”和“落地实现阶段”：AU01–AU03、V01、D01–D32及AU-C01–AU-C40证据先全部关闭，再一次性解锁AU04–AU12；禁止边取证边实现。**
- 计划证据包：`tmp/simulator-reverse-evidence/audio/`；只在Reverse新证据提交并push后创建。
- 计划验收记录：`tmp/simulator-audio-acceptance.md`；AU12创建。

本任务书是实施块7的当前执行依据。它与`CLAUDE.md`冲突时，以本任务书为准；它不得放宽“Reverse唯一行为依据、失败关闭、10.1.4版本隔离、隐私最小化、证据先提交后实现”的要求。

### 1.1 阶段目标

本阶段只恢复10.1.4证据闭合的游戏内音频职责，并将其映射为可移植的确定性合同与Web Audio后端：

1. 恢复BGM资源选择、准备、起播、显式seek/start offset、播放中状态、结束、停止与已确认Fade路线。
2. 恢复判定音的silent gate、普通Good/Great/Perfect、Flick、Directional Flick及Multiple Directional组合和同帧顺序。
3. 恢复Long/Slide Hold循环音的开始、稳定owner identity、循环区间、Fade、停止、Miss/deactivate及pause/resume行为。
4. 恢复Skill、Audience、Fever Ready/Start/End、Full Combo、Game Over等当前production路径实际可达的局内SE；每一路都必须有10.1.4证据，不从BMS文件名猜路由。
5. 恢复master/BGM/SE option输入、请求音量、cue/ACB/bus控制与Float32乘法顺序中可移植且已确认的部分。
6. 恢复音频固定pool、voice/resource identity、同时播放、复用、结束回收、pause/resume和dispose中已确认的生命周期。
7. 建立版本化、不可变、哈希锁定的音频resource profile；engine不读取文件、URL、ACF/ACB/AWB/HCA/MP3/WAV字节或Reverse profile。
8. 建立typed、不可变、session-bound semantic audio commands；Web Audio只消费engine已确认的领域事实，不author判定、Note、Skill、Fever、Game Over或music clock。
9. 建立recording backend、确定性offline audio backend、固定command oracle和PCM oracle；测试期间不联网、不调用Python、不依赖实时AudioContext wall clock。
10. 保持CRI mixer/backend调度、Android native voice latency、设备buffer、硬件呈现、浏览器resampling和`AudioContext.baseLatency/outputLatency`为显式平台边界，不添加猜测固定延迟。

“完成音频阶段”不表示已恢复CRIWARE二进制级实现、原HCA解码完全一致、Android设备输出延迟、角色语音/MV/Live2D、Photon远端音频、Unity DSP像素级等价、DOM/Tauri输入或主程序接入。

### 1.2 锁定决策

1. `GirlsBandParty-Reverse`是唯一原作行为依据。旧Python audio renderer、浏览器音频经验、BMS的`#WAV`名称、Bestdori镜像和已删除旧模拟器都不能独立授权生产行为。
2. 本阶段只接受10.1.4/230证据。所有10.1.3/229调查降级为`AU-Hxx`发现线索；即使方法名、cue名、资源hash或地址delta看似相同，也必须在当前样本逐项重证。
3. AU01–AU03构成一个不可穿插production的“统一一次性取证阶段”。“一次性”指先前置覆盖整个Audio surface并关闭全部门禁，不要求把自然场景压缩到一次物理运行或一个Git提交；允许为稳定性分多次自然采集，但必须使用同一版本、schema、allowlist、alias/sequence规则和总closure。
4. AU01必须按managed owner/method/signature逐项重解析当前方法、布局、枚举、常量和调用边界；禁止统一RVA平移或仅凭signature unchanged宣称语义不变。现有`10aae920...`仅是未push候选，必须先在干净提交对象上校验并push，不能据此提前实现。
5. AU02在同一取证总阶段内一次性关闭自然运行时调用序、对象identity、Float32参数、BGM播放头、Hold生命周期、pause/resume、资源profile和固定事件oracle；禁止memory write、return replacement、managed invocation、synthetic event或合成Note注入。
6. AU03必须在全部Reverse证据提交并push后统一冻结source/copy/index三方可校验证据包。AU01–AU03、V01、D01–D32和AU-C01–AU-C40 evidence expected全部关闭前，禁止修改音频production、测试入口或package scripts。
7. `engine/`不得导入DOM、`AudioContext`、`AudioNode`、React、Pixi、Tauri、编辑器类型、资源URL、文件系统API、codec decoder或Reverse profile。
8. engine只发送typed semantic command，不发送`AudioBuffer`、`AudioBufferSourceNode`、`GainNode`、callback、Promise、文件字节或backend时钟对象。
9. Web Audio后端不得读取Note/Score/Life/Skill/Fever manager来决定播放什么，也不得把`AudioContext.currentTime`反馈为music position或判定时钟。
10. resource provider只提供profile声明且length/hash匹配的字节。资源准备天然异步，必须在`createSimulatorEngine`前完成；未ready、缺资源、hash mismatch或decode失败必须在领域owner创建前失败关闭。
11. 本地资源与显式网络provider是portable delivery选择，不是原作行为。AU-D31关闭前不得新增网络实现；若最终允许网络，只能由宿主显式选择、固定HTTPS allowlist、长度/hash校验且禁止自动fallback，测试仍必须离线。
12. portable MP3/WAV镜像与原作CRI HCA不是字节等价。profile必须声明`exact-current-cri`、`current-external-portable`等provenance/fidelity；不得把外部镜像标记为exact CRI parity。
13. 不允许从一个fidelity自动回落到另一个。exact资源缺失必须在任何audio object/voice mutation前返回`evidence-required`；portable路线必须由调用者显式选择。
14. BGM、one-shot和Hold loop必须使用engine稳定voice/resource identity。backend不得按cue名、noteIndex、数组位置或当前空闲node猜测owner。
15. 原作固定pool、独立one-shot pool、voice reuse/steal/exhaustion边界必须由当前证据关闭。未知时不得动态扩容、覆盖最旧voice、丢弃命令或无限并发。
16. 同帧命令保持原始提交顺序；Flick与result cue、particle与audio、多个判定、Skill/Fever命令不能排序、合并或去重。
17. 所有Float32输入、增益乘法、fade插值、seek、sample/frame换算和边界比较必须按证据显式实现。不得用Web Audio默认gain、loop、channelCountMode或浏览器隐式clamp补齐。
18. `AudioContext.currentTime`只能作为portable transport schedule；engine clock仍是领域时间owner。是否需要BGM playback-head观测、校正或seek必须由D05关闭，不能根据浏览器漂移经验增加周期纠偏。
19. pause必须沿用上游scheduler冻结、不追赶wall clock的已确认边界；具体BGM/SE/Hold pause顺序和resume offset必须由D14/D15的当前audio trace确认。
20. Web Audio的“暂停”若需要stop并在resume重建`AudioBufferSourceNode`，这是portable mechanism；它必须保留同一engine voice identity、精确offset和命令顺序，不宣称原作也重建node。
21. autoplay/user gesture、context suspended/interrupted/closed、decode能力和context loss属于宿主/backend capability。未满足时返回结构化失败，不自动静音、不伪造已播放、不推进audio state。
22. 实时Web Audio输出不作为确定性expected。固定oracle必须基于engine command和离线PCM；浏览器smoke只验证能力映射与生命周期。
23. 旧实机Perfect offset分布不得转换为固定`latencyMs`。尤其禁止把median `21.168510 ms`、BGM intercept或设备报告latency写入engine/backend默认值。
24. backend prepare、batch preflight、domain mutation和command commit必须构成两阶段边界。后一个非法命令不能留下前一个voice、sequence、gain或领域mutation。
25. 异步设备错误必须保留first terminal fault并在下一明确宿主边界可见；不得吞错、自动重建context、回落无声backend或继续接受命令。
26. pause、resume、stop、dispose、重复调用和command-after-dispose的优先级必须由D28关闭。重复幂等不能借机追加伪音频事件。
27. recording snapshot不得暴露资源bytes、AudioNode、可写profile、callback或provider；只保留冻结的semantic commands、状态、identity和结构化fault。
28. production实现、evidence整理、resource provider、offline backend、Web Audio backend、测试与验收文档分批提交；任何单批绿色不能关闭阶段。
29. 不修改`App.tsx`、编辑器控制器、窗口路由、启动载荷或移动端Activity；主程序音频解锁/入口属于实施块9。

### 1.3 执行进度

| 任务 | 状态 | 完成标准 |
| --- | --- | --- |
| AU00 建立并整理阶段任务书 | **已完成** | 范围、统一取证优先级、证据矩阵、硬门、oracle、批次和完成定义写入本文档 |
| AU01 10.1.4静态重基线 | **本地候选完成，尚未晋升；阻塞生产** | `10aae920...`从干净提交对象复验通过、限定音频scope、push后远端`0 0`，且全方法/布局/枚举/常量无blocking finding |
| AU02 统一实体runtime、资源、portable与oracle取证 | **未开始；阻塞生产** | 使用统一plan/schema/allowlist自然覆盖BGM/判定/Hold/辅助SE/pause/lifecycle，关闭resource/profile/mapping和全部fixed expected |
| AU03 统一冻结证据包与production authorization | **未开始；阻塞生产** | 全部Reverse证据已push；source/copy/index verifier、V01、D01–D32、AU-C01–AU-C40与production authorization关闭 |
| AU04 typed audio合同与recording backend | 未开始 | immutable profile/command/session/voice/preflight/state machine关闭 |
| AU05 资源provider与offline backend | 未开始 | hash/decode metadata、gain/loop/fade/mix和固定PCM oracle关闭 |
| AU06 BGM producer | 未开始 | load/start/seek/playhead/pause/resume/stop/end命令匹配 |
| AU07 判定音producer | 未开始 | silent/standard/flick/directional/multiple/同帧pool顺序匹配 |
| AU08 Hold producer | 未开始 | Long/Slide loop owner、fade、stop、miss/deactivate/pause匹配 |
| AU09 辅助局内SE与音量 | 未开始 | Skill/Fever/FullCombo/GameOver及master/BGM/SE gain匹配 |
| AU10 Web Audio backend | 未开始 | decode/graph/schedule/voice/pause/resume/dispose与capability failure关闭 |
| AU11 lifecycle/failure集成 | 未开始 | whole-frame atomicity、first fault、snapshot、重复调用和cleanup关闭 |
| AU12 production oracle与独立验收 | 未开始 | command/PCM digest、全隔离回归、验收文档和远端同步通过 |

### 1.4 AU00初始盘点

- 完整重读总体计划实施块7、资源/Pixi任务书和上游host/backend/OneFrame/lifecycle边界。
- AU00建立时核验Garupa `5b2d39ec...`与Reverse `ab5cc366...`均和各自远端`0 0`；本次整理时Garupa已到`7bfecd9...`且远端`0 0`，Reverse出现未push的音频静态候选`10aae920...`并领先远端1提交。该候选及Reverse脏工作树在push/校验前均不作为production证据。
- 当前`SimulatorBackends.audio`仍是通用`SimulatorBackendPort.record()`，没有typed profile、资源preflight、voice identity、offline mixer或Web Audio实现。
- 当前10.1.4证据确认`onJudgeNote`分派和Long/Slide局部Hold调用，但未冻结BGM、cue literal、完整SoundManager/CRI链、gain、pool、资源或audio pause行为。
- 当前clock trace只确认scheduler pause冻结与resume不追赶，不能外推“音频也已暂停”或resume offset。
- 盘点10.1.3历史调查，确认其足以生成current target list，但全部保持`discovery-only`。
- 旧real-play BGM与judge cue分析均是分布/线性对齐，不提供可写入portable backend的固定latency常量。
- 本批只整理任务书和执行队列，不创建证据包，不修改`src/simulator/**`、测试、package scripts或主程序，不运行Vite/Tauri/整体构建。

### 1.5 本次对话执行列表（统一取证优先）

以下列表在本文档整理完成后保持等待；只有用户明确下达开始命令才从`E01`继续。`E01–E08`全部属于同一个统一取证总阶段，期间不得进入`I01–I06`。

| 顺序 | 任务 | 交付/硬门 | 当前状态 |
| --- | --- | --- | --- |
| P00 | 审计并整理任务书 | 锁定当前双仓库状态、统一取证路线和执行列表 | **已完成；blocked等待命令** |
| E01 | 隔离并复验现有静态候选 | 仅从`10aae920...`提交对象复验464方法/19布局/13枚举/哈希；不读取或清理Reverse无关脏工作树 | 待命令 |
| E02 | 晋升AU01静态证据 | 修复候选自身blocking（若有），限定scope提交/push，确认Reverse远端`0 0` | 待命令 |
| E03 | 建立统一runtime/resource取证协议 | 一次性冻结全场景coverage matrix、hook allowlist、trace schema、匿名化、verifier、设备恢复和失败重采规则 | 待命令 |
| E04 | 执行全场景自然runtime采集 | 覆盖BGM、standard/Flick/Directional/Multiple、Long/Slide、Skill/FullCombo/GameClear/GameOver、pause/resume、song end/dispose；允许多次自然run，不允许合成事件 | 待命令 |
| E05 | 完成资源与portable mapping | 冻结current ACF/ACB/AWB/HCA metadata、资源/镜像provenance与hash、gain/pool/fade/seek/decode/WebAudio边界 | 待命令 |
| E06 | 生成统一closure与固定expected | 关闭V01、D01–D32、AU-R01–AU-R11及AU-C01–AU-C40 command/PCM expected；任一blocking非空则留在取证阶段补采 | 待命令 |
| E07 | 提交并push完整Reverse证据 | 校验、最小化、中文提交、push，确认`origin/main...HEAD = 0 0`；记录最终锁定commit | 待命令 |
| E08 | 冻结Garupa证据包并授权 | 创建audio manifest/OPEN_GAPS/verifier/fixtures，source/copy/index三方通过且`production_authorization=true` | 待命令 |
| I01 | typed合同与recording backend | 对应AU04；production与test分提交 | E08后 |
| I02 | resource provider与offline backend | 对应AU05；固定PCM oracle，不联网/不调用Python | E08后 |
| I03 | BGM、判定、Hold及辅助SE producer | 对应AU06–AU09；按证据顺序拆分production/test提交 | E08后 |
| I04 | Web Audio backend | 对应AU10；只做portable映射，不author领域时间 | E08后 |
| I05 | lifecycle/failure总集成 | 对应AU11；原子preflight、first fault与cleanup闭合 | E08后 |
| I06 | production oracle与独立验收 | 对应AU12；fresh build、上游隔离回归、acceptance、push与远端`0 0` | E08后 |

开始实现的唯一解锁条件是：`E01–E08`全部完成、Reverse与Garupa证据校验绿色、D01–D32无blocking、AU-C01–AU-C40 expected齐备且`production_authorization=true`。任何补证都必须回到统一取证总阶段完成，不能在某个producer实现中临时补一个cue或常量。

## 2. 固定范围

### 2.1 纳入范围

- `InGameManager`的BGM准备/起播/播放中更新/停止、判定SE路由、pause/resume及局内终止音频职责。
- `MusicManager`中局内BGM、SE及其明确被当前调用图消费的桥接方法。
- `CE.SoundManager`、`CE.BgmPlayer`、`CE.SePlayer`、`CE.SoundPlayerBase`、`CE.SoundResource`中局内路径实际消费的方法、字段、pool和callback。
- CRI调用链只恢复到semantic/native submission boundary；不重写CRI内部mixer或Android driver。
- chart BGM logical identity、当前APK/cache的ACF/ACB/AWB/HCA profile及经证据授权的portable镜像。
- 普通Good/Great/Perfect、Flick、Directional、Multiple Directional和silent/move-time gate。
- Long与Slide Hold loop：start、owner、loop range、fade、stop、miss、deactivate、pause、resume和dispose。
- 当前局内自然路径实际可达的Skill/Audience、Fever、Full Combo、Game Over SE与BGM终止行为。
- master/BGM/SE option、requested volume、cue/ACB/bus gain中证据闭合的值和乘法顺序。
- typed audio profile/command、recording backend、local resource provider、offline deterministic backend和Web Audio backend。
- initialize、outer frame/substep、same-frame、pause、resume、fault、Game Over、song end和dispose oracle。
- ordinary与HABAHIRO production chart；若两者音频角色不同，必须分别闭合，不以ordinary外推HABAHIRO。

### 2.2 排除范围

- CRI HCA decoder、CRI category mixer、voice priority、DSP、Android native renderer和设备buffer的内部逐指令复刻，除非AU01–AU03另行闭合并明确纳入。
- 角色语音、Live2D、MV/movie、背景演出、菜单、故事、Gacha和非局内音乐。
- Photon远端成员语音、网络到达延迟、房间/账号/队伍隐私字段。
- Unity ParticleSystem、Pixi HUD和audio输出波形之间的设备级最终同步；managed command顺序仍纳入。
- 浏览器实现之间的codec细节、resampling滤波器、speaker layout、hardware latency和OS mixer。
- 未经证据确认的pitch/pan非零变换、seek rounding、loop crossfade、ducking、normalization或limiter。
- DOM/Tauri输入、用户手势UI、主程序AudioContext创建时机、编辑器窗口接入和移动端路由。
- 原作资源二进制直接纳入版本库的法律/分发决定；任务只允许经决策批准的最小fixture和metadata/hash。
- GarupaEditor整体构建与应用联调，直至AU12明确允许的隔离验证节点。

## 3. 强制执行规则

1. AU01–AU03必须作为统一取证总阶段完整执行；V01、D01–D32、AU-R01–AU-R12及AU-C01–AU-C40 evidence expected全部关闭前，禁止实施AU04–AU12 production与本阶段package test入口。
2. 新证据先在Reverse形成最小、可复验提交并push，再统一冻结到Garupa；严禁引用Reverse未push提交、未提交文件、local capture、IDA数据库或`runtime/tools/`。不得在AU04–AU12之间穿插补证后继续写代码。
3. 证据包每项记录Reverse commit、相对路径、字节数、完整大写SHA-256、sample、状态和消费任务；`verify.mjs`必须校验source/copy/index三方。
4. 10.1.3的`AU-Hxx`不得进入最终confirmed manifest，不得成为production evidence ID，也不得通过“方法字节相似”自动晋升。
5. 静态摘要、README、Python prototype与ARM64/raw runtime冲突时，先修Reverse contract/closure，再更新本文档，最后改代码。
6. 每个cue、field offset、enum、constant、pool slot、voice transition、Float32 bits、comparison、list mutation、callback和command order必须指向最终`AU-E/R/C`证据。
7. Reverse runtime采集只能observation-only：hook entry/return和只读对象字段；禁止写内存、替换返回值、调用managed方法、注入synthetic Note/command或patch APK。
8. runtime trace只保留technical cue/resource key、匿名object/voice/thread alias、相对frame/substep和Float32 bits；禁止账号、房间、成员、卡牌、Skill显示文本、raw pointer和绝对设备路径。
9. production/test不得读取`tmp/simulator-reverse-evidence`、Reverse工作树或Python，不得在测试期间联网。
10. 所有资源在engine创建前完整preflight。后一个资源/metadata非法不能留下前一个decoded buffer、voice、cache ref或领域对象。
11. 所有runtime command batch在领域mutation前完整验证。后一个command非法不能留下前一个sequence、voice、gain或Note/OneFrame状态。
12. backend不得根据资源时长自动改变Game State、判定、Combo、Skill/Fever或Note lifecycle；结束事件只回报/维护backend own voice状态。
13. 未确认行为返回`evidence-required`；不得no-op、静音、clamp、默认gain 1、默认fade 0、默认loop=false、默认seek 0或自动停止替代。
14. 测试不得写private state、调用private实现、注入expected cue/voice ID、从待测实现生成expected digest，或用sleep/real AudioContext时间断言顺序。
15. `Math.fround`、整数转换、sample index、channel fold、PCM clipping和gain顺序逐处按evidence profile实现，不建立全局“常见音频公式”。
16. terminal lifecycle/fault优先于resource、command、delta和domain校验；snapshot必须深冻结且不泄漏可写对象。
17. 每个production批与对应test批分离；AU12从已提交production/test的fresh临时编译产物独立运行。

## 4. 目标架构与所有权

```text
host-selected immutable audio profile + prepared provider/backend
  -> createSimulatorEngine preflight
      -> original-domain audio owners
          BGM lifecycle owner
          judgement audio owner
          Long/Slide hold owner
          Skill/Fever/GameOver audio owner
              -> immutable typed semantic command batch
                  -> RecordingAudioBackend
                  -> OfflineAudioBackend (deterministic oracle)
                  -> WebAudioBackend (portable live output)

resource provider -> validated bytes -> backend decode/cache
engine --------------------------------X no bytes / URL / codec / AudioNode
WebAudio clock -------------------------X no domain-time authorship
```

### 4.1 Host与resource profile边界

最终host输入只能包含AU03确认的原始选择和资源事实，例如：

- sample、pack identity和显式fidelity/provenance；
- logical asset ID、cue role/sheet/name、byte length、SHA-256、codec、sample rate、channel count和证实的loop metadata；
- 用户master/BGM/SE option原始输入及其合法范围；
- BGM logical identity和原作本来读取的start/seek输入；
- backend capability profile及宿主已完成的异步prepare结果。

host不得提供：

- “本Note应播放Perfect”“当前应启动Hold”“Fever现在开始”等领域结果；
- 预计算最终gain、最终sample offset、期望voice slot、command sequence或expected digest；
- `AudioBuffer`、AudioNode、manager/note对象、private owner ID或可跨session复用handle；
- 猜测latency、默认fade、默认pool size或fallback资源。

profile必须深复制、深冻结、sample/session绑定且无alias。非法hash、重复logical ID、重复cue binding、不完整channel route、未知fidelity或unsupported codec必须在engine对象图创建前失败关闭。

### 4.2 Engine audio producer边界

- BGM owner读取已确认的领域起播/seek/pause/resume/stop事件，生成命令，不读取backend播放头作为music clock。
- judgement owner消费原作已生成的immutable judgement/note事实，执行silent/type/cue route；backend不重算result或note family。
- Hold owner绑定concrete Long/Slide stable identity；start/fade/stop命令不能只携带cue字符串。
- Skill/Fever/GameOver owner只消费对应manager已确认transition；不能让backend监听snapshot差异自行推断。
- 每个command至少具有session、连续sequence、原作时间锚、stable voice/resource identity和typed payload；字段、单位及是否Float32由D26关闭后锁定。
- producer必须支持一次性preflight/discard/commit capability；失败或discard不消耗sequence、不污染voice inventory。

建议文件边界，名称可在AU04按最终证据微调：

```text
src/simulator/
├── engine/audio/
│   ├── audioCommandProducer.ts
│   ├── bgmAudioOwner.ts
│   ├── judgementAudioOwner.ts
│   └── holdAudioOwner.ts
├── backends/
│   ├── audioContracts.ts
│   ├── audioValidation.ts
│   ├── recordingAudioBackend.ts
│   └── audio/
│       ├── offlineAudioBackend.ts
│       └── webAudioBackend.ts
└── backends/resources/
    ├── audioResourceProfile.ts
    └── audioResourceProvider.ts
```

### 4.3 Backend边界

- Recording backend只验证profile/session/sequence/voice state并记录冻结命令，不生成PCM、不调用浏览器。
- Offline backend只消费已验证decoded PCM/profile与semantic commands，按证据执行mix/loop/fade/gain并输出确定性数据；它不是原作API。
- Web Audio backend只映射prepare/decode、buffer source、gain graph、start/stop/recreate和context状态；不读取engine manager。
- Web Audio backend必须显式设置所有证据要求的node参数；不得依赖浏览器默认loop/gain/channel/panner行为。
- browser不支持某codec、context未running、context已closed或node operation throw时，保持first structured fault，不切换无声实现。
- backend允许为Web Audio一次性source语义重建node，但engine voice identity、资源引用和pause offset必须保持可审计。

### 4.4 时间与pause边界

- 上游`InGameMusicScoreController`/`NoteManager`是领域music position owner。
- 音频命令的时间锚必须来自当前outer frame/substep/music position证据；不能用Pixi ticker或AudioContext时间替换。
- prepare/decode发生在session外，不消耗engine frame。
- pause期间scheduler不推进；audio backend必须按D14确认的范围冻结或停止，resume不得补播paused wall-clock。
- 若BGM需要从sample offset重建，换算、rounding、loop和end边界由D04/D05/D22证据固定。
- native/device/browser latency只作为profile capability/诊断数据，不进入判定、music position或默认schedule补偿。

## 5. 当前可直接复用的10.1.4证据

以下均来自Reverse提交`ab5cc366a4a03d24a215e379849824e5ddf5f72f`。它们只授权表中边界，不代表音频阶段已关闭。

| ID | Reverse路径 | 字节 | SHA-256 | 可直接确认的边界 |
| --- | --- | ---: | --- | --- |
| AU-E01 | `artifacts/investigations/package-version-rebaseline-10-1-4/README.md` | 6163 | `5E37640F8F9F0B24E10B016606FE46E9361F4005606BE82EBC00FF44761E09B5` | 10.1.4样本身份与禁止跨版本外推 |
| AU-E02 | `artifacts/investigations/package-version-rebaseline-10-1-4/version_map.json` | 45298 | `70E9C5981269F3096F384FF85D50A6DEA2855399984DDF59B6664306634DE48B` | bounded clock target地址；不授权未列audio语义 |
| AU-E03 | `artifacts/investigations/manual-input-runtime-contract-10-1-4/closure.json` | 3734 | `5663C186B67F62E6BEEFB62E67983DE878FD5FEB68590154C7596A4FC3FD5DC2` | current sample/static contract已校验；audio是non-blocking boundary |
| AU-E04 | `artifacts/investigations/manual-input-runtime-contract-10-1-4/manual_input_static_contract.json` | 578113 | `14626F571BECF45EBA9D4045F5C2EE3F991387A6562BD4BAF351E87A88EA973C` | current方法映射及Long/Slide/onJudge原始入口 |
| AU-E05 | `artifacts/investigations/manual-input-runtime-contract-10-1-4/arm64/032fbc6c__InGameManager__onJudgeNote.arm64.tsv` | 4348 | `303AD94E1D99F08547EB1C9A0D9EBBE838A6C704023D9DA92267DF10788444EE` | `ShouldSilent`、move-time gate、type mask `0x6E8`、flick/standard分派 |
| AU-E06 | `artifacts/investigations/manual-input-runtime-contract-10-1-4/arm64/030e0130__NoteFrontBase__judgeFrontNote.arm64.tsv` | 12370 | `46E8C3CCD63301255094BAE2375BA65478160512DB29E276F67CEC4665A548A1` | current `PlayAnimation`在`OneFrameData.Setup`和delegate前；完整audio submission仍未闭合 |
| AU-E07 | `artifacts/investigations/manual-input-runtime-contract-10-1-4/arm64/030eaedc__NoteLong__ExecTouchBegan.arm64.tsv` | 6257 | `0C397F222725EC8DF401F7F0364443C9C656B9EBA718E463CB4BF9C82F915548` | Long调用`PlaySELoop`，请求volume=1/fade=0并保存resource；cue未闭合 |
| AU-E08 | `artifacts/investigations/manual-input-runtime-contract-10-1-4/arm64/030ebe10__NoteLong__FadeoutLongNoteSound.arm64.tsv` | 1779 | `5E7B9CE39CEF9FF7468B7BD55F72284CD201B103300DF8736E3D7383708C3999` | current volume到0、stop-at-zero的Fade调用形状；duration值未冻结 |
| AU-E09 | `artifacts/investigations/manual-input-runtime-contract-10-1-4/arm64/0321ba8c__NoteSlide__ExecTouchBegan.arm64.tsv` | 17885 | `47BE828D451D8B41C8A95BC9326C6704F8339D247BC8CDC199376FF00A81A148` | Slide调用`playTouchKeepSound`；callee/cue/resource参数未冻结 |
| AU-E10 | `artifacts/investigations/manual-input-runtime-contract-10-1-4/arm64/0321e90c__NoteSlide__FadeoutSlideNoteSound.arm64.tsv` | 1779 | `FD09D5B5FD590413D26C2CF7212A04B62CDF361890B514A3987D58CE33F988B9` | Slide current volume到0、stop-at-zero的Fade调用形状；duration值未冻结 |
| AU-E11 | `artifacts/investigations/clock-scheduling-runtime-oracle/closure.json` | 15313 | `442263A74CCCE65BC029C4C8A246D9563EEE32DD506AFF76798B045CF6622EDD` | 10.1.4 pause sample与scheduler gate，非audio device证据 |
| AU-E12 | `artifacts/investigations/clock-scheduling-runtime-oracle/summaries/pause_during_bpm_10_1_4.json` | 3445 | `A61535952FECCFFB935F671E2D44CC6B38AECC70BCAFF9FD62B90CEB8B1490E4` | current pause/resume保持BPM对象并恢复scheduler；未记录audio调用/播放头 |

### 5.1 当前证据允许与禁止的结论

允许：

- 当前`onJudgeNote`先执行silent/move-time gate，再按note type选择flick或standard入口。
- 当前Long直接请求一个loop resource；Long/Slide的若干结束路径进入Fadeout。
- 当前Long/Slide Fadeout读取正在播放source的current volume，目标为0，并设置到零停止标志。
- scheduler pause期间music/note领域时间冻结，resume不补算暂停wall time。

禁止：

- 把10.1.3的cue名、pool size、0.3秒Fade、gain、CRI chain或pause order直接写入10.1.4实现。
- 把current rodata地址`0x1536728`解释为某值，除非AU01冻结其字节/Float32 bits。
- 从`PlaySELoop`的volume=1推导最终听感gain或MasterOut值。
- 从scheduler pause推导BGM/Hold/one-shot已经pause或resume offset。
- 从BMS `#WAV`声明推导runtime真正调用的cue、cue sheet、资源格式或播放顺序。

## 6. 10.1.3历史迁移候选

以下同样来自Reverse提交`ab5cc366...`，全部是`discovery-only`。它们只用于AU01/AU02目标设计。

| ID | Reverse路径 | 字节 | SHA-256 | 发现线索，不是current授权 |
| --- | --- | ---: | --- | --- |
| AU-H01 | `artifacts/investigations/perfect-judge-se-cri-start-chain/perfect_judge_se_cri_start_chain.json` | 7969 | `198832B07F3AB6337CC0A0018D5829BB95A1D3A005C9976EB37CEDD0645EA04F` | Perfect到CRI native Start同步链、旧pool与renderer候选 |
| AU-H02 | `artifacts/investigations/perfect-particle-audio-trigger-order/perfect_particle_audio_trigger_order.json` | 5973 | `11D7A8862A30F57854BF6CE3430818EA236C93F7433861AD842DDCF3249F4330` | 旧版particle request先于audio submission |
| AU-H03 | `artifacts/investigations/runtime-integration-prototype/judge_cue_routes.json` | 2265 | `F38DEC8F61A22F642415134189C61A1FA161E01602E809A5D2DB6196726799DC` | Good/Great/Perfect及Flick/Directional/Multiple cue候选 |
| AU-H04 | `artifacts/investigations/judge-cue-portable-resources/judge_cue_portable_resources.json` | 5955 | `DDE000C24C0A010D7150FE9F70538A6A1A623791FEF31927FA183BE7ABD56D99` | 8个旧cue role、原ACB metadata及Bestdori MP3镜像候选 |
| AU-H05 | `artifacts/investigations/production-bgm-resource/production_bgm_resource.json` | 3560 | `44FA4C6A73A5A96584790E0C8D0193B363CEDC93C54AF6BFA0E3F51D2146313F` | `bgm003` chart/song/bundle/portable resource候选 |
| AU-H06 | `artifacts/investigations/portable-audio-gain-chain/portable_audio_gain_chain.json` | 3047 | `E94C388D25246ED5C2E79E06FAAC5FEAADA5284062F9D576AE17C5D9CA6E8B8B` | 旧master×option×request×ACB×bus gain候选 |
| AU-H07 | `artifacts/investigations/portable-audio-backend/validation_results.json` | 304 | `6768301783505F17BC058D104C204DCA5E4776184AD37D6EECB4D8C7BE58378F` | 旧Python 32kHz mono PCM digest；只用于设计新oracle |
| AU-H08 | `artifacts/investigations/application-pause-resume/README.md` | 5229 | `2C2E5C4F38F68812FE330B0E8364CF411D83E362CD0ADB8ECAADC20B8CB2ECDF` | 旧global music/device/live-controller pause/resume顺序候选 |
| AU-H09 | `artifacts/investigations/real-play-bgm-alignment/real_play_bgm_alignment.json` | 3410 | `669E228618892D9E923F6CE5417F7130ACB64D47A75FAD3E9439B41D57B8CB8C` | 旧BGM 7 anchor与51.6ppm capture drift；intercept非latency |
| AU-H10 | `artifacts/investigations/real-play-judgement-cue-alignment/real_play_judgement_cue_alignment.json` | 22764 | `F44A98A78BE1E7C030BAE4C37C5448EB9DFEDDCED32F9380C3EB613EC2DED788` | 旧cue offset分布，证明不能猜单一固定延迟 |
| AU-H11 | `artifacts/investigations/skill-cue-portable-resources/skill_cue_portable_resources.json` | 2334 | `55EB4C07A54F3CA94E0C2EED25D3AF328BB003CBC5D2F2F7EBF3DDF69394D87A` | Skill/Audience旧route与portable资源候选 |

历史候选中的URL、cue字面量、pool数、sample rate、loop point、gain常量和PCM digest均不得进入production constant，直到对应AU-R证据在10.1.4闭合。

## 7. 10.1.4重验矩阵

下表的“当前”只统计已push、可消费证据。未push的`10aae920...`静态候选虽覆盖464方法、19布局和13枚举，但在E01/E02复验、push前不改变表中授权状态；晋升后必须一次性回填整张矩阵，不能只把某个producer改为closed。

| 领域 | 当前静态 | 当前runtime | 当前资源 | 必须新增 | 当前状态 |
| --- | --- | --- | --- | --- | --- |
| 样本与方法身份 | bounded closed | sample installed | n/a | AU-R01完整audio map | partial |
| BGM load/start/seek/stop/end | 无 | 无 | 旧候选 | AU-R01/R03/R08 | blocked |
| BGM播放头与engine clock | 无 | scheduler only | n/a | AU-R03/R09 | blocked |
| standard judgement | 只到entry dispatch | 无 | 旧候选 | AU-R01/R04/R08 | blocked |
| Flick/Directional/Multiple | type mask/entry partial | 无 | 旧候选 | AU-R01/R04/R08 | blocked |
| silent/move-time | static shape partial | 无 | n/a | AU-R04 fixed cases | blocked |
| Long Hold | start/fade partial | 无 | 旧候选 | AU-R01/R05/R08 | blocked |
| Slide Hold | delegate/fade partial | 无 | 旧候选 | AU-R01/R05/R08 | blocked |
| pool/concurrency/reuse | 无 | 无 | n/a | AU-R01/R02 | blocked |
| master/BGM/SE gain | 无 | 无 | 旧候选 | AU-R01/R07/R08 | blocked |
| Skill/Audience | 无 | 无 | 旧候选 | AU-R06/R08 | blocked |
| Fever/FullCombo/GameOver | 无 | 无 | BMS名不是route | AU-R06/R08 | blocked |
| pause/resume audio | method identity bounded | scheduler only | n/a | AU-R03/R05/R11 | blocked |
| stop/dispose/callback | 无 | 无 | n/a | AU-R01/R11 | blocked |
| CRI submission boundary | 无current | 无 | 旧候选 | AU-R01/R02 | blocked |
| WebAudio mapping | n/a | n/a | 无current closure | AU-R09 | blocked |
| deterministic command/PCM oracle | n/a | n/a | 旧Python only | AU-R10 | blocked |

### 7.1 必须新增的current证据ID

| ID | 必须关闭的对象 |
| --- | --- |
| AU-R01 | 10.1.4完整audio方法、layout、enum、literal、rodata与native submission静态profile |
| AU-R02 | 自然Live observation-only总trace：连续sequence、调用嵌套、匿名object/voice/pool alias与Float32参数 |
| AU-R03 | BGM load/start/seek/playhead/pause/resume/stop/end专用trace |
| AU-R04 | standard/Flick/Directional/Multiple/silent判定音路由与same-frame trace |
| AU-R05 | Long/Slide Hold start/loop/fade/stop/miss/deactivate/pause专用trace |
| AU-R06 | Skill/Audience/Fever/FullCombo/GameOver自然局内音频route或证据化blocking结论 |
| AU-R07 | master/BGM/SE option、requested gain、ACF/ACB/bus及Float32顺序 |
| AU-R08 | current APK/cache音频资源与portable镜像的provenance、length/hash/codec/control profile |
| AU-R09 | CRI职责到Web Audio/offline backend的逐项portable mapping与差异边界 |
| AU-R10 | AU-C01–AU-C40独立fixed command/PCM expected与canonical digest |
| AU-R11 | pause/context/device-loss/song-end/GameOver/dispose/fault lifecycle closure |
| AU-R12 | Reverse source、Garupa frozen copy和Git index三方hash closure |

## 8. V01与D01–D32硬门

### V01 整阶段版本重基线

- 对全部audio owner/method按10.1.4 metadata独立解析actual RVA/end/signature/ARM64 bytes。
- 对全部owner layout、enum、rodata、string literal和native import逐项冻结。
- 目标至少覆盖`InGameManager`、`MusicManager`、`CE.SoundManager/BgmPlayer/SePlayer/SoundPlayerBase/SoundResource`、Long/Slide audio方法及CRI submission wrapper。
- 输出`unknown_methods=[]`、`unknown_layouts=[]`、`unknown_constants=[]`或明确blocking finding；不得用统一delta关闭。

### D01 方法、类型与字段边界

完整方法范围、owner字段、resource/player/pool布局、enum和callback签名必须current confirmed。

### D02 command时间锚与managed顺序

确认BGM、particle、judgement、OneFrame、Skill/Fever、GameOver audio request在outer frame/substep中的相对顺序及是否同步到native submission。

### D03 BGM资源与load/start route

确认chart/music master到cue sheet/cue/resource的current route、load完成条件、start调用参数和首个playing状态。

### D04 BGM start offset、seek与rounding

确认输入单位、负/越界行为、ms/seconds/sample换算、rounding、codec delay、nonzero seek和song-end边界。

### D05 BGM播放头与时钟authority

确认原作是否读取CRI playback time、何时读取、是否纠偏，以及与`InGameMusicScoreController`关系。portable backend不得自行选择clock master。

### D06 silent与move-time gate

确认`TapSEStatusData.ShouldSilent`全部输入、result/note/multiple参数、move-time条件和silent时是否仍产生其他audio命令。

### D07 standard result cue

确认Good/Great/Perfect/Miss/Bad等每个result是否发声、cue identity、请求音量/pitch/seek和调用顺序。

### D08 Flick/Directional/Multiple组合

确认note type到cue、multiple count边界、Flick cue与result cue组合顺序、异常count路径及同owner资源。

### D09 one-shot pool与并发

确认pool数量、one-shot专池、slot选择、同帧多cue、voice steal/reject、结束回收、重入和exhaustion行为。

### D10 Hold开始、cue与loop

确认Long/Slide是否共用cue/player、开始条件、volume/fade参数、loop flag/range、resource owner和重复start行为。

### D11 Hold Fade数值与时钟

冻结fade duration Float32 bits、start current volume、target、interpolation、update clock、endpoint inclusion和stop-at-zero时点。

### D12 Hold cleanup

确认TouchEnded、timeout、Miss、deactivate、pool reset、GameOver、song end、pause和dispose各自调用Fade/Stop/clear owner的顺序。

### D13 辅助局内SE

确认Skill/Audience、Fever Ready/Start/End、Full Combo、GameOver及当前chart command触发的全部局内SE。不可达项必须保留blocking，不得用BMS文件名直接实现。

### D14 pause order与作用域

确认BGM、SE、Hold、global device和live-controller的pause调用顺序，已经结束/正在fade/一次性voice是否暂停，以及重复pause行为。

### D15 resume order与offset

确认resume调用顺序、BGM/Hold offset、fade continuation、已结束voice、next frame关系和wall-clock不追赶。

### D16 stop、end、callback与dispose

确认自然song end、GameOver、手动stop、session dispose、callback、resource release和pool回收顺序。

### D17 volume输入与合法范围

确认master/BGM/SE option来源、类型、范围、零值、变更时点、session中更新及非法值行为；不得猜默认设置。

### D18 gain乘法与Float32顺序

确认channel default、requested volume、ACB/cue/bus gain、每次`fround`、clamp/无clamp及写入source的最终顺序。

### D19 pitch、pan与seek参数

确认当前局内路径是否只使用零/单位参数；非零变换未闭合时必须拒绝，不实现通用WebAudio近似。

### D20 ACF/ACB category、bus、DSP与priority

确认production路径消费的category/bus/effect/priority字段；无法portable等价的字段分类为explicit backend boundary并决定是否阻塞。

### D21 resource provenance与decode profile

对每项current APK/cache资源和portable镜像冻结logical ID、length、hash、codec、sample rate、channels、sample count、loop、cue sheet/name及来源。

### D22 portable decode/resample/channel mapping

确认浏览器decode后允许的sample rate/channel差异、mono/stereo mapping、resampling边界、loop point换算和offline oracle格式。

### D23 WebAudio graph与schedule mapping

逐命令定义AudioBufferSource/Gain graph、start/stop参数、schedule anchor、node recreation、gain automation和可见差异；禁止默认参数。

### D24 autoplay、context与capability

定义unavailable/suspended/running/interrupted/closed、用户手势、decode failure和context loss状态机；任何能力缺失不得静默。

### D25 stable voice identity与fixed pool

定义engine voice ID、resource ID、pool slot、backend node lifetime、reuse和跨session伪造拒绝。

### D26 immutable command schema

锁定每个command kind、字段、单位、Float32 bits、session、sequence、frame/substep/music position和禁止字段。

### D27 whole-frame preflight与atomic commit

定义resource/voice/command validation、capability ownership、discard/commit、later-command failure零mutation和backend commit异常优先级。

### D28 fault、snapshot与重复生命周期

定义first fault、async fault可见点、snapshot字段、pause/resume/stop/dispose重复调用及command-after-terminal。

### D29 fixed command oracle

冻结初始化、完整production chart、same-frame、pause/resume、GameOver和dispose的typed command expected与digest；expected不得由TS实现生成。

### D30 fixed PCM oracle

冻结输入PCM/resource profile、mix窗口、sample format、Float32/clip规则、输出bytes和digest；实时WebAudio不参与。

### D31 resource delivery与network policy

明确本地/外部provider、allowlist/cache、hash、版权/分发和no-fallback。未关闭前production不得联网或提交原作二进制。

### D32 closure与production authorization

Reverse closure必须列出`unknown_fields=[]`、`blocking_findings=[]`、D01–D32状态、AU-C01–AU-C40状态和`production_authorization=true`；否则AU04继续禁止。

## 9. Reverse 10.1.4证据采集要求

### 9.1 AU-R01静态证据包

至少输出：

- sample identity、APK/ELF/metadata hashes和capability声明；
- managed target map与逐方法ARM64 TSV；
- owner layout、enum、string literal、rodata Float32 bits和native import；
- BGM、judge、Hold、auxiliary、gain、pause、dispose调用图；
- ACF/ACB/AWB/HCA结构化metadata和当前cache/APK provenance；
- 每项`confirmed/inference/unresolved`分类；
- extractor/verifier幂等结果和目录`SHA256SUMS`。

静态包不得包含完整APK、未最小化账号数据、IDA数据库或运行时工具依赖。

### 9.2 AU-R02 runtime trace

必须是自然可达局内流程，按场景分开记录：

1. ordinary chart自然BGM load/start/playing/end；
2. Auto Live普通Perfect及同帧多Note；
3. 物理输入获得Good/Great/Perfect、silent和Miss边界；
4. Flick、Directional及Multiple 2/3–7；
5. Long开始、保持、正常尾、Miss/timeout/deactivate；
6. Slide开始、intermediate、正常尾、Miss/deactivate；
7. BGM+Hold正在播放时pause/resume；
8. Skill/Fever/FullCombo/GameOver的自然触发；
9. song end和session dispose。

每个event至少记录：

- 连续sequence、相对outer frame、substep和当前music position；
- method entry/return与嵌套parent sequence；
- 匿名manager/player/resource/voice/note alias；
- technical cue/sheet/resource role；
- 每个float的十进制和Float32 bits；
- pool slot、playing/paused/fading/stopped状态；
- command前后owner字段的只读快照；
- native submission boundary是否在managed return前到达。

禁止为了覆盖case调用managed播放方法或写result/Note状态。自然无法到达的case保持blocking，不能合成替代。

### 9.3 AU-R03 resource与portable mapping

- current原资源与portable镜像分开列，不能共享“exact”状态。
- 每个文件锁定length/SHA-256；metadata锁定cue sheet/name、codec/sample/channels/count/loop/control。
- 外部URL只是provenance；是否允许runtime fetch由D31决定。
- 对Web Audio逐项标记`semantic-exact`、`portable-equivalent`、`unsupported-blocking`或`platform-unobservable`。
- CRI/device latency、browser resampling与硬件输出不得标记为semantic exact。

### 9.4 隐私与可复验性

- trace使用预定义allowlist；raw pointer只在采集进程内映射为递增alias后丢弃。
- 不保留账号、room、member、deck、card、昵称、Skill显示文本、token、绝对路径或网络payload。
- verifier拒绝额外字段、sequence gap、未知alias、非有限float、版本不匹配和未声明资源。
- 所有Reverse证据先push，Garupa verifier才能引用其commit。

## 10. 固定事件oracle要求

### 10.1 Oracle输入

- 由已关闭chart constructor产生的ordinary与HABAHIRO production chart；
- 10.1.4证据冻结的audio start/profile输入；
- 固定outer-frame delta、input/judgement轨迹和pause/resume边界；
- 明确的master/BGM/SE option原始输入；
- hash锁定、离线可用的decoded PCM fixture/profile；
- 不包含expected command、expected voice slot、expected final gain或private owner。

### 10.2 Oracle输出

Command oracle至少固定：

- session/sequence/frame/substep/music position；
- command kind和全部typed payload；
- stable voice/resource ID与pool slot；
- gain/fade/seek/loop的数值及Float32 bits；
- pause/resume/end/dispose前后backend state；
- 完整JSON canonical digest。

PCM oracle至少固定：

- sample rate、channels、sample width/float format和frame count；
- 每个输入cue的起点、循环、fade、gain和结束sample；
- mix/clip/channel fold的明确顺序；
- 输出byte length和SHA-256；
- resource/profile/command oracle的source hashes。

### 10.3 AU-C01–AU-C40固定case

| Case | 场景 | 必须断言 |
| --- | --- | --- |
| AU-C01 | 合法profile prepare | 全资源验证后一次ready，0 voice/0 command |
| AU-C02 | 缺资源 | prepare失败且0 decoded/cache/voice mutation |
| AU-C03 | length/hash mismatch | 首错稳定、无fallback |
| AU-C04 | 重复logical/cue binding | engine创建前拒绝 |
| AU-C05 | backend unprepared/session mismatch | 0领域owner、0command |
| AU-C06 | BGM从起点开始 | resource/voice/start参数与顺序exact |
| AU-C07 | BGM非零start/seek | 单位、rounding、offset exact |
| AU-C08 | BGM pause | state/command/playhead冻结exact |
| AU-C09 | BGM resume | offset、顺序、不追赶wall clock |
| AU-C10 | BGM自然end/stop | callback、voice release、状态exact |
| AU-C11 | ordinary Good | standard cue route exact |
| AU-C12 | ordinary Great | standard cue route exact |
| AU-C13 | ordinary Perfect | particle/OneFrame/audio相对顺序exact |
| AU-C14 | Bad/Miss | 是否发声及无声路径exact |
| AU-C15 | ShouldSilent/move-time | 0或指定audio command，其他领域不变 |
| AU-C16 | default Flick | Flick与result组合顺序exact |
| AU-C17 | Directional Flick | cue、方向、result顺序exact |
| AU-C18 | Multiple count=2 | multiple cue与pool identity exact |
| AU-C19 | Multiple count=3–7/非法count | range与failure behavior exact |
| AU-C20 | 同帧多判定 | 原顺序、pool slot、无sort/dedupe |
| AU-C21 | Long Hold开始 | stable owner、cue、loop/start参数exact |
| AU-C22 | Long正常尾Fade | start/target/duration/stop sample exact |
| AU-C23 | Long Miss/timeout/deactivate | cleanup顺序与重复调用exact |
| AU-C24 | Slide Hold开始 | stable owner、cue、loop/start参数exact |
| AU-C25 | Slide正常尾Fade | start/target/duration/stop sample exact |
| AU-C26 | Slide Miss/deactivate | cleanup顺序与重复调用exact |
| AU-C27 | Hold中pause | loop/fade/playhead冻结exact |
| AU-C28 | Hold中resume | 同voice identity与offset exact |
| AU-C29 | master/BGM/SE option组合 | Float32 gain链每阶段bits exact |
| AU-C30 | 非法/变化volume | mutation前拒绝或current更新行为exact |
| AU-C31 | Skill/Audience | 自然transition与cue顺序exact |
| AU-C32 | Fever Ready/Start/End | command/state与cue顺序exact |
| AU-C33 | FullCombo/GameOver | cue/BGM stop/fade/lifecycle exact |
| AU-C34 | pool边界、reuse、exhaustion | fixed capacity与identity exact |
| AU-C35 | batch后项非法 | domain/backend/sequence零mutation |
| AU-C36 | backend operation throw/async fault | first fault、terminal state、无silent fallback |
| AU-C37 | context suspended/interrupted/closed | capability状态和失败优先级exact |
| AU-C38 | dispose/repeat/after-dispose | cleanup逆序、幂等、拒绝新命令 |
| AU-C39 | 完整ordinary/HAB chart | 固定command count与digest |
| AU-C40 | offline mix | 固定PCM length/digest与逐事件anchor |

AU-C01–AU-C40的expected必须在Reverse AU-R10中先冻结。若某case经D13/D20明确不属于当前局内路径，closure必须给出证据化排除原因，不能简单删除编号。

## 11. 详细实施步骤

### AU00 建立任务书

1. 锁定阶段身份、版本、上游提交与分支。
2. 盘点current direct evidence和historical discovery evidence。
3. 建立V01、D01–D32、AU-R01–AU-R12与AU-C01–AU-C40。
4. 写明production硬门、portable边界、测试、提交和完成定义。
5. 只提交本文档，不修改production/test/package scripts。

### 统一取证总阶段（AU01–AU03，禁止穿插AU04–AU12）

#### AU01 晋升10.1.4静态证据

1. 先隔离审计Reverse本地候选`10aae920...`：只读取提交对象，确认471个新增文件均在音频调查目录，不读取、不覆盖、不暂存现有无关脏工作树。
2. 在具备锁定依赖的环境从该提交对象复跑extractor/verifier，核对464方法、19布局、13枚举、ARM64/Float32/literal/native import和`STATIC_SHA256SUMS`。
3. 对候选自身发现的错误只追加音频scope修订提交；不得用工作树中未提交生成物替换证据。
4. push后确认`origin/main...HEAD = 0 0`，此时AU01才从“本地候选”晋升为confirmed；仍不写Garupa production。
5. 将AU01静态输出作为统一coverage matrix输入，不把它视为可单独解锁任何producer的阶段成果。

#### AU02 统一实体runtime、资源、portable与oracle取证

1. 在采集前一次性提交覆盖全部D01–D32/AU-C01–AU-C40的observation-only capture plan、hook allowlist、trace schema、alias/sequence规则、future verifier和设备恢复协议。
2. 使用同一10.1.4样本与统一协议收集9.2全部自然场景。为保证自然可达和稳定性可分多个run，但每个run必须进入同一总manifest并可按session独立复验。
3. 同一总阶段内完成current APK/cache资源metadata、portable镜像provenance、length/hash/codec/control、gain/pool/fade/seek与CRI→offline/WebAudio mapping；不得把资源调查留到实现期。
4. 构造匿名、最小化、连续runtime trace、event/resource profiles、command expected和PCM expected。expected必须在TypeScript production存在前冻结。
5. 对static/runtime/resource冲突先修Reverse contract/closure并重跑受影响的统一matrix，不在Garupa中调和。
6. 生成V01、D01–D32、AU-R01–AU-R11和AU-C01–AU-C40总closure；blocking非空时继续留在AU02补采，不得部分授权BGM、判定或Hold实现。
7. 全部Reverse音频证据分scope校验、提交并push，最终确认`origin/main...HEAD = 0 0`。

#### AU03 统一冻结证据包与portable closure

1. 仅在AU01/AU02全部Reverse证据已push后，创建`tmp/simulator-reverse-evidence/audio/manifest.json`、`README.md`、`OPEN_GAPS.md`、`verify.mjs`和最小artifacts/fixtures。
2. manifest记录每项source commit/path/bytes/SHA/sample/status/consumer，并把所有session/resource/oracle纳入同一阶段closure。
3. verifier支持working tree与`--index`三方hash校验，拒绝历史H项、未push提交、Reverse脏工作树和runtime schema污染。
4. 冻结portable mapping与fidelity/provenance；D31明确resource delivery；AU-R12关闭source/copy/index closure。
5. 只有V01、D01–D32、AU-R01–AU-R12、AU-C01–AU-C40全部closed、`production_authorization=true`且0 blocking时，才统一解锁AU04–AU12。
6. 证据包单独提交并push，不混production；解锁后原则上不再回Reverse补普通实现细节，若确需补证则暂停全部production并重新进入统一取证总阶段。

### AU04 typed audio合同与recording backend

1. 新建backend-neutral audio profile/state/resource/command/result类型。
2. validator深复制/冻结profile，验证sample、fidelity、resource、cue、gain、pool和capability。
3. recording backend实现`unprepared/preparing/ready/faulted/disposed`状态机。
4. 实现session/sequence/stable voice/fixed pool验证和一次性batch capability。
5. snapshot只暴露冻结semantic state/commands/fault。
6. host在任何manager/Note/render/audio mutation前验证prepared backend/session/profile。
7. 先production提交，再独立test提交。

### AU05 资源provider与offline backend

1. 建立immutable local provider；每次read复制bytes，不接受URL alias或backend handle。
2. 实现profile hash/metadata/decode adapter；codec能力不足失败关闭。
3. offline backend按D18/D22/D30实现明确的Float32 gain、loop、fade、mix、channel和clip。
4. 固定资源cache/ref count与dispose；缺资源或decode后项失败原子回滚。
5. 以Reverse AU-R10 expected验证PCM，不从待测backend生成expected。
6. 测试期间不联网、不调用FFmpeg/Python；所需decoded fixture预先合法冻结。

### AU06 BGM producer

1. 在原作owner边界接入BGM semantic producer，不让host直接发start命令。
2. 恢复load/start/seek/playing/end/stop/Fade的current调用顺序。
3. 命令携带D26锁定的engine time anchor与resource/voice identity。
4. pause/resume使用D14/D15 offset，不读取WebAudio clock推进engine。
5. song end只按证据通知领域；backend资源时长不能自行结束live。
6. 覆盖AU-C06–AU-C10及BGM相关failure。

### AU07 判定音producer

1. 在current `onJudgeNote`等效owner处消费immutable judgement，不重新计算结果。
2. 恢复ShouldSilent、move-time、standard、Flick、Directional和Multiple路由。
3. 保持particle/OneFrame/audio与Flick/result的current exact顺序。
4. 对同帧多个judgement一次完整preflight，再按原序commit。
5. 实现fixed one-shot pool/reuse/exhaustion，不动态扩容或丢弃。
6. 覆盖AU-C11–AU-C20、AU-C34/AU-C35。

### AU08 Hold producer

1. 给Long/Slide concrete pooled owner绑定stable audio voice identity。
2. 恢复start条件、cue/loop、resource保存和重复start边界。
3. 恢复正常尾、Miss、timeout、deactivate、pool reset的Fade/Stop/clear顺序。
4. 使用证据化Float32 fade和engine clock采样；不使用WebAudio wall clockauthor领域进度。
5. pause/resume保持identity、offset和fade状态；dispose释放所有owner。
6. 覆盖AU-C21–AU-C28、AU-C34/AU-C38。

### AU09 辅助局内SE与音量

1. 接入Skill/Audience、Fever、FullCombo、GameOver的current领域transition。
2. 每种事件恢复cue、条件、顺序、practice/mode分支及BGM关系。
3. host只提供原始master/BGM/SE option；engine按D17/D18生成channel/gain命令。
4. session中volume变化仅在current证据允许时实现；否则显式拒绝。
5. pitch/pan/seek只实现current reachable参数；未知非零路径失败关闭。
6. 覆盖AU-C29–AU-C33。

### AU10 Web Audio backend

1. 把所有DOM/WebAudio类型限制在专用backend目录。
2. prepare阶段创建/接收context、decode全部资源并构造显式gain graph；完成前不能交给engine。
3. 把BGM、one-shot、loop、fade、pause/resume/stop映射为D23合同。
4. 使用engine command time/offset；`currentTime`只转换为transport schedule。
5. 对一次性source重建保持engine voice identity和资源引用。
6. capability/context异常进入first terminal fault；不自动resume、重建或静音fallback。
7. 用注入fake AudioContext测试graph/schedule/automation，不用sleep或实时音频digest。

### AU11 lifecycle/failure集成

1. 将audio batch和现有Note/OneFrame/render业务放入证据化两阶段顺序。
2. 后项preflight失败时discard全部未提交audio capability并保持domain/backend零mutation。
3. 定义commit throw与async context fault后领域cleanup优先级；保留first fault。
4. pause/resume/fault/GameOver/song end/dispose按D28执行，正常与terminal cleanup分路。
5. 重复dispose幂等；disposed snapshot资源/voice为0且历史trace不可变。
6. 覆盖AU-C35–AU-C38及所有host mutation-before-ready反例。

### AU12 production oracle与独立验收

1. 对ordinary与HABAHIRO production chart跑固定command replay。
2. 对固定decoded resource/profile跑offline PCM oracle。
3. 记录AU-C39 command count/digest和AU-C40 PCM length/digest，不在本文档预先编造。
4. 运行证据、type、static boundary、全部audio suite及上游隔离回归。
5. 从fresh临时编译目录重复运行，确认不读取工作树expected、网络或Python。
6. 创建`tmp/simulator-audio-acceptance.md`，逐项记录D01–D32、AU-C01–AU-C40、命令、资源、边界和差异。
7. 独立验收提交并push，确认远端`0 0`。

## 12. 测试与验证计划

### 12.1 计划入口

```powershell
node tmp/simulator-reverse-evidence/audio/verify.mjs
npx.cmd tsc -p src/simulator/tsconfig.json
npm.cmd run simulator:test:audio-evidence
npm.cmd run simulator:test:audio-contracts
npm.cmd run simulator:test:audio-backend
npm.cmd run simulator:test:audio-bgm
npm.cmd run simulator:test:audio-judgement
npm.cmd run simulator:test:audio-hold
npm.cmd run simulator:test:audio-webaudio
npm.cmd run simulator:test:audio-production
npm.cmd run simulator:test:audio
```

入口名称在AU04 test批创建；AU03前不得提前修改`package.json`。

### 12.2 静态边界检查

必须自动确认：

- `engine/`不导入DOM/WebAudio/React/Pixi/Tauri/Node文件系统/网络/codec包；
- backend-neutral contracts不暴露AudioNode、bytes、callback或Promise到engine command；
- Web Audio backend不导入Note/Score/Life/Skill/Fever manager；
- production/test不读取`tmp/simulator-reverse-evidence`或Reverse路径；
- test runner不调用Python、FFmpeg、网络或真实wall-clock sleep；
- engine command不包含fixture ID、evidence ID、expected值或合成`sourceOrder`。

### 12.3 正向测试

- profile深冻结、资源prepare、session绑定和stable voice；
- BGM start/seek/pause/resume/stop/end；
- standard/Flick/Directional/Multiple及same-frame；
- Long/Slide loop/fade/cleanup/pause；
- Skill/Fever/FullCombo/GameOver；
- gain Float32、pool reuse、offline mix和PCM digest；
- WebAudio fake graph/node recreation/automation/context lifecycle；
- ordinary/HAB完整command digest和snapshot。

### 12.4 失败关闭测试

至少覆盖：

- wrong sample/fidelity、missing/duplicate resource、hash/metadata/decode mismatch；
- unprepared/preparing/faulted/disposed backend、wrong session、sequence gap；
- foreign/duplicate/released voice、pool exhaustion、unknown cue/command；
- NaN/Infinity、Float32 bits mismatch、negative/out-of-range seek/gain/fade；
- command后项非法、capability replay、commit after discard、overlapping batch；
- fake AudioContext suspended/interrupted/closed、decode reject、node start/stop throw；
- pause/resume outside active session、repeat calls、command after fault/dispose；
- backend failure前后domain/command/voice/resource/sequence零mutation或证据化terminal cleanup。

### 12.5 非确定性与手工检查

- 实时browser smoke只验证“能够按命令发声、pause/resume/dispose无泄漏和结构化故障可见”，不生成expected digest。
- 不以人工听感、波形看似对齐或一次设备录音关闭D01–D32。
- 如需音画实机比较，必须回Reverse建立新的同步capture调查并记录分布，不在Garupa测试中加入固定latency。

### 12.6 上游回归

AU12前按任务书批准的隔离顺序运行first-slice、chart、clock、Auto Live、manual、score/life、resource/Pixi和HABAHIRO专项。中间批只跑当前audio定向测试；不得提前运行Vite/Tauri或整体应用构建。

## 13. 批次与提交纪律

1. 每批开始前更新本文档执行进度、证据缺口和验证结果。
2. 只暂存当前批目标文件；Reverse证据、Garupa冻结包、contracts、engine producer、offline backend、Web Audio、tests、acceptance不得混提交。
3. Reverse每个新证据批必须先`git diff --check`、暂存、`git diff --cached --check`、verifier、检查staged stat、中文提交、push和`origin/main...HEAD = 0 0`。
4. Garupa每批提交前后执行：

```powershell
git diff --check
git diff --cached --check
node tmp/simulator-reverse-evidence/audio/verify.mjs --index  # 涉证据包时
git diff --cached --name-status
git diff --cached --stat
```

5. 建议提交序列：

```text
docs(simulator): 建立音频阶段任务书
evidence(simulator): 冻结音频阶段证据
feat(simulator): 建立类型化音频合同
feat(simulator): 建立确定性音频资源后端
feat(simulator): 恢复局内BGM路由
feat(simulator): 恢复判定音路由
feat(simulator): 恢复Hold音效生命周期
feat(simulator): 恢复局内音效与音量路由
feat(simulator): 建立Web Audio后端
fix(simulator): 收紧音频故障与销毁边界
test(simulator): 锁定音频production oracle
docs(simulator): 记录音频阶段验收
```

6. 每批提交后push `origin codex/refactor-simulator-implementation`并确认：

```powershell
git rev-list --left-right --count origin/codex/refactor-simulator-implementation...HEAD
```

结果必须为`0 0`。
7. 不新建/切换分支，不暂存主工作树无关修改，不修改Reverse无关目录。
8. 若出现证据冲突或blocking gap，停止production，回Reverse修证据；不得在任务书中把blocked改成portable inference绕过。

## 14. 阶段完成定义

只有同时满足以下条件，音频阶段才能标记完成：

1. Reverse 10.1.4 AU-R01–AU-R12均已提交、push、可复验，且版本/隐私/capability声明完整。
2. Garupa audio证据包source/copy/index三方通过，manifest无历史证据伪晋升。
3. V01、D01–D32全部closed，closure为`production_authorization=true`且无blocking finding。
4. AU-C01–AU-C40全部有独立expected和正/反向测试；明确排除项具有证据化理由。
5. engine只author immutable semantic commands，不含资源bytes、URL、AudioNode或backend clock。
6. BGM、判定、Hold、辅助局内SE、gain、pause/resume、end/dispose均匹配current command oracle。
7. fixed pool、stable identity、same-frame顺序、Float32、fade和seek边界逐项匹配。
8. resource profile/hash/decode/fidelity/no-fallback边界关闭；测试完全离线。
9. recording、offline和Web Audio三个backend各自职责清楚，Web Audio不author领域时间。
10. device/CRI/browser差异明确记录，不存在猜测固定latency或静默近似。
11. backend/resource/command failure在领域mutation前原子拒绝，terminal first fault和cleanup通过。
12. AU-C39 command digest与AU-C40 PCM digest从fresh build可重复。
13. audio总入口和规定上游隔离回归通过；无Python、网络、真实clock expected依赖。
14. 未修改App/路由/编辑器控制器/窗口协议，未进行未经批准的整体接入。
15. `tmp/simulator-audio-acceptance.md`逐项给出证据、命令、测试和边界结论。
16. 目标分支已push且远端差异`0 0`，工作树仅保留用户明确不纳入的并行修改。

任一条件未满足时，阶段状态必须保持`blocked`或`partial`，不得用“浏览器已能发声”“听起来接近”或旧Python PCM通过替代。

## 15. 当前审计结论

- 实施块7范围、架构、证据分类、硬门、runtime/resource计划、AU-C01–AU-C40、批次和完成定义已建立。
- 当前**可消费的已push** 10.1.4证据只提供判定入口、Long/Slide局部Hold与scheduler pause边界，不能授权完整音频production。
- 10.1.3 Perfect→CRI、cue资源、gain、pause和real-play调查具有定位价值，但全部保持discovery-only。
- 当前Garupa HEAD为已push的`7bfecd9...`；Reverse可消费基线仍是已push的`ab5cc366...`。本地`10aae920...`虽已形成完整静态候选，但因领先远端1提交且Reverse工作树有大量无关变化，当前只能作为E01待复验候选，不能进入Garupa manifest或production evidence。
- 后续不再采用“取一个cue/常量→实现一段→再补证”的交替路线。必须依次完成E01–E08统一取证总阶段：静态候选晋升、统一自然runtime、resource/portable profile、固定command/PCM expected、总closure、Reverse push与Garupa三方冻结。
- AU03关闭前，不得创建typed audio production合同、Web Audio backend、音频test入口或package script；只有`production_authorization=true`后才按I01–I06落地实现。
- 本次对话任务列表已经写入1.5；任务书整理完成后状态为`blocked`，等待用户明确命令再从E01开始。
