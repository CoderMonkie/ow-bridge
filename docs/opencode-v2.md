# OpenCode 2 兼容验证（2026-10-18）

本次使用 macOS ARM64、官方 `@opencode/cli` 2.0.32 与 `opencode-ai` 1.19.3。

- 新增 V2 CLI 版本识别、原生二进制发现、模型目录映射、会话提交/等待、权限拒绝、消息读取与取消适配。已有外部工具解析、纠正和转换逻辑继续复用。
- 1.x 使用原 `opencode` 数据目录；2.x 使用 `opencode-v2`，避免两个版本的数据库相互冲突。
- V2 只对明确的 HTTP 403 `free tier can only be used from within OpenCode` 自动回退官方 1.x；地区、额度、格式错误和超时不触发版本回退。用户自己的 OpenCode 安装不会被替换。
- 无本地运行时时仍使用原官方 npm 1.x 下载路径；本次没有把默认下载通道切换到 V2。

## 已验证

1. 官方 V2 `serve` 能启动，V2 模型、agent 和权限接口可访问。
2. 官方 V2 `run --standalone` 的 Big Pickle，以及 CLI 连接官方服务的 Space Bunny，均返回上述免费额度 403；不是仅 OW Bridge 返回该错误。
3. 新版适配层的模拟 HTTP 测试覆盖文本转工具、原生调用拒绝并交接、上游错误、取消和清理、模型能力映射。
4. 完整实测 V2 拒绝后自动切换独立 1.19.3，Big Pickle 正确返回 Read 工具调用。
5. 0.2.10 Mac 打包后的服务实测：自动选择本地 V2，切换 1.19.3，读取 10 个模型；DeepSeek/GLM/LongCat/MiMo 检测可用；DeepSeek 的 HTTP SSE 请求返回 200、OK、stop 和 [DONE]。
6. 本轮 Big Pickle 的打包后检测超时；最初只等待该模型的测试脚本因此达到测试截止时间。随后对同一服务已检测通过的 DeepSeek 独立请求成功。没有修改产品请求超时策略。
7. 全部 110 项自动测试通过。Mac ZIP 解包后通过 codesign 深度完整性验证（临时签名，不是 Apple Developer ID 签名或公证），打包源码与工作区一致。

## 边界

V2 原生免费模型链路仍受上述上游 403 限制，不能宣称它已经端到端通过。当前真实免费模型请求由兼容回退后的 1.x 完成。Windows 代码路径已覆盖自动化用例，但本轮未在 Windows 实机验证或更新 Windows 安装包。未在 WorkBuddy GUI 中复测完整任务。
