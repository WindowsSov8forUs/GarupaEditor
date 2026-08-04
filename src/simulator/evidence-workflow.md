# Simulator 逆向证据工作流

## 强制来源与目录

- 唯一行为依据：`HOST________\VSCode\GirlsBandParty-Reverse`。
- 逆向获取、反编译、runtime capture、oracle、closure、profile 和 verifier 均在 Reverse 对应目录完成。
- Reverse 未提交工作树、`.claude/`、`runtime/tools/` 和未登记临时输出不属于证据。
- GarupaEditor `tmp/` 只保留任务书、验收记录、专项计划、开放缺口和指针文档；不建立 Reverse 证据副本目录。

## 提交顺序

1. 在 Reverse 取证/生成结果。
2. 在 Reverse 运行对应 verifier、`git diff --check` 和暂存检查。
3. 在 Reverse 提交并 `git push origin main`。
4. 确认 `git -C HOST________\VSCode\GirlsBandParty-Reverse rev-list --left-right --count origin/main...HEAD` 为 `0 0`。
5. 更新 GarupaEditor 任务书、`tmp/simulator-evidence-pointers.md` 和必要的测试 fixture manifest。
6. 最后实现或修改 simulator；未知行为继续返回 `evidence-required`。

## 测试边界

隔离测试需要离线输入时，只从已推送的 Reverse 提取最小快照到 `src/simulator/testing/fixtures/`，并记录来源提交、源相对路径、字节数和 SHA-256。`verifyTestingFixtures.mjs` 只校验这些快照，不读取 Reverse 或网络。生产代码不得读取 tmp、Reverse 或 testing fixture。

## 当前证据指针

详细阶段目录映射和当前 Reverse 提交见 `tmp/simulator-evidence-pointers.md`。该文件是本地辅助指针；本文件和 Reverse 提交才是可提交的流程约束。
