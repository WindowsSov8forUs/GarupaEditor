# Simulator offline test fixtures

这些是隔离测试所需的最小离线快照，不是生产资源，也不是新的行为来源。

- 原始逆向证据统一在 `HOST________\VSCode\GirlsBandParty-Reverse` 获取、校验、提交和推送。
- 每个快照的来源、Reverse 提交、相对路径、字节数和 SHA-256 记录在 `manifest.json`。
- 生产代码不得读取本目录；只有 `src/simulator/testing/` 测试旁路可以读取。
- 新证据必须先进入已推送的 Reverse，再按测试需要提取最小快照；不得从GarupaEditor本地工作记录反向生成证据。
- `reverse-snapshots/audio/` 仅包含 AU-C01–AU-C40 的 command/PCM oracle、32-byte 项目自制数值输入和 19,264-byte 可移植 PCM expected；不含原作或外部音频资源，也不声明 CRI/browser/hardware 波形等价。
- `reverse-snapshots/device-closure/` 包含已推送 Reverse `9fb544b2` 的 portable policy/profile/route、command/simulation/semantic-frame oracle、97行双门closure、difference matrix，以及8个逻辑纹理对应的7个去重PNG；PNG解码RGBA与current资源像素SHA一致，但不声明Unity shader、GPU、driver或framebuffer parity。
- `reverse-snapshots/score-hud-rank-gauge/` 包含已推送 Reverse `95e629d9` 的普通单人Score HUD/Rank/Gauge portable contract、SS 56-curve动画profile、6个hash锁定PNG及current sgm Rank标签字体，仅用于阈值/Float32边界、动画采样oracle及shared-store资源完整性测试。
- `reverse-snapshots/ordinary-visible-rendering/` 包含已推送 Reverse `f94947d9` 的普通Note动画与通用单人HUD contract/profile/oracle及4个去重PNG；closure/manifest已按Reverse `7629a508`同步UnityPy导出PNG direct-row坐标纠正，并按Reverse `50bc40b6`登记4个GamePlayButton lane-effect PNG。RhythmGameUI与sgm字体复用既有Score快照身份，不重复保存。该快照授权portable production消费，但不声明设备GPU/framebuffer exact。
- `reverse-snapshots/visual-layout-correction/` 只包含已推送Reverse `28b6a790`的HUD StarUIAnchor、Field UITexture/Bottom pivot、unclipped UIPanel与Judge Button4父链最小合同；不复制level3、脚本表、截图或Reverse工作输入。
- `reverse-snapshots/pixi-particle-visual/` 只包含已推送Reverse `50170414`的粒子simulation authority与Linear/sRGB、stretched roll、max-size、signed-axis、cross-renderer ordering协调合同；不复制软件renderer、旧oracle、texture或raw资源。
- `reverse-snapshots/c07-evidence/` 只保留已推送Reverse `a87cd3a7`真实WebView2合同与`0dd4d71c`fixed-device客观阻断disposition；旧initial-seek产品扩展fixture已随`startMilliseconds`能力删除。
- `reverse-snapshots/live-rehearsal/` 包含已推送Reverse `d100f96e`四模式/MoveTime合同与`6c0dfb76`control rendering profile两个最小JSON；不复制R1 trace或截图，controls atlas复用既有Score HUD快照。
- `reverse-snapshots/pause-ui/` 包含Reverse `770af437`最终Pause contract、serialized resource/layout profile、`99d40bcc`的19-trace最小manifest及Countdown1/2/3三张portable PNG；不复制19条gzip、设备账号数据或截图。生产资源由应用Builtin独立装配，production不得读取fixture。
- `reverse-snapshots/public-life-profile/` 只包含已推送Reverse `2cbea93d`的结构化合同JSON，用于校验普通单曲`1000/1000/2000`初始化与non-full/full伤害`-100/-50`、`-50/-25`；不复制ARM64切片或本地静态输入。
- `reverse-snapshots/ordinary-rendering-total-reaudit/` 只晋升Reverse `6908ddfa`的候选最小夹具：selected hierarchy/world坐标、HUD descendant布局/TweenAlpha/GameJudge静态oracle、particle→Note/HUD combined-root顺序、资源logical IDs及明确不作为原作oracle的browser验收政策；不复制13,323行完整账本、原始trace或Reverse closure。
- `reverse-snapshots/startup-direction/` 包含已推送Reverse `78e6a70e` 的SD01–SD16行为合同、portable hierarchy/geometry/timing/profile及line-star PNG，并新增Reverse `d408d758`的SDN01–SDN04空SD/空语音合同；共享atlas/font复用既有fixture，不复制ARM64、raw trace、截图、Prefab或动态presentation资源。
- `reverse-snapshots/skin-settings/` 包含Reverse `977f5e71`生成并hash登记的default八包、Limited-3九包；`composition-audio/`另按已提交`2098fe49` portable profile登记九个current common SE最小MP3快照，只用于default/Limited完整production composition与WebAudio离线验收。资源选择行为仍由Reverse master/call-chain证据决定，外部字节不作行为authority，production不得读取fixture。
- `reverse-snapshots/startup-audio/` 只包含已推送Reverse `c8562fe4`纠正后的四模式ordinary gate-not-taken startup-audio callgraph合同，以及供离线真实MP3解码所需的最小`SE_RHYTHM_GAYA`字节快照。该MP3仍按原已提交来源以151,033 bytes / `00DCFC…7554`固定；它只服务testing，production不得读取fixture或隐式联网。
- `reverse-snapshots/startup-live-tutorial-gate/` 只包含已推送Reverse `c8562fe4`的最小静态纠正合同：普通四模式只需一次session-start即自动到达4→5，首次Live四页教程是独立账号状态分支且`production_authorization=false`；不复制runtime trace、PNG、Prefab或ARM64。
- `reverse-snapshots/original-live-settings/` 只包含已推送Reverse `50bc40b6`的serialized lane-effect portable profile；四个PNG按实际ordinary-visible production owner存入上述目录并逐项在manifest记录源路径/commit/bytes/SHA。ARM64、raw trace和完整contract不复制。
- `reverse-snapshots/mv-live/` 只包含已推送Reverse `38802391`的runtime contract、command oracle、zero-count closure、portable media profile，以及项目自制20-frame MP4/H264和WebM/VP9 browser probe；不复制R1 trace、截图、83个ARM64切片或61MB original USM。probe不是原作画面/时序依据，production不得读取fixture。
