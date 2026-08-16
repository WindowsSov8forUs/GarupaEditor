# Simulator 逆向证据工作流

## 强制来源与目录

- 唯一行为依据：`HOST________\VSCode\GirlsBandParty-Reverse`。
- 逆向获取、反编译、runtime capture、oracle、closure、profile和verifier均在Reverse对应目录完成。
- Reverse未提交工作树、`.claude/`、`runtime/tools/`和未登记临时输出不属于证据。
- GarupaEditor的`tmp/`只保存本地任务书、验收日志、发布记录和工作笔记；生产代码和提交测试不得读取它。

## 提交顺序

1. 在Reverse取证并生成结果。
2. 在Reverse运行对应verifier、`git diff --check`和暂存检查。
3. 在Reverse提交并推送。
4. 确认所引用的Reverse证据提交已存在于远端。
5. 必要时更新测试fixture manifest，然后实现或修改simulator；未知行为继续返回`evidence-required`。

## 当前启动方向证据（重新开放）

- Reverse提交`78e6a70ea906aa1fa778b56e843c7663fdd3b4bc`已push；`startup-direction-runtime-contract-10-1-4/`的SD01–SD16和portable pack继续约束presentation、视觉owner、状态0→5、voice/BGM已确认子集及输入边界。
- 旧closure遗漏`InGameManager.playGayaSound → CE.SoundManager.PlaySELoop(SE_RHYTHM_GAYA)`。现有audio证据还记录1.0 volume、0.5秒fade-in、1.5秒fade-out和`gayaSoundResource@0x120`，但尚未关闭四模式`GayaSoundRequired`、间接/动画调用、BGM prepare/play与全生命周期清理。
- 在新的`startup-audio-callgraph-10-1-4/`静态/运行/资源证据完成、verify、commit并push前，`startupDirectionPortable`保持`open-evidence-required`，production以`simulator.startup.complete-callgraph-open`失败关闭。
- Garupa fixture只复制已登记的最小证据；production不读取fixture，动态presentation没有默认值。RD01/RV01及旧startup WebView2 digest只作视觉冲突检查，不证明完整音频或speaker onset。
- 新调查必须从10.1.4/230当前ARM64、serialized assets和观察型R1重算调用图，不得把Reverse未提交`runtime/tools/`、10.1.3行为或旧总体`closed`字段当作授权。

## 测试边界

隔离测试需要离线输入时，只从已推送的Reverse提取最小快照到`src/simulator/testing/fixtures/`，并记录来源提交、源相对路径、字节数和SHA-256。`verifyTestingFixtures.mjs`只校验这些快照，不读取Reverse或网络。生产代码不得读取本地工作记录、Reverse或testing fixture。

Garupa JSON公共schema位于`src/chart/garupa.ts`；本轮字段基线来源为`origin/main@a4ed4bbaa49d3e7db0407a1f2d5500f6d5940114:src/chartCore.ts`。能力边界应直接体现在Public合同、capability类型、失败返回和可执行测试中。发布耗时、逐文件哈希、候选提交及attestation只保留在忽略的`tmp/`，不提交为运行时或测试依赖。
