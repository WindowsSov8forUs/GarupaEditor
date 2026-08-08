# Simulator offline test fixtures

这些是隔离测试所需的最小离线快照，不是生产资源，也不是新的行为来源。

- 原始逆向证据统一在 `HOST________\VSCode\GirlsBandParty-Reverse` 获取、校验、提交和推送。
- 每个快照的来源、Reverse 提交、相对路径、字节数和 SHA-256 记录在 `manifest.json`。
- 生产代码不得读取本目录；只有 `src/simulator/testing/` 测试旁路可以读取。
- 新证据必须先进入已推送的 Reverse，再按测试需要提取最小快照；不得从 GarupaEditor/tmp 反向生成证据。
- `reverse-snapshots/audio/` 仅包含 AU-C01–AU-C40 的 command/PCM oracle、32-byte 项目自制数值输入和 19,264-byte 可移植 PCM expected；不含原作或外部音频资源，也不声明 CRI/browser/hardware 波形等价。
