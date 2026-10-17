# OpenCode 2 兼容验证（2026-10-18）

本次使用 macOS ARM64、官方 `@opencode/cli` 2.0.32。

- 新增 V2 CLI 版本识别、原生二进制发现、模型目录映射、会话提交/等待、权限拒绝、消息读取与取消适配。已有外部工具解析、纠正和转换逻辑继续复用。
- 1.x 使用原 `opencode` 数据目录；2.x 使用 `opencode-v2`，避免两个版本的数据库相互冲突。
- 删除此前加入的免费层 403 自动回退 1.x 逻辑，不通过降级掩盖 V2 请求错误。
- 无本地运行时时仍使用原官方 npm `opencode-ai` 下载路径；本次没有把默认下载通道切换到 V2。

## 实际网络对照

使用相同官方 V2 二进制、适配层和独立配置，仅切换系统代理环境：

| 模型 | 直连（再次复测） | 系统 HTTP/HTTPS 代理 |
| --- | --- | --- |
| Big Pickle | 403 FreeTierError | 正确返回外部 Read 调用 |
| Space Bunny | 403 FreeTierError | 正确返回外部 Read 调用 |

报错为 `OpenCode's free tier can only be used from within OpenCode`。此前官方 CLI 自身在直连下也复现了这一错误。此对照证明网络路径影响本机结果，不能据此确定上游具体拒绝原因。未修改鉴权、请求头，也未复制用户凭据；保留用户保存的系统代理开关。

## 完整请求验证

通过 OW Bridge 的真实 `/v1/chat/completions` HTTP 接口，对上述两个模型分别验证：

1. 返回正确的外部 Read 工具调用，原生工具执行尝试为 0。
2. 回传模拟的外部工具结果 `OW-V2-ROUNDTRIP-OK`。
3. SSE 回答包含该结果并以 `[DONE]` 正常结束。
4. 实际运行版本始终为 2.0.32，无版本回退。
5. 使用打包后 Mac App 的 Electron Node 运行时及包内源码重复上述两模型流程，全部通过。Mac ZIP 解包后通过 codesign 深度完整性验证。

全部 110 项自动化测试通过。自动化用例另覆盖原生调用拒绝并交接、上游错误、取消和清理、模型能力映射与版本发现。

## 边界

Windows 代码路径有自动化用例，本轮未在 Windows 实机验证或更新 Windows 安装包。未在 WorkBuddy GUI 中复测完整任务；不能将两个模型的成功推广为所有模型或所有复杂任务均通过。Mac 产物使用临时签名，不是 Apple Developer ID 签名或公证。
