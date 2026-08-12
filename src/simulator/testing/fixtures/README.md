# Simulator offline test fixtures

这些是隔离测试所需的最小离线快照，不是生产资源，也不是新的行为来源。

- 原始逆向证据统一在 `HOST________\VSCode\GirlsBandParty-Reverse` 获取、校验、提交和推送。
- 每个快照的来源、Reverse 提交、相对路径、字节数和 SHA-256 记录在 `manifest.json`。
- 生产代码不得读取本目录；只有 `src/simulator/testing/` 测试旁路可以读取。
- 新证据必须先进入已推送的 Reverse，再按测试需要提取最小快照；不得从 GarupaEditor/tmp 反向生成证据。
- `reverse-snapshots/audio/` 仅包含 AU-C01–AU-C40 的 command/PCM oracle、32-byte 项目自制数值输入和 19,264-byte 可移植 PCM expected；不含原作或外部音频资源，也不声明 CRI/browser/hardware 波形等价。
- `reverse-snapshots/device-closure/` 包含已推送 Reverse `9fb544b2` 的 portable policy/profile/route、command/simulation/semantic-frame oracle、97行双门closure、difference matrix，以及8个逻辑纹理对应的7个去重PNG；PNG解码RGBA与current资源像素SHA一致，但不声明Unity shader、GPU、driver或framebuffer parity。
- `reverse-snapshots/score-hud-rank-gauge/` 包含已推送 Reverse `95e629d9` 的普通单人Score HUD/Rank/Gauge portable contract、SS 56-curve动画profile、6个hash锁定PNG及current sgm Rank标签字体，仅用于阈值/Float32边界、动画采样oracle及shared-store资源完整性测试。
- `reverse-snapshots/ordinary-visible-rendering/` 包含已推送 Reverse `f94947d9` 的普通Note动画与通用单人HUD contract/profile/oracle/closure/manifest及4个去重PNG；RhythmGameUI与sgm字体复用既有Score快照身份，不重复保存。该快照授权portable production消费，但不声明设备GPU/framebuffer exact。
