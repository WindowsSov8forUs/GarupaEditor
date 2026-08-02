# 资源与 Pixi 渲染交付证据包

本目录冻结 `jp.co.craftegg.band` 10.1.4（code 230，`arm64-v8a`）资源与渲染阶段的静态、资源、ordinary运行时、实体frame manifest与显式HAB降级交付证据。Reverse 来源提交为 `4b4ebdfada2c2deea7cb9b6d838e61b1e3240876`；逐文件字节数和 SHA-256 见 `manifest.json`。

## 交付闭合结果

- 静态基线：673 个 managed 方法、32 个实例布局、19 个枚举、673 个独立 ARM64 TSV。
- 指令迁移：652 个方法仅有保守规范化后的重定位差异；21 个方法保持 current 专用语义形状，不以地址或 signature 外推行为。
- 当前资源：11,026 条 `AssetBundleInfo` 记录、57 个已缓存 `ingameskin/*` bundle、100 个当前 APK Note/HUD resource。
- 可见资产：8 组 HUD scene/atlas/font profile、4 个 Skill clip、4 个 Note clip、5 路 current ScoreUp route；12个Unity正无穷值以显式Float32位模式`7F800000`严格JSON编码。
- 离线分类：H01–H28、D01–D18、PR01–PR40 均已逐项分类，`unknown_static_work=[]`。
- RP02计划：55个current hook target、ordinary/HABAHIRO 2个exact R1场景、13个exact实体frame anchor及缺证据必失败的trace/frame/oracle verifier。
- ordinary运行时：自然Auto Live R1冻结87,364个连续匿名事件、8类render/HUD事件、8个required anchor、632个相对frame epoch及510组同alias mesh生命周期。
- geometry R2：10个setter逐方法锁定ARM64字节；自然Auto Live追加87,037个匿名setter事件、636个相对frame、510个mesh owner与80个line owner，闭合22-vertex topology、indices/UV/color、threshold、endpoint/equal width及owner-scoped transform逐字段Float32载荷。
- current sync-line profile：从锁定10.1.4 APK重新解析两点world-space LineRenderer与SyncNoteLine material，确认View/Stretch、零cap/corner/mask及opaque white，再与R2组合锁定camera-facing textured quad portable mapping。
- ordinary projection profile：从当前`RhythmGame.unity`锁定build index 3、`GameCamera`正交size 1与1600×720实体viewport，并对R2全部24,470 endpoint与12,235 width写入验证`x=800+worldX*360`、`y=360-worldY*360`、`width=worldWidth*360`且无clamp。
- ordinary Note geometry producer profile：一次合并17个current ARM64方法、13个button与Launcher scene transform、Note motion/scale、R2 22/60 base mesh与sync-line margin/update公式；只授权固定ordinary子集，advanced mesh、Multiple back line、threshold shader和HAB exact保持失败关闭。
- ordinary HUD runtime semantic profile：从已提交R1一次聚合23个HUD target、14,084个HUD与1,452个HUD-animation caller entry、首次判定顺序和两次life-heal→UpdateView→updateLifeText顺序；5条static-only route保持失败关闭。
- visible HUD/mask/animation R3：22个setter与22个独立ARM64 slice；自然Demo Live冻结19,888个caller-correlated事件、631个相对frame，授权bitmap score/combo/life、score-skill overlay、serialized field/sudden mask、combo/GameJudge restart-at-zero及portable combo/life-heal curve sampling；Guard/NeverDie/Judge保持false。
- Note family R4：30个current owner target、6个新增NoteSlide ARM64 slice及Flick/Slide/Multiple三条自然Demo Live；冻结118,152个caller-correlated事件与1,258个aggregate relative frame，授权front Flick/Directional icon、observed Slide mesh+line lifecycle及MultipleDirectional connect/back-line。Long-after Flick、Slide Wait runtime、add-Long/add-Slide/after Multiple、Advanced与threshold继续false。
- ordinary实体frame：7个1600×720 physical-device anchor通过隐私审查；PNG只保留于Reverse提交，Garupa仅冻结manifest中的尺寸与SHA-256。
- HAB资源：12项current external portable asset与179个Sprite row/hash已锁定；production/test只能消费host本地hash匹配字节，禁止联网。
- HAB降级：2个显式profile、HA-D01–HA-D12共12项差异、179个diagnostic Sprite key；maxNoteCount 731、multiple pool 60，generated frame永不作为原作golden。
- 门状态：`rendering_delivery_gate=closed`、`production_authorization=true`、`habahiro_exact_parity_gate=open-not-claimed`；授权范围仅为显式`ordinary-exact-habahiro-degraded` fidelity下的typed renderer与Pixi backend。

## 双轨门限

- Delivery ordinary：natural Live R1与7个physical frame已关闭，使用当前10.1.4 ordinary资源与scene/command合同。
- Delivery HAB：首选`current-external-portable-atlas`；兼容已披露的`historical-atlas-proxy`或`current-ordinary-stretch-proxy`。所有路径必须显示`Approximate HABAHIRO`、禁止exact静默fallback并排除于原作parity tests。
- Exact HAB：原始current UnityFS、natural HAB对象/顺序/phase与原始frame仍不可达，保持开放且不宣称一致。
- Overall：显式delivery profile已解除RP03生产硬门；profile外路径、缺资源、hash mismatch或未确认配置仍须在任何renderer mutation前失败关闭。

## 边界

- 冻结目录不包含 APK、AssetBundle、7张实体frame PNG、Bestdori下载字节、`libil2cpp.so`、metadata、dump、IDA 数据库、设备账户数据或 `runtime/tools/`。
- 设备只读 cache、锁定 APK、实体PNG和外部资源字节只用于 Reverse 取证；本包仅提交最小结构化证据与匿名压缩R1/R2/R3/R4。
- Portable contract已由delivery closure授权作为RP03输入，但production/test仍不得读取本证据目录、调用Python或请求网络。
- 原始HAB exact parity继续开放；`production_authorization=true`不得被解释为UnityFS、natural HAB runtime或原始HAB raster一致性。

## 验证

```powershell
node tmp/simulator-reverse-evidence/resource-pixi-rendering/verify.mjs
node tmp/simulator-reverse-evidence/resource-pixi-rendering/verify.mjs --index
```

`verify.mjs`校验807个冻结文件的Reverse commit/source working tree/copy/index四方字节、逐文件SHA-256、目录文件集、样本身份、673/32/19静态计数、资源/HUD/动画/ScoreUp计数、87,364-event ordinary R1、87,037-event geometry R2、10个setter target/510 mesh owner/80 line owner、1个current sync-line portable profile、1个ordinary正交projection profile、1个ordinary Note geometry producer profile、1个Note child lifecycle profile及13个隔离ARM64 slice、30个R4 target/6个新增Slide slice/118,152-event与1,258-frame aggregate R4及其保守授权profile、1个ordinary HUD runtime semantic profile、22个HUD setter target/ARM64 slice、19,888-event/631-frame visible R3及1个visible HUD/mask/animation profile、7个physical frame manifest、12项current external HAB资源、H/D/PR closure、55/2/13 exact计划、2/12/179降级HAB决策及delivery/exact双轨门限。
