# 资源与 Pixi 渲染离线证据包

本目录冻结 `jp.co.craftegg.band` 10.1.4（code 230，`arm64-v8a`）资源与渲染阶段截至服务器硬门前的全部可离线证据。Reverse 来源提交为 `d88188f5fcea2ade712577f1c64e44002fe77d48`；逐文件字节数和 SHA-256 见 `manifest.json`。

## 离线闭合结果

- 静态基线：673 个 managed 方法、32 个实例布局、19 个枚举、673 个独立 ARM64 TSV。
- 指令迁移：652 个方法仅有保守规范化后的重定位差异；21 个方法保持 current 专用语义形状，不以地址或 signature 外推行为。
- 当前资源：11,026 条 `AssetBundleInfo` 记录、57 个已缓存 `ingameskin/*` bundle、100 个当前 APK Note/HUD resource。
- 可见资产：8 组 HUD scene/atlas/font profile、4 个 Skill clip、4 个 Note clip、5 路 current ScoreUp route；12个Unity正无穷值以显式Float32位模式`7F800000`严格JSON编码。
- 离线分类：H01–H28、D01–D18、PR01–PR40 均已逐项分类，`unknown_static_work=[]`。
- RP02计划：55个current hook target、ordinary/HABAHIRO 2个R1场景、13个实体frame anchor及缺证据必失败的trace/frame/oracle verifier。
- HAB降级：2个显式profile、HA-D01–HA-D12共12项差异、179个diagnostic Sprite key；maxNoteCount 731、multiple pool 60，generated frame永不作为原作golden。
- 门状态：`offline_work_gate=closed`、`offline_plan_gate=closed`、`habahiro_exact_parity_gate=open`、`habahiro_degraded_delivery_gate=closed-authorized-by-explicit-user-request`、`rendering_gate=open`、`production_authorization=false`。

## 双轨门限

- Exact S01：当前 `ingameskin/noteskin/habahiro` bundle 不在 cache index；可通过游戏资源服务直接只读取得，或使用已证明的当前缓存关闭。
- Exact S02/S03：HAB natural Live对象/顺序/phase和原始frame无法由静态或合成执行等价替代，继续保持开放。
- Degraded：允许显式选择`historical-atlas-proxy`或`current-ordinary-stretch-proxy`；必须显示`Approximate HABAHIRO`，禁止从exact静默fallback，并排除于parity tests。
- Overall：ordinary natural Live R1/frame及剩余render contracts仍阻塞整体`rendering_gate`，本决策不授权production。

## 边界

- 冻结目录不包含 APK、AssetBundle 二进制、`libil2cpp.so`、metadata、dump、IDA 数据库、设备账户数据或 `runtime/tools/`。
- 设备只读 cache 与锁定 APK 只用于 Reverse 离线提取；本包只提交最小结构化 JSON/TSV/Python/verifier 文本证据。
- Portable contract 只是待 runtime 顺序闭合的 backend-neutral 草案，不授权 RP03–RP14 production。
- Garupa production/test/package scripts 仍不得读取本证据目录或调用 Python。

## 验证

```powershell
node tmp/simulator-reverse-evidence/resource-pixi-rendering/verify.mjs
node tmp/simulator-reverse-evidence/resource-pixi-rendering/verify.mjs --index
```

`verify.mjs`校验 713 个冻结文件的 Reverse commit/source working tree/copy/index 四方字节、逐文件 SHA-256、目录文件集、样本身份、673/32/19 静态计数、资源/HUD/动画/ScoreUp计数、H/D/PR分类、55/2/13采集计划、2/12/179降级HAB决策及exact/degraded双轨门限。
