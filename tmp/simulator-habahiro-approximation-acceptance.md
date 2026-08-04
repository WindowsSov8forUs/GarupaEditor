# HABAHIRO 可审计近似完整实现验收记录

日期：2026-08-04

任务书：`tmp/simulator-habahiro-approximation-task.md`

## 1. 结论

HR01–HR12全部通过，HABAHIRO functional completion关闭。交付模式固定为：

- `mode = habahiro`
- `fidelity = approximate-current-external`
- visible label = `Approximate HABAHIRO`
- difference profile = `HA-D01-HA-D12`
- parity claim = `false`

本结论不宣称原作UnityFS、natural runtime owner/setter顺序、Root_effect原clip、GPU raster或original physical frame一致。

## 2. 资源验收

- 生产准备器只接受固定`https://bestdori.com/assets/jp/ingameskin/noteskin/habahiro_rip/` allowlist。
- 11项payload逐项校验byte length和SHA-256；`.sprites`与bundle preload映射解析为179个唯一source Sprite row。
- 6张atlas PNG分组为Flick 31、Long/SlideAmong 35、LongFlash 28、Normal 28、Normal16 28、Skill 28；`simultaneous_line`另作material。
- 原始资源bytes不入库；renderer prepare后profile为`networkAllowed=false`、`automaticFallbackAllowed=false`。
- tampered payload、非法metadata、重复/越界row与未声明logical asset均在对象创建前失败关闭。

## 3. Production验收

- 宽Normal/16/Skill/Flick/Long exact range key均由chart-authored contiguous range选择。
- Long/Slide child、base/advanced 42 vertices / 120 indices mesh、long/curve material、sync line及60-slot Multiple line进入固定pool/reuse/release链。
- Flick/Directional/Multiple icon、side visual和back-line由engine-clock animation驱动。
- HAB mesh width按current ARM64 `1.05f`与`0.0300000906f`逐步Float32运算；setting必须由宿主显式提供。
- field/judge/mask在initialize时原子创建；marker后依次发出`flash-start → change-lane → complete`，flash固定为已披露的0.25秒推导值。
- Pixi只消费typed semantic commands，不用ticker创作领域时间；pause通过停止engine update冻结。
- dispose后renderer object count为0；旧degraded和ordinary路线保持隔离。

## 4. 固定oracle

`786_miracle_april_habahiro_special`：

- 371 batches
- 6,130 frames
- 217,604 commands
- digest：`f1e1aac4b8c9b4de6d6cefde1f04f6a69636adedde9b352c559671098f22767c`
- lane phases：`flash-start,change-lane,complete`
- 正向检查：179-row atlas key、long-flash binding、42/120 mesh、field mask、0 owner release

兼容回归：

- legacy degraded HABAHIRO：371 batches / 4,902 commands
- ordinary `poppin_shuffle_special`：656 batches / 159,832 commands / `e174b8f0ab2e943ba84ab45a2ee8ecaca9fbcdc235fb32176c7cf6c18834a0ec`

## 5. 验证命令

```powershell
node tmp/simulator-habahiro-approximation-evidence/verify.mjs
npx.cmd tsc -p src/simulator/tsconfig.json
npm.cmd run simulator:test:habahiro-approximation
npm.cmd run simulator:test:render-production
npm.cmd run simulator:test:resource-pixi-rendering
```

专项总入口覆盖evidence verifier、static audit、isolated type check、tamper/parser/Float32 contract、actual Pixi消费和full-chart oracle；测试期间不联网。

独立复验基线：已推送`60e5bf5`。在Windows detached clean worktree中重新执行`npm.cmd ci --ignore-scripts`后：

- `npm.cmd run simulator:test:habahiro-approximation`：passed，HR01–HR12；
- `npm.cmd run simulator:test:resource-pixi-rendering`：passed，14/14 stages；
- evidence verifier：11 assets / 179 rows / 12 differences / 0 functional blockers / parity false；
- `.gitattributes`固定专项证据包为byte-preserving checkout，Windows clean verifier通过。

## 6. 保留差异

HA-D01–HA-D12继续作为产品可见、machine-readable差异边界。Exact HABAHIRO parity仍为`open-not-claimed`；只有获得current UnityFS、natural HAB runtime和original frame新证据后，才能另立exact parity任务，不得倒写本验收为原作逐帧复刻。
