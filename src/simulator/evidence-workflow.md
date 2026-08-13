# Simulator 逆向证据工作流

## 强制来源与目录

- 唯一行为依据：`HOST________\VSCode\GirlsBandParty-Reverse`。
- 逆向获取、反编译、runtime capture、oracle、closure、profile 和 verifier 均在 Reverse 对应目录完成。
- Reverse 未提交工作树、`.claude/`、`runtime/tools/` 和未登记临时输出不属于证据。
- GarupaEditor 的忽略目录只保留本地任务书、验收日志和工作记录；不得作为可提交说明的验收权威，也不得建立 Reverse 证据副本。

## 提交顺序

1. 在 Reverse 取证/生成结果。
2. 在 Reverse 运行对应 verifier、`git diff --check` 和暂存检查。
3. 在 Reverse 提交并 `git push origin main`。
4. 确认 `git -C HOST________\VSCode\GirlsBandParty-Reverse rev-list --left-right --count origin/main...HEAD` 为 `0 0`。
5. 更新 `src/simulator/audit/` 的可提交能力/声明账本和必要的测试 fixture manifest。
6. 最后实现或修改 simulator；未知行为继续返回 `evidence-required`。

## 测试边界

隔离测试需要离线输入时，只从已推送的 Reverse 提取最小快照到 `src/simulator/testing/fixtures/`，并记录来源提交、源相对路径、字节数和 SHA-256。`verifyTestingFixtures.mjs` 只校验这些快照，不读取 Reverse 或网络。生产代码不得读取本地工作记录、Reverse 或 testing fixture。

## 可提交证据指针

当前production能力、证据目录与开放边界记录在[`audit/current-capability-matrix.json`](./audit/current-capability-matrix.json)。本地工作记录不能替代该矩阵或Reverse已推送提交。
