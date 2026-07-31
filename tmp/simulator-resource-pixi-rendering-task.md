# 模拟器资源与 Pixi 渲染阶段任务书

## 1. 阶段身份与当前状态

- 阶段：模拟器彻底重构实施块6——资源与 Pixi 渲染。
- 上级计划：`tmp/simulator-reconstruction-plan.md`“后续实施块 / 6. 资源与 Pixi 渲染”。
- 上游：第一切片、谱面构造、时钟与调度、Auto Live、手动输入与判定、分数/生命/状态均已关闭。
- 上游最终状态提交：GarupaEditor `a67afea41315519af35f582448c19e0dcdcca5f9`。
- 上游验收：`tmp/simulator-score-life-state-acceptance.md`。
- 目标分支：`codex/refactor-simulator-implementation`；不得新建或切换分支。
- 锁定原作样本：`jp.co.craftegg.band` 10.1.4（version code 230，`arm64-v8a`）。
- 锁定`libil2cpp.so` SHA-256：`815DF62582B35F3EF2223AB033FAC6DC909DE492D548DD28950BF1F98F058D8F`。
- 锁定`global-metadata.dat` SHA-256：`298D92CB0DC44B11681C5478F3BB08CE5476321361CE962096095CC31812961F`。
- 当前Reverse基线提交：`44d2f20bf4cf19eb4c91e5b025101ec154f31e60`；只消费该提交及其祖先中已提交、已push、可校验对象。
- 当前状态：**RP00任务书已完成；RP01 10.1.4渲染重基线、RP02资源实体/运行时/固定场景oracle是生产硬门。RP02关闭前禁止修改`src/simulator/**`生产实现、增加Pixi backend、加入阶段测试脚本或引入资源二进制。**
- 计划证据包：`tmp/simulator-reverse-evidence/resource-pixi-rendering/`，只在Reverse新证据提交并push后创建。
- 计划验收记录：`tmp/simulator-resource-pixi-rendering-acceptance.md`，RP14时创建。

本任务书是实施块6的当前执行依据。它与`CLAUDE.md`冲突时，以本任务书为准；它不得放宽全局“Reverse唯一行为依据、失败关闭、版本隔离、隐私最小化、证据先提交后实现”的要求。

### 1.1 阶段目标

本阶段只恢复10.1.4证据闭合的原作托管层渲染职责，并将这些职责映射为Pixi v8可移植后端：

1. 恢复`NoteImageController`资源命名、普通/HABAHIRO/Directional atlas选择、exact lookup和缺失资源行为。
2. 恢复普通Note、Skill、Long/Slide head、Slide intermediate、Flick及Directional/Multiple visual的Sprite、icon、transform、sorting和可见性消费链。
3. 恢复Long/Slide mesh、segment ownership、UV、vertex color、material role、shader threshold和生命周期。
4. 恢复同步线、Multiple Directional back line、field/judge line、遮罩及HABAHIRO lane-change中已确认的渲染链。
5. 恢复渲染对象池身份、Activate/Move/Wait/Stop/Deactivate、pause、reset和dispose对应的backend命令顺序。
6. 恢复Score、Combo、All Perfect、AddScore、Result/JudgeTiming、Life Gauge、Damage Guard/Never Die/Heal及Skill/Fever相关HUD消费链。
7. 建立版本化、不可变、哈希锁定的portable resource profile和异步资源准备边界；engine不读取文件、不联网、不解析UnityFS。
8. 建立typed、不可变、session-bound render commands；Pixi backend只消费engine已确认的渲染事实，不反向author Note/Score/Life/Skill/Fever状态。
9. 建立固定scene graph、命令轨迹和受限frame oracle；精确校验资源、对象身份、几何、排序、可见性、动画状态与生命周期。
10. 保持Unity GPU、NGUI batching、设备特定采样、未闭合Shader/粒子随机流和PlayerLoop亚帧相位为显式边界，不用Pixi默认值冒充。

“完成资源与Pixi渲染”不表示已恢复Web Audio/CRIWARE、Photon、MV/Live2D、角色cut-in、完整背景演出、DOM/Tauri输入、编辑器窗口接入或Unity GPU像素级一致性。

### 1.2 锁定决策

1. `GirlsBandParty-Reverse`仍是唯一原作行为依据。现有`src/skinLoader.ts`、`src/noteSkinAssetTool.ts`、编辑器SVG/CSS绘制和已删除旧模拟器均不是原作行为证据。
2. 当前Reverse中的Note/HUD/mesh/software-renderer调查主要锁定10.1.3/229，只能列为H系列迁移候选。不得因类名、字符串、Sprite名或资源URL相同而直接用于10.1.4生产。
3. RP01必须按managed owner/method/signature逐项重解析10.1.4；禁止统一RVA delta、读取Reverse未提交工作树、引用本地IDA数据库或`runtime/tools/`。
4. RP02必须同时关闭资源字节provenance、实体/运行时对象轨迹、固定scene graph和portable contract。RP02关闭前不得修改生产代码、测试入口或package scripts。
5. `engine/`不得导入`pixi.js`、React、DOM、Canvas、WebGL/WebGPU、Tauri、编辑器类型、资源URL或文件系统API。
6. Pixi只实现原作职责的backend mapping；不得为了Pixi容器、anchor、zIndex、mask或shader方便而修改Note/Score/Life领域模型。
7. engine只能发送typed semantic command，例如create/bind/show/hide/transform/geometry/HUD state；不得发送Pixi对象、Texture、Container、Graphics、Shader或任意callback。
8. resource provider只向backend提供经profile声明且SHA-256匹配的字节。engine不请求URL、不决定缓存、不解析PNG/atlas/Unity asset。
9. 资源profile必须声明sample、pack identity、logical role、byte length、SHA-256、MIME、atlas rect/pivot/PPU、material/animation source和exact key。缺失、重复、hash mismatch、越界rect、未知role或alias fallback必须在创建任何Pixi对象前失败关闭。
10. 不允许production运行时访问Bestdori、GitHub、CDN或其他网络源。外部URL只能作为Reverse审计provenance；实际backend必须消费宿主预置或用户显式提供并校验的本地字节。
11. 是否允许把原作资源二进制纳入Garupa仓库必须在D02中由provenance/分发决策明确关闭；未关闭前只冻结元数据、hash和最小合规测试夹具，不提交原作atlas/bundle/font。
12. 资源加载天然异步，但现有engine`initialize()`保持同步领域边界。Pixi backend必须先独立`prepare()`并进入ready状态，再传给`createSimulatorEngine`；未ready时`initialize()`在任何领域/backend mutation前返回`evidence-required`。
13. 每个render object由engine稳定render identity和backend session共同绑定。backend不得按noteIndex、Sprite名或数组位置猜测对象复用。
14. Setup/Activate/Move/Wait/Stop/Deactivate、pool acquire/release、Sprite/mesh/line visibility、HUD更新和动画restart必须按证据顺序发送；同帧多命令保持原顺序，不合并“看起来相同”的写入。
15. Pause冻结哪些动画clock、哪些HUD coroutine、哪些field animation必须由D13逐项确认。不得全局冻结或全局继续。
16. `Math.fround`、坐标空间、safe-area ratio、high-aspect ratio、scale、anchor/pivot、line width、UV、color、alpha、sorting和range边界必须逐项按证据实现；不得用CSS/Pixi默认值补齐。
17. Unity sorting layer/order、camera-facing Z、NGUI depth与Pixi zIndex不是天然等价。D15必须定义显式portable ordering key和已知差异；无法闭合的组合必须失败关闭或排除。
18. Unity SpriteMask、LineRenderer、MeshRenderer、NGUI UISprite/UILabel/UISlider和Animator都必须先恢复semantic contract，再映射Pixi；不得直接把Unity组件字段机械复制成Pixi属性。
19. frame oracle分两层：scene/command oracle必须逐字段exact；raster oracle只比较D16已确认的设备/viewport/采样条件。不得用实现自己生成的截图作为原作expected。
20. 原作GPU raster、透明排序内部细节、Font hinting和PlayerLoop亚帧采样如未闭合，必须在验收中明确排除；“视觉接近”不能替代证据。
21. backend异常、资源解码失败、WebGL/WebGPU context loss、重复prepare、重复initialize和dispose必须在D17闭合后实现；不得吞错、自动重载或保留半棵scene graph。
22. evidence、production contracts、engine render producers、Pixi backend、测试和验收文档必须分批提交；任何一批绿色结果都不能单独关闭阶段。

### 1.3 执行进度

| 任务 | 状态 | 完成标准 |
| --- | --- | --- |
| RP00 建立阶段任务书 | **已完成** | 范围、证据候选、硬门、owner、oracle、批次与完成定义写入本文档 |
| RP01 10.1.4静态与资源重基线 | 阻塞 | V01、D01–D15静态部分关闭；方法/布局/资源/asset对象均来自当前样本提交证据 |
| RP02 实体/运行时与固定scene oracle | 阻塞于RP01 | D01–D18全部关闭，PR01–PR40无unknown/blocker，`rendering_gate=closed` |
| RP03 锁定render/resource contracts | 阻塞于RP02 | immutable profile、provider、command、identity、session与preflight边界闭合 |
| RP04 接入engine渲染producer | 阻塞于RP03 | Note/manager/HUD只生产证据确认的typed commands，不依赖Pixi |
| RP05 恢复Note Sprite与field | 阻塞于RP04 | atlas route、exact lookup、transform、flick icon、field/judge line匹配 |
| RP06 恢复mesh、sync line与mask | 阻塞于RP05 | Long/Slide topology/material/threshold、line、mask和ordering匹配 |
| RP07 恢复render pool与生命周期 | 阻塞于RP06 | acquire/reuse/release、pause/reset/fault/dispose顺序匹配 |
| RP08 恢复基础HUD消费链 | 阻塞于RP07 | Score/Combo/AP/AddScore/Result/Life exact scene state匹配 |
| RP09 恢复HUD overlay与动画 | 阻塞于RP08 | Skill/guard/heal/score-up/judge-line overlay及clock匹配 |
| RP10 建立portable resource backend | 阻塞于RP09 | async prepare、hash/atlas validation、decode/cache/dispose匹配 |
| RP11 建立Pixi v8 renderer | 阻塞于RP10 | Sprite/Mesh/Graphics/Mask/Text/ordering映射和command消费匹配 |
| RP12 failure/context/dispose矩阵 | 阻塞于RP11 | backend异常、context loss、重复生命周期与零残留边界匹配 |
| RP13 production oracle与全回归 | 阻塞于RP12 | PR01–PR40、ordinary/HABAHIRO、dependency、证据index和上游回归通过 |
| RP14 独立验收 | 阻塞于RP13 | 从提交后HEAD复验并创建acceptance，RP00–RP14全部closed |

### 1.4 2026-07-31 RP00初始盘点

- 重读整体计划实施块6、上一阶段任务书/验收和当前`src/simulator/backends`边界。
- 当前backend只有通用`SimulatorBackendPort.record()`及recording空端口，没有typed renderer/resource contract、Pixi对象或资源加载。
- 当前`engine/`仍无Pixi/DOM依赖；该边界必须保持。
- 当前仓库已依赖`pixi.js ^8.17.1`，但现有编辑器`skinLoader.ts`和资源工具不构成本阶段原作证据，也不得被engine导入。
- Reverse HEAD存在Note atlas、HABAHIRO、mesh/line、Flick icon、HUD与实体视觉调查；大部分明确锁定10.1.3/229，仅登记为H01–H28迁移候选。
- 当前可直接复用的10.1.4证据仅能锁定package identity及上游领域输出；没有完整10.1.4 render method/layout/resource/scene/runtime closure。
- Reverse本地未提交/忽略的10.1.4 dump、提取资产、IDA数据库、`runtime/tools/`和local capture永久排除；只有后续提交的最小结构化产物可晋升。
- P01–P04和H01–H28均从Reverse Git对象重新计算字节数/SHA-256并核对最新来源提交；未读取未提交资源作为结论。
- 文档反审确认RP00–RP14共15项、D01–D18共18门、PR01–PR40共40个case且编号无缺失；Garupa/Reverse远端差异均为`0 0`。
- 本批只创建任务书并同步阶段状态，不创建证据包，不修改production/test/package scripts，不运行Vite/Tauri或整体构建；`git diff --check`通过。

## 2. 固定范围

### 2.1 纳入范围

- `NoteImageController`初始化、filename map、ordinary/HABAHIRO/directional profile选择、exact Sprite lookup与missing行为。
- Note root/head、Skill、Long/Slide、Slide intermediate、Flick top icon、Directional和Multiple side visual的Sprite职责。
- approach position、visual target、launcher、safe-area/high-aspect、多分辨率scale及已确认坐标转换。
- `NoteMesh`/`NoteMeshAdvanced` topology、segment ownership、vertices、indices、UV、color、material role、threshold与lifecycle。
- `NoteSyncLine`、Multiple Directional back line、line width/endpoints/material/threshold及pool。
- field lines、judge line、sudden/mask、HABAHIRO lane-change两阶段渲染职责。
- Score、Combo、All Perfect、AddScore、Result/JudgeTiming、Life Gauge与Skill/guard/heal/score-up overlay。
- 已确认的Animator/clip/coroutine状态、duration、loop、restart、pause和hide边界。
- portable resource profile/provider、byte/hash/atlas validation、decode/cache/ownership/dispose。
- typed render command stream、stable render identity、session、snapshot及recording backend。
- Pixi v8 backend中的Container/Sprite/Mesh/Geometry/Graphics/Mask/Text映射、显式ordering和资源释放。
- ordinary与HABAHIRO production chart固定scene/command/frame oracle。

### 2.2 排除范围

- BGM、判定音、Hold音、CRIWARE、Web Audio、音量/Fade与音画延迟；属于实施块7。
- Photon、远端玩家头像/Skill同步、网络时序与断线替换。
- MV、Live2D、角色cut-in、卡面、背景视频、结果页完整演出及story UI。
- 未闭合的随机粒子流、Unity ParticleSystem内部模拟、GPU shader binary parity和后处理。
- Unity PlayerLoop、Animator、Coroutine、NGUI和GPU之间未闭合的亚帧相位。
- 完整Unity透明排序内部算法、NGUI batching、Font hinting、FreeType像素级一致性和设备driver差异。
- React组件、`App.tsx`、编辑器控制器、窗口路由、Tauri载荷和模拟器主程序入口。
- 编辑器现有skin选择/下载协议到模拟器资源profile的适配；属于实施块9。
- 从Bestdori/CDN在production或测试期间联网下载资源。
- 无分发/provenance决策的原作APK、AssetBundle、atlas、font或音频二进制入库。

## 3. 强制执行规则

1. RP01/RP02及V01/D01–D18全部关闭前，禁止实施RP03–RP14生产代码和阶段测试入口。
2. 新证据必须先在Reverse提交并push，再冻结到Garupa；不得读取Reverse未提交工作树作实现判断。
3. 证据包每项必须记录Reverse commit、源路径、复制路径、字节数、完整大写SHA-256、sample、status和消费任务。
4. `verify.mjs`必须校验Reverse commit对象、source、copy和Git index；资源二进制如不入库，必须校验其manifest/provenance而不是伪称校验了字节。
5. 10.1.3 H系列只能用于RP01目标发现与语义迁移审计，不能出现在production evidence ID中。
6. 每个resource key、atlas rect、pivot、PPU、texture setting、material role、shader parameter、sorting、depth、mask、geometry、animation和lifecycle都必须指向最终F/R/PR证据。
7. `engine/`生产类型不得包含fixture ID、证据ID、Pixi类型、URL、文件路径、expected pixel或测试callback。
8. backend不得读取private engine state；只消费不可变command。command不得让backend决定命中、Note状态、Score、Life、Combo、Skill或Fever。
9. resource profile和scene profile必须完整preflight后再创建任何backend object；后一个非法asset/row不得留下前一个Texture/Sprite/Container。
10. unknown enum/key/profile统一`evidence-required`；不得no-op、placeholder、白纹理、fallback Sprite、clamp rect、自动排序或alias。
11. Pixi默认anchor、roundPixels、resolution、antialias、mipmap、scaleMode、wrapMode、blendMode和zIndex都不能隐式使用；未确认配置必须阻止backend ready。
12. typed commands按engine sequence稳定排序；backend不能跨sequence合并或延迟可观察mutation，除非D13/D15明确允许。
13. Float32值必须保留bits；Pixi接收double前先由engine/backend contract明确转换点。测试同时验证bits与投影值。
14. mask、sorting和shader替代必须记录“原作semantic→Pixi mapping”，不得宣称组件名相同即行为相同。
15. raster golden不得由待测Pixi backend生成expected；只能来自10.1.4实体捕获或独立冻结资源/几何oracle。
16. 测试不得联网、调用Python、读取Reverse或使用仓库旧编译产物；Python只在Reverse离线生成oracle。
17. backend failure必须返回结构化结果并进入terminal fault；不得throw穿透后由宿主猜测恢复。
18. 每个production批和对应test批分离；RP14必须从已提交HEAD和全新临时产物独立运行。

## 4. 目标架构与所有权

```text
10.1.4 committed resource/static/runtime evidence
  -> immutable RenderResourceProfile + RenderSceneProfile (host/backend boundary)
      -> SimulatorResourceProvider.prepare() [async, bytes + hash only]
          -> prepared SimulatorRendererBackend [session-bound]

engine owner state
  NoteManager / Note entities / InGameRecord / Skill / Fever
    -> typed immutable RenderCommand stream
        create/acquire/bind/transform/geometry/show/hide/hud/animate/release
          -> RecordingRendererBackend (oracle)
          -> PixiRendererBackend (portable presentation)

Pixi backend owner
  resource cache -> Texture/Geometry/Shader equivalents
  render identity -> Container/Sprite/Mesh/Graphics/Text object graph
  command sequence -> deterministic scene mutation
  dispose -> reverse ownership release, no engine mutation
```

### 4.1 Engine render producer边界

engine可以产生：

- stable `renderObjectId`、object role、pool family和session；
- logical resource ID、exact Sprite key、material role、animation state；
- Float32 transform/scale/alpha/color、visibility、sorting tuple；
- immutable vertices/indices/UV/colors、line endpoints/width/threshold；
- HUD source state：Score、Combo、Life、result/timing、ScoreUpType、guard/Skill/Fever状态；
- lifecycle命令和严格sequence。

engine不得产生：

- Pixi Container/Sprite/Texture/Mesh/Graphics/Text/Shader；
- URL、Blob、ImageBitmap、HTMLCanvasElement、GPU handle或filesystem path；
- “最终屏幕像素”、CSS坐标、DOM事件或编辑器skin对象；
- backend成功后反写的Note/Score/Life/Skill/Fever状态。

### 4.2 Resource provider边界

计划接口职责：

- 宿主先提供不可变`RenderResourceProfile`和`SimulatorResourceProvider`。
- provider按logical asset ID返回字节、byte length和MIME；profile提供expected SHA-256。
- backend验证全部资源、atlas rows、dimensions和cross-reference后原子进入ready。
- profile中的审计URL不进入engine，也不能被production provider自动请求。
- Texture/Geometry等Pixi对象只由backend cache拥有；dispose按引用关系释放。
- provider缺失、hash mismatch、decode失败、重复key、越界rect和不支持格式全部失败关闭。

### 4.3 Pixi backend边界

- Pixi代码只位于`src/simulator/backends/pixi/`或后续任务书批准的同层目录。
- backend通过明确factory/adapter封装Pixi v8，以便recording scene和browser renderer共享command contract。
- renderer不直接持有engine manager/note对象；只按render identity查找backend对象。
- zIndex只消费D15确认的portable ordering tuple；不得直接混用Unity sorting order、NGUI depth和Transform Z。
- mask、mesh shader、line和text均以独立adapter实现，unsupported path在prepare阶段拒绝。
- Pixi Application/canvas的创建与挂载不属于engine；实施块9主程序接入时才决定DOM位置和窗口生命周期。

## 5. 当前可直接复用的10.1.4证据

下列P系列只能建立样本身份及上游领域输入，不能单独关闭渲染门。

| ID | Reverse路径 | 字节 | SHA-256 | 提交 | 可直接确认 |
| --- | --- | ---: | --- | --- | --- |
| P01 | `artifacts/investigations/package-version-rebaseline-10-1-4/README.md` | 6163 | `5E37640F8F9F0B24E10B016606FE46E9361F4005606BE82EBC00FF44761E09B5` | `0785ec8c` | 10.1.4/230 binary identity与版本隔离规则 |
| P02 | `artifacts/investigations/package-version-rebaseline-10-1-4/version_map.json` | 45298 | `70E9C5981269F3096F384FF85D50A6DEA2855399984DDF59B6664306634DE48B` | `0785ec8c` | 已映射clock目标；不包含完整render rebaseline |
| P03 | `artifacts/investigations/score-life-state-runtime-contract-10-1-4/closure.json` | 5555 | `087516A6D2AA9431BA17708CA0AD6540603E7DDFC6F10A17D5D5E8F3F09BA229` | `44d2f20b` | Score/Life/Skill/Fever领域owner已关闭，可作为HUD source |
| P04 | `artifacts/investigations/score-life-state-runtime-contract-10-1-4/score_life_state_fixed_event_oracle.json` | 150524 | `0B46D57F72E544939B63A68D0D956AB2474A2F5C999BBB95A9335354C29933E7` | `44d2f20b` | BS01–BS36领域状态轨迹；不确认HUD表现 |

上游Garupa证据还确认Note graph、调度、Manual/Auto判定和OneFrame顺序；本阶段可消费这些已验收的engine领域状态，但必须独立确认它们何时、以何字段驱动renderer/HUD。

## 6. 10.1.3历史迁移候选

H系列只允许用于RP01列目标、对比语义和设计采证；不得直接成为production evidence ID。本节表内路径均相对于Reverse的`artifacts/investigations/`。

### 6.1 Note资源、Sprite、mesh与line候选

| ID | Reverse路径 | SHA-256 | 候选问题 |
| --- | --- | --- | --- |
| H01 | `note-sprite-atlas-bindings/atlas_sources.json` | `1D4580C28AC618511341FB1D076A5E87C4A72EBDAAB66719142C99064575FA9F` | ordinary/directional atlas来源、dimensions与Texture identity |
| H02 | `note-sprite-atlas-bindings/sprite_bindings.tsv` | `E9E0DDB5D90686DB77C5ED3953B757C7A678DB42DF27D13AB15535B76A0334F6` | 61个Sprite row、rect/pivot/PPU |
| H03 | `note-sprite-combination-lookup/habahiro_atlas_sources.json` | `441F98B7FC2C840AC2A1CD6280447A4FA9FD504F82ADFBC1B653F30EA799B85E` | HABAHIRO bundle与179 Sprite inventory |
| H04 | `note-sprite-combination-lookup/habahiro_sprite_bindings.tsv` | `556FFB802AD672F08F53AC01B3F704D17FDBC23346CB7A5C2FE960ECF6115A3E` | contiguous lane-combination exact names |
| H05 | `flick-icon-rendering/flick_icon_rendering.json` | `CF14ECEADC8C51884886DFB58378F93CE719CBFCBAC1F22738F71245F3C55023` | icon prefab、sorting 70/71、20-frame animation候选 |
| H06 | `multiple-direction-side-rendering/multiple_direction_side_rendering.json` | `3822E6F30FC6E7FBE2BFC1EF06EABA5EE31769EE97D10A0007161FA1A51B452E` | side visual、60-object pools、back-line endpoints/width候选 |
| H07 | `runtime-integration-prototype/front_note_sprite_rendering.json` | `81D5BC6F41720F279FAF4BC599DD282FBDEB6A88BCAEF6EDF435280D75BF9ADC` | root/head exact Sprite route和renderer gate候选 |
| H08 | `runtime-integration-prototype/note_mesh_render_data.json` | `0D295C039EEBE175D4591138F0183D615BE1D362EA29CD3864B36F673D591728` | 11/21 UV pair、vertex color、threshold候选 |
| H09 | `runtime-integration-prototype/note_mesh_projection.json` | `D7A9E24D722C22FC22AEFC21720A0836F21B4E41A2D71CFB07FDB1671C66EBDC` | endpoint world projection与width候选 |
| H10 | `runtime-integration-prototype/note_mesh_material_bindings.json` | `56AC699A9B3C3A219C1EA2B75060494FE0FF498E499887C6972E4CAC4A846100` | long/curve/sync Material及texture role候选 |
| H11 | `runtime-integration-prototype/note_sync_line_rendering.json` | `A5F03C45D5888DECC6D1769864F0EBBE1D5784DC84D40F6FA1EBB3AA795FAA2B` | sync line position/width/sorting/material候选 |
| H12 | `runtime-integration-prototype/slide_intermediate_sprite_rendering.json` | `4B678D3A58C3589F37FD8F3F67DA1EA1168D6CBF68932D813630B6A3734FC237` | visible/invisible intermediate route候选 |
| H13 | `runtime-integration-prototype/slide_segment_mesh_rendering.json` | `8AFE1AC76B9F775526F370DA0D1DD67321DD92347A260666A35E0B61B0485092` | per-After segment ownership与KillMesh候选 |
| H14 | `habahiro-lane-change/evidence.json` | `E2335D775F7BEC804DDA8A40443FA5BD13A89C03103DDE2FE455738ABC6633E2` | position 1728、Animation event后四资源替换候选 |

H01–H14的最新提交分布于`2fb5cdeb`、`0e83c582`、`c947709c`、`6ea569c5`和`44346045`；方法RVA、asset path、field offset与enum均按10.1.3处理。

### 6.2 HUD与动画候选

| ID | Reverse路径 | SHA-256 | 候选问题 |
| --- | --- | --- | --- |
| H15 | `hud-combo-rendering/hud_combo_rendering.json` | `74BBE404ADAB51EBF93911970A94F0A5F877B6CBA8FBF0A5D5D0BDC3BCA5E176` | Combo/AP scene、digit layout、zero/unchanged gate |
| H16 | `hud-combo-animation/hud_combo_animation.json` | `D23B5042A169FA606543B7AC9933A50FA04B5EAA4353E92A43F62CEC6AA6411E` | 12Hz scale clip、1s hide、AP alpha loop |
| H17 | `hud-judge-atlas-rendering/hud_judge_atlas_rendering.json` | `36486F7136404A2FF7AC5C6DAF80C95158BA58840077818E4041224E7A707061` | default/habahiro judge atlas与8 Sprite rows |
| H18 | `hud-judge-color-rendering/hud_judge_color_rendering.json` | `07FCE135AEE43A98A0131A8D83E2FA84575EB67E314E668F8CBE88814F2FA0BE` | score gray/pink、result/timing dynamic names |
| H19 | `hud-life-rendering/hud_life_rendering.json` | `DEEEE9B7511969AC71EFEC3D9823909F57B52A1502A08510BC8BA494ED927709` | two-slider fill、danger/warning、font/scene assembly |
| H20 | `hud-score-result-rendering/hud_score_result_rendering.json` | `FA221AB94B19E876263258C3B44D9F330C2DBD5C220D60110998029ABFD43B82` | Score/AddScore/Result/JudgeTiming scene与lifetime |
| H21 | `hud-score-up-overlay-rendering/hud_score_up_overlay_rendering.json` | `E8C62224964854EE70D2D8CBA306E23E3725286BED359A5F7F41A7E74E7A450E` | ScoreUpType 1–5、tint、Crescendo text |
| H22 | `hud-skill-overlay-rendering/hud_skill_overlay_rendering.json` | `E8CA2E347B69A4F0B46531E627196B3E962D1848284B84FE8B51F16616A6A724` | Heal/Guard/Never Die shared overlay与later-wins |
| H23 | `hud-score-skill-overlay-rendering/hud_score_skill_overlay_rendering.json` | `EEB0FFEB1BE4E5EF1210C43C7FC494AB455F46C008BF34142194A940645C5205` | score-skill overlay 0.75s loop与play/stop |
| H24 | `hud-judge-skill-overlay-rendering/hud_judge_skill_overlay_rendering.json` | `2567F7B17AC2BBD8C862894B4D981D9A683B01DD31A77C82EC950F9BFD8186C7` | judge-line skill overlay、resolution scale、alpha clip |

H15–H24明确或依赖10.1.3/229 APK、scene、Resources与ARM64；其颜色、深度、curve和asset row必须在10.1.4重新提取。

### 6.3 实体视觉与时序候选

| ID | Reverse路径 | SHA-256 | 候选问题 |
| --- | --- | --- | --- |
| H25 | `real-play-render-audio-oracle/real_play_render_audio_oracle.json` | `488841FCFA2707D0A60BC6F342200A9BA5CB29C0BFB4C76A71A4F4D071C87BF2` | 10.1.3 real-play MKV身份与frame anchor候选 |
| H26 | `real-play-cue-frame-timeline/real_play_cue_frame_timeline.json` | `4AA8429A588A98E2C13466A093F2BB9A446620B41E1935A30DCC06CF3845AB90` | VFR frame index/timestamp候选，不决定effect在哪一帧 |
| H27 | `real-device-life-sprite-trigger-state/real_device_life_sprite_trigger_state.json` | `24F2A45A5836538E7E77D564576AFD934D7616574B71BBC012FF7E204569371B` | Heal Sprite名/size/depth与Animator无controller候选 |
| H28 | `real-device-life-sprite-transform-pair/real_device_life_sprite_transform_pair.json` | `1A993FEAEC96D13075A38AC6765804DA57F676B265B372199168F41B6DFB3C03` | 同对象Sprite替换、scale/alpha endpoint候选 |

H25–H28不能外推到10.1.4；其local-only MKV/PNG/raw memory未提交，不能进入Garupa证据包。

## 7. 10.1.4重验矩阵

| 历史候选结论 | 候选证据 | 10.1.4必须重新确认 |
| --- | --- | --- |
| ordinary/directional/HABAHIRO atlas inventory和exact name | H01–H04 | bundle/atlas byte identity、Sprite row、Texture setting、skin选择、missing行为、资源可分发方式 |
| root/head/intermediate Sprite route与sorting 70/71 | H05–H07/H12 | 当前RVA、field layout、Awake/Activate写入顺序、icon独立排序、mask interaction |
| approach transform、perspective/safe-area scale | H09 | current constants、coordinate spaces、camera/target/launcher source、Float32顺序 |
| Long/Slide mesh topology与segment ownership | H08–H10/H13 | vertex/index/UV/color、width、material/texture/shader、Activate/Kill/Deactivate顺序 |
| sync/back line endpoints、width、threshold、sorting | H06/H11 | LineRenderer settings、world/local coordinates、margin masks、dynamic Z、pool identity |
| HABAHIRO marker启动动画后由event切图 | H14 | 当前production BMS command、clip event time/curve、four assignments、repeat/reset |
| Combo/AP digits、layout、animation/hide | H15/H16 | current scene/component/atlas/controller、delta source、pause/restart/same-value行为 |
| Judge atlas、Score/AddScore/Result | H17/H18/H20 | current skin profile、font/atlas rows、round-robin/depth、lifetime、ScoreUpType |
| Life two-fill、danger/warning与skill overlay | H19/H22/H27/H28 | current object/layout、upper limit source、guard suppression、overlay later-wins与Animator route |
| score/judge/skill overlays | H21/H23/H24 | current Sprite/color/depth/curve、play/stop、resolution scale与same-frame order |
| synchronized real-play frame | H25/H26 | 10.1.4 physical-device capture、viewport/frame PTS、domain event anchors、privacy-safe pixel regions |

## 8. V01与D01–D18硬门

### V01 整阶段版本重基线

- 从锁定10.1.4 metadata/ELF按owner/method/signature解析完整render target set，逐个记录RVA、边界、SHA-256和独立ARM64 TSV。
- 对相关type layout、enum、static fields、resource string、rodata Float32、delegate和list element建立机器可读contract。
- 每个H系列方法/asset结论标记`mapped`、`changed`、`removed-with-proof`或`not-applicable`；禁止统一RVA delta。
- **关闭条件**：`version_rebaseline=closed`、`unknown_methods=[]`、`unknown_layouts=[]`、`unknown_constants=[]`。

### D01 完整方法、类型与调用边界

至少覆盖：`NoteImageController`、`NoteBase`、Front/After/Flick/Directional/Multiple/Slide派生类、`NoteMesh`、`NoteMeshAdvanced`、`NoteSyncLine`、multiple back-line、`NoteManager.setupNoteSkin`、`ButtonManager`、HABAHIRO flash controller、Score/Combo/AddScore/Result/Life/Skill overlay/AllPerfect HUD owner及必要resource/animation helper。每个方法必须独立导出，不能冻结大bundle代替。

### D02 资源字节、provenance与分发边界

确认10.1.4实际选择的APK/AssetBundle/Resources/scene/atlas/font/material/shader/clip/prefab字节、container/object identity、SHA-256及外部rip对应关系；明确哪些字节可入Garupa、哪些必须由用户/host提供。未解决分发边界时production只允许profile/provider接口，不允许提交或下载原作资源。

### D03 resource naming与skin route

确认ordinary、HABAHIRO、Directional、Judge、Field profile选择，filename map、lane/range key、exact lookup、null/log/error行为、重复key和缺失Sprite处置。不得提供alias/fallback。

### D04 Sprite prefab与renderer状态

确认root/icon hierarchy、Transform、SpriteRenderer/NGUI UISprite初始值、sorting/depth、mask interaction、enabled/active gates、Sprite bind时点、ordinary/Skill/Long/Slide/Flick/Directional/Multiple全route。

### D05 坐标、scale与多分辨率

确认launcher/target/world/local/screen/safe-area坐标链、high-aspect、screen ratio、note setting scale、virtual lane、parent scale、pivot/PPU、Float32 operation order和viewport profile。禁止用当前编辑器lane布局或CSS尺寸代替。

### D06 Long/Slide mesh

确认base/advanced vertex count、indices、UV、colors/alpha、width rate、endpoint scale、per-After segment ownership、material选择、texture、shader `_Threshold`、RGB-only update及Activate/Kill/Deactivate/Reset顺序。

### D07 sync line与Multiple back line

确认Setup/OnUpdate、target ownership、position ordering、edge margin、width、material、threshold、sorting、non-Move hide、Deactive release、complete XYZ及60-object side pool是否仍成立。

### D08 mask、field与HABAHIRO lane change

确认judgement line、sudden area、SpriteMask/VisibleInsideMask、field line texture、flash prefab/clip/event、marker position、四资源切换、repeat/reset与pause行为。

### D09 render pool与object identity

确认每family pool size/source、acquire traversal、stable object identity、reuse reset字段、active list/render object对应、duplicate Activate、cross-note references、dispose release和fault时残留。

### D10 Combo/Score/AddScore/Result HUD

确认scene object/component、atlas/font/material、digit order/layout、zero/unchanged gates、AP route、Score 8 digits/color、AddScore round-robin/depth/motion、Result/JudgeTiming names/lifetime和ScoreUpType。

### D11 Life与Skill/Fever HUD

确认Life fills、display denominator、danger/warning、guard suppression、Heal/Guard/Never Die later-wins、Score/Judge Skill overlays、Fever可见消费、play/stop/hide和same-frame owner顺序。

### D12 animation/clip/coroutine contract

确认每个controller/state/clip、sample rate、duration、loop、curve、restart、hide timer、delta source、pause、resume、pool phase和completion event。不能用一个全局Pixi ticker替代所有原作clock。

### D13 engine→renderer命令顺序

在10.1.4观察Note Activate/Update/AfterUpdate/judgement/Reflect/Skill/Fever/GameOver与render/HUD caller顺序，确认同outer frame和adaptive substep中的command冻结点、批次与可见结果。

### D14 resource/Pixi portable contract

定义resource/scene profile字段、provider能力、ready门、render command schema、session/object identity、Float32转换、mutation ownership和所有拒绝条件；caller不得author final transform/visibility/HUD result，除非该值原作本就来自scene/master/profile。

### D15 Unity/NGUI→Pixi mapping

逐组件定义Sprite/Mesh/Line/Mask/Text/Slider/Animator、sorting/depth/Z、blend/filter/wrap/mipmap、color space、alpha和shader替代。每项标记`semantic-exact`、`portable-equivalent`或`evidence-required`，禁止默认为Pixi配置。

### D16 fixed scene/frame oracle

建立PR01–PR40：expected scene/command来自10.1.4 static/resource/R1，不来自Reverse prototype或待测TS。scene字段必须exact；raster区域、viewport、容差和排除像素必须由实体证据预先定义。

### D17 lifecycle与failure atomicity

确认resource missing/hash/decode、backend throw、context loss、pause、fault、dispose、重复prepare/initialize、reset/seek/GameOver时允许的domain/backend mutation、Texture/Geometry释放和terminal precedence。

### D18 closure与production authorization

Reverse生成`closure.json`：V01/D01–D18全部closed、PR01–PR40无unknown/blocker、`rendering_gate=closed`、`production_authorization=true`。任一项开放时RP03继续blocked。

## 9. 固定scene/frame oracle要求

### 9.1 输入

- 锁定10.1.4 binary/metadata/package及资源pack identity。
- ordinary `poppin_shuffle_special`和HABAHIRO `786_miracle_april_habahiro_special` production chart与上游domain oracle。
- 哈希锁定ordinary/HABAHIRO/directional/judge/field/HUD atlas、scene/prefab/material/clip/font profile。
- 明确viewport、safe-area、high-aspect、target/launcher、skin mode、pause和frame/substep序列。
- Manual/Auto判定、Score/Life/Skill/Fever输入必须经上游public owner产生，不直接注入HUD expected。
- R1 raw trace保留object alias、frame/substep、before/after renderer fields和严格caller顺序；不导出账号、room、deck/member/card/Skill身份或raw pointer。

### 9.2 输出

每个case至少输出：

- resource logical ID、byte/hash、atlas row、decode/cache identity；
- render object/pool identity、role、parent/child和lifecycle；
- command sequence、frame/substep、source owner；
- Sprite key、material/animation role、visible/active/mask；
- transform/scale/color/alpha/sorting tuple的Float32 bits；
- mesh vertices/indices/UV/colors、line endpoints/width/threshold；
- HUD digits/layout/text/Sprite/state/animation clock；
- pause/fault/dispose前后scene snapshot和resource counts；
- raster case的viewport、frame PTS、regions、expected hash/stat和evidence-defined tolerance；
- `unknown_fields`与`blocking_findings`，最终必须为空。

### 9.3 PR01–PR40矩阵

| Case | 必须覆盖 |
| --- | --- |
| PR01 | 10.1.4 resource manifest、pack identity、全资源hash与cross-reference |
| PR02 | ordinary 45-Sprite inventory、rect/pivot/PPU/texture settings |
| PR03 | directional 16-Sprite inventory与left/right/top route |
| PR04 | HABAHIRO 179-Sprite inventory、contiguous names与atlas selection |
| PR05 | exact lookup present/missing/duplicate/unknown key失败矩阵 |
| PR06 | Normal/Skill/Long/Slide head/Flick root Sprite route |
| PR07 | Slide visible/invisible intermediate Sprite与range width 1–7 |
| PR08 | ordinary/left/right Flick icon hierarchy、sorting和animation |
| PR09 | Multiple Directional side visual、connection graph与icon visibility |
| PR10 | approach position、target/launcher、safe-area/high-aspect scale边界 |
| PR11 | base/advanced Long mesh vertex/index topology |
| PR12 | Slide N intermediate产生N+1 segment及ownership |
| PR13 | mesh UV、color/alpha、width rate和endpoint scale |
| PR14 | long/curve material、texture、threshold与RGB-only update |
| PR15 | mesh Activate/Kill/Deactivate/Reset及pool reuse |
| PR16 | sync line endpoints、margin、width、sorting、hide/release |
| PR17 | Multiple back line X ordering、complete XYZ、width和material |
| PR18 | SpriteMask/sudden/judge line/field line层级与ordering |
| PR19 | HABAHIRO marker→flash→animation event→four-resource swap |
| PR20 | render pool size、first acquire、reuse identity、duplicate failure |
| PR21 | pause/resume下Note/icon/mesh/line/field animation freeze矩阵 |
| PR22 | Combo 0/positive/unchanged gate与ordinary/AP切换 |
| PR23 | Combo four digits、LSF assignment、padding与center layout |
| PR24 | Combo scale clip、1s hide与AP alpha loop |
| PR25 | Score eight digits、leading gray/significant pink与gauge source |
| PR26 | AddScore four-object round-robin、depth cycle、three-phase motion |
| PR27 | Result/JudgeTiming Sprite route、1s lifetime与None/Auto |
| PR28 | ScoreUpType 1–5 overlay、tint与Crescendo decimal layout |
| PR29 | Life primary/secondary fills、danger/warning/equality boundaries |
| PR30 | Damage Guard warning suppression与Life current/max/upper source |
| PR31 | Heal/Guard/Never Die shared overlay及later eligible wins |
| PR32 | Score Skill与Judge-line Skill overlay play/stop/scale/alpha |
| PR33 | same-frame Reflect两至五entry的HUD command order与freeze |
| PR34 | Skill/Fever开始结束、GameOver与HUD/render同帧顺序 |
| PR35 | resource missing/hash mismatch/decode/rect/profile零对象mutation |
| PR36 | backend reject/throw/context loss进入terminal fault且无domain回写 |
| PR37 | pause/fault/dispose优先级、reverse release order和resource count 0 |
| PR38 | duplicate prepare/initialize/reset与cross-session identity拒绝 |
| PR39 | ordinary production chart固定command/scene snapshots |
| PR40 | HABAHIRO production chart含lane-change固定command/scene/frame anchors |

## 10. 详细实施步骤

### RP00 建立任务书

1. 盘点整体计划、上游领域输出、当前backend和Pixi依赖。
2. 只从Reverse HEAD读取当前证据，区分P直接依赖与H历史候选。
3. 建立范围、硬门、owner、resource policy、oracle、批次和完成定义。
4. 不创建证据包，不修改production/test/package scripts。

### RP01 晋升10.1.4静态与资源证据

1. 在Reverse建立`resource-pixi-rendering-runtime-contract-10-1-4`调查目录。
2. 逐managed owner解析D01完整方法、layout、enum、constant、resource string和call graph。
3. 从锁定10.1.4 package/cache提取最小asset inventory：container/object/Sprite/atlas/material/clip/prefab/scene/font metadata及hash。
4. 对H01–H28逐项给出mapped/changed/removed/not-applicable，不复用旧RVA或asset row。
5. 输出独立ARM64 TSV、asset/resource contract、targets、SHA256SUMS和fail-closed verifier。
6. 先提交/push Reverse并确认`origin/main...HEAD = 0 0`。
7. 冻结最小证据到Garupa新证据包，建立manifest/README/OPEN_GAPS/verify，独立证据提交。

### RP02 实体/运行时与fixed scene oracle

1. 先提交observation-only采集plan、隐私边界和verifier；禁止return replacement、memory write、APK patch和managed invocation。
2. 采集D04–D13对象identity、renderer fields、resource bind、HUD caller和before/after顺序。
3. 采集10.1.4 ordinary/HABAHIRO固定viewport frame anchors；原始视频/截图如含账号信息保留local-only，只晋升匿名crop/stat/hash。
4. 锁定resource profile与PR01–PR40 expected source；Python只能离线构造/验证oracle。
5. 建立portable contract和closure；所有case `unknown_fields=[]`、`blocking_findings=[]`。
6. 只有`rendering_gate=closed`和`production_authorization=true`后才解除RP03硬门。

### RP03 锁定render/resource contracts

1. 新建backend-neutral resource/profile、render command、identity、scene snapshot类型。
2. 将通用`renderer/resources.record()`替换或扩展为typed端口；recording backend实现同一contract。
3. 建立async backend `prepare()`、ready/session门和完整纯preflight。
4. resource/scene profile深复制、深冻结；caller alias mutation不影响backend。
5. backend snapshot不暴露Texture/Pixi对象/bytes/capability。
6. production与owner/preflight测试分开提交。

### RP04 接入engine渲染producer

1. 在Note pool setup/Activate/Move/Wait/Stop/Deactivate插入证据确认的semantic commands。
2. 从chart/runtime owner生成exact Sprite/resource key，不让backend猜lane、width或family。
3. 从上游Score/Life/Skill/Fever owner生成HUD source commands。
4. command在同frame/substep按证据顺序冻结；paused/faulted/disposed优先。
5. 不导入Pixi/DOM，不改变既有领域结果或调度顺序。
6. 用recording backend匹配PR06–PR10、PR20–PR21、PR33–PR34。

### RP05 恢复Note Sprite与field

1. 实现ordinary/HABAHIRO/directional/judge/field logical resource route。
2. 实现root/head/intermediate/flick icon/side visual object graph与Sprite bind。
3. 实现transform、scale、visibility、mask interaction和portable ordering tuple。
4. 实现field/judge line及HABAHIRO lane-change command/event边界。
5. missing key/profile直接失败关闭，不用placeholder。
6. 用PR02–PR10、PR18–PR19验证。

### RP06 恢复mesh、sync line与mask

1. 实现Long/Slide base/advanced topology、per-segment owner和lifecycle command。
2. 实现UV、color/alpha、width、endpoint projection、material role和threshold。
3. 实现sync line和Multiple back line完整XYZ、margin、width、ordering、hide/release。
4. 实现D15批准的mask/shader semantic mapping；unsupported mapping在prepare拒绝。
5. 用PR11–PR18验证。

### RP07 恢复render pool与生命周期

1. 按D09建立family pool profile和stable render identity。
2. 恢复acquire traversal、reuse reset、cross-reference和release顺序。
3. 将pause/reset/GameOver/fault/dispose门接入command producer，不改变领域状态机。
4. backend release后验证scene/resource reference count；cross-session handle拒绝。
5. 用PR15、PR20–PR21、PR37–PR38验证。

### RP08 恢复基础HUD消费链

1. 从`InGameRecord`/OneFrame total恢复Score、Combo、AP、Life的typed HUD commands。
2. 恢复digits、layout、color、fill、warning、zero/unchanged gate和representative result。
3. 恢复AddScore round-robin/depth、Result/JudgeTiming route和lifetime state。
4. HUD不得反写领域owner；frame命令按Reflect完成点发送。
5. 用PR22–PR30、PR33验证。

### RP09 恢复HUD overlay与动画

1. 恢复ScoreUpType、Crescendo text、Heal/Guard/Never Die later-wins。
2. 恢复Score Skill、Judge-line Skill、AP/Combo等已确认clip/coroutine clock。
3. 每个clock使用D12确认的delta/pause/restart/hide边界，不共享猜测ticker。
4. Skill/Fever/GameOver same-frame命令按D13冻结。
5. 用PR24、PR28、PR31–PR34验证。

### RP10 建立portable resource backend

1. 实现provider字节读取、SHA-256、MIME/dimension/atlas validation和atomic prepare。
2. 建立resource cache、Sprite subtexture、material/animation profile和引用计数。
3. 所有资源先验证后decode/create；失败释放临时对象并保持not-ready。
4. 不联网、不解析UnityFS、不使用编辑器skin loader作为fallback。
5. 用PR01–PR05、PR35、PR37–PR38验证。

### RP11 建立Pixi v8 renderer

1. 在`src/simulator/backends/pixi/`实现Pixi adapter，engine dependency verifier继续禁止Pixi。
2. 映射Container/Sprite/Mesh/Geometry/Graphics/Mask/Text/Slider semantic contract。
3. 显式设置D15确认的texture scale/wrap/mipmap、anchor/pivot、blend、roundPixels、resolution和ordering。
4. 按command sequence修改scene，不重算Note/HUD业务。
5. browser renderer与recording scene snapshot逐命令一致；raster只验证D16批准case。
6. 用PR06–PR34、PR39–PR40验证。

### RP12 failure/context/dispose矩阵

1. 建立backend structured fault和terminal precedence。
2. 覆盖decode失败、Pixi创建失败、command unknown、missing object、duplicate object和context loss。
3. dispose按object→geometry/subtexture→base texture/application ownership逆序释放。
4. 验证domain不被backend failure回写，重复dispose幂等，跨session拒绝。
5. 用PR35–PR38验证。

### RP13 production oracle与全回归

1. 建立`simulator:test:resource-pixi-rendering`总入口，从全新临时产物运行。
2. 先验证证据closure、manifest、PR01–PR40顺序/hash，再运行contracts/engine/backend/Pixi suites。
3. 重放ordinary/HABAHIRO production chart和固定domain输入，逐字段匹配command/scene oracle。
4. 运行browser/headless策略由D16锁定；不得临时跳过Pixi adapter验证。
5. 回归first-slice、chart、clock、Auto、manual、score-life-state。
6. 运行dependency、forbidden-default、resource-network和证据source/copy/index反审。

### RP14 独立验收

1. production、tests和evidence均提交/push后，从HEAD和全新临时产物复验。
2. 创建`tmp/simulator-resource-pixi-rendering-acceptance.md`。
3. 逐项记录V01/D01–D18、RP00–RP14、PR01–PR40和排除范围。
4. 验证Garupa与Reverse远端差异均为`0 0`。
5. 只有全部通过才更新`src/simulator/README.md`为阶段完成。

## 11. 验证计划

RP02关闭前不得加入下列package scripts。计划命令：

```powershell
npx.cmd tsc -p src/simulator/tsconfig.json
npm.cmd run simulator:test:render-contracts
npm.cmd run simulator:test:render-producers
npm.cmd run simulator:test:render-notes
npm.cmd run simulator:test:render-mesh-lines
npm.cmd run simulator:test:render-hud
npm.cmd run simulator:test:render-resources
npm.cmd run simulator:test:render-pixi
npm.cmd run simulator:test:render-failures
npm.cmd run simulator:test:render-production
npm.cmd run simulator:test:resource-pixi-rendering
node tmp/simulator-reverse-evidence/resource-pixi-rendering/verify.mjs
node tmp/simulator-reverse-evidence/resource-pixi-rendering/verify.mjs --index
```

每个runner必须：

1. 编译到新的系统临时目录，不消费旧产物。
2. 先验证closure为closed且PR01–PR40无unknown/blocker。
3. 只通过public owner和typed backend contract驱动，不写private state。
4. 不联网、不调用Python、不读取Reverse工作树。
5. expected scene/command/frame不由production helper或待测Pixi生成。
6. 验证engine无Pixi/React/DOM/Tauri/编辑器依赖。
7. 验证production无Bestdori/CDN URL fetch、placeholder texture和未声明Pixi默认配置。
8. Pixi实际adapter必须在D16锁定的可重复环境运行；只有recording backend绿色不足以验收。

RP13总入口至少包含：

- PR01–PR40全部case；
- ordinary/HABAHIRO production chart；
- Manual/Auto和Score/Life/Skill/Fever owner到renderer/HUD的完整链；
- pool reuse、same-frame multi-entry、pause/fault/dispose/context failure；
- resource hash/decode/atlas/profile完整失败矩阵；
- scene/command exact和D16批准的raster anchor；
- 全上游回归、dependency/static反审、evidence index。

## 12. 批次与提交纪律

1. 不新建、不切换分支。
2. 每批先更新本文档执行记录，再暂存当前目标文件。
3. Reverse evidence、Garupa evidence freeze、contracts、engine producers、Pixi/resource backend、tests和acceptance必须分别提交。
4. production批不得包含test/oracle；test批不得顺带修production。
5. resource metadata与resource binary不得混提；二进制只有D02明确批准后才可入库。
6. 提交前执行目标路径`git diff --check`；暂存后执行`git diff --cached --check`及staged name-status/stat。
7. 涉及证据包必须执行`verify.mjs --index`。
8. 中文语义提交建议：
   - `docs(simulator): 建立资源与Pixi渲染任务书`
   - `evidence(simulator): 冻结渲染资源与场景证据`
   - `feat(simulator): 建立渲染命令与资源所有权`
   - `feat(simulator): 恢复Note网格与HUD消费链`
   - `feat(simulator): 实现Pixi渲染后端`
   - `test(simulator): 验证资源与Pixi固定场景`
   - `docs(simulator): 关闭资源与Pixi渲染阶段`
9. 每批提交后push并确认：

```powershell
git rev-list --left-right --count origin/codex/refactor-simulator-implementation...HEAD
```

结果必须为`0 0`。

## 13. 阶段完成定义

只有以下条件全部满足，RP14才能关闭：

1. 锁定10.1.4/230 binary、metadata和resource pack identity。
2. V01/D01–D18全部closed，`rendering_gate=closed`、`production_authorization=true`。
3. PR01–PR40全部confirmed、`unknown_fields=[]`、`blocking_findings=[]`。
4. 每个resource key/row、transform、geometry、sorting、mask、animation和lifecycle映射最终证据ID。
5. resource profile/provider不可变、hash锁定、无网络、失败原子且所有权明确。
6. engine只产生typed semantic commands，无Pixi/DOM/React/Tauri/编辑器依赖。
7. Note Sprite、Flick icon、Long/Slide mesh、sync/back line、field/mask与HABAHIRO route匹配。
8. Score/Combo/AP/AddScore/Result/Life/Skill/Fever HUD消费链匹配。
9. pool identity、pause/reset/fault/dispose/context loss和跨session边界匹配。
10. Pixi backend只消费command，不author领域状态，不依赖隐式默认值。
11. scene/command oracle exact匹配；raster只在D16证据定义范围内通过。
12. resource binary provenance/分发决策明确，未批准资产不入库。
13. ordinary/HABAHIRO production重放通过。
14. first-slice、chart、clock、Auto、manual、score-life-state全回归通过。
15. evidence source/copy/index、dependency和forbidden-default/network反审通过。
16. `tmp/simulator-resource-pixi-rendering-acceptance.md`从提交后HEAD独立验收通过。
17. GarupaEditor与Reverse远端差异均为`0 0`。

## 14. 当前审计结论

- 当前上游领域状态足以成为renderer/HUD source，但不能证明任何可见表现。
- 当前Reverse历史渲染调查覆盖面高，适合批量生成10.1.4 target set；它们仍是H系列，不能解除生产门。
- 最大硬门不是Pixi API，而是10.1.4 resource/scene identity、坐标/排序/mask映射、runtime command时点和资源分发边界。
- 当前阶段下一动作是RP01：先在Reverse创建并提交10.1.4 render/resource静态重基线；不是直接编写Pixi代码。
- 所有未确认路径继续返回`evidence-required`，不得以placeholder、Pixi默认值或“视觉接近”填补。
