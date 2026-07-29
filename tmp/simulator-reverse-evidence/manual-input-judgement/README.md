# 手动输入与判定冻结证据包

本目录第一批冻结Reverse提交`11b8250853ca12a2106c66245724467701d9eb23`的
10.1.4手动输入静态契约：99个独立ARM64方法范围、12个owner type字段、8个enum、
逐word版本差异、修正后的Slide Wait/over-Wait边界及离线verifier。

当前只关闭V01、D01、D02。D03–D15与MJ01–MJ26 runtime oracle仍是M02/M03生产代码
硬门；不得因静态包绿色而实现手动输入。后续Reverse runtime证据提交后必须作为新批次追加，
不得修改本批已冻结字节或从Reverse未提交工作树复制。

运行时代码不得读取本目录。模拟器TypeScript生产与测试不得执行其中Python、访问Reverse工作树
或联网；Python仅保留为Reverse离线静态审计生成器。

验证：

```powershell
node tmp/simulator-reverse-evidence/manual-input-judgement/verify.mjs
node tmp/simulator-reverse-evidence/manual-input-judgement/verify.mjs --index
```
