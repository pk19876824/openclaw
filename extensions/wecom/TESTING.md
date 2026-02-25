# WeCom (企业微信) 集成测试文档

## 概述

本文档提供 OpenClaw 企业微信集成的完整测试指南。

## 前置条件

### 1. 企业微信应用配置

#### 1.1 创建自建应用

1. 登录企业微信管理后台：https://work.weixin.qq.com/
2. 进入 **应用管理** → **自建** → **创建应用**
3. 填写应用信息：
   - 应用名称：OpenClaw Bot
   - 应用 Logo：上传图标
   - 可见范围：选择需要使用的部门/成员

#### 1.2 获取应用凭证

在应用详情页获取以下信息：

- **企业 ID (CorpID)**：在"我的企业" → "企业信息"中查看
- **AgentID**：应用详情页顶部
- **Secret**：应用详情页"Secret"栏（点击查看）

#### 1.3 配置接收消息

1. 在应用详情页找到 **接收消息** 配置
2. 点击"设置API接收"
3. 填写以下信息：

**URL：** `http://你的服务器IP:3000/wecom/events`

**Token：** 随机字符串（建议使用以下命令生成）
```bash
openssl rand -base64 32 | tr -d "=+/" | cut -c1-32
```

**EncodingAESKey：** 点击"随机获取"按钮自动生成

4. 点击"保存"（企业微信会发送验证请求）

**注意：** 在保存前，需要先启动 OpenClaw Gateway，否则验证会失败。

### 2. 服务器配置

#### 2.1 网络要求

- 服务器需要有公网 IP 或通过内网穿透暴露端口
- 开放端口 3000（或自定义端口）
- 企业微信服务器需要能访问你的 Webhook URL

#### 2.2 防火墙配置

```bash
# Ubuntu/Debian
sudo ufw allow 3000/tcp

# CentOS/RHEL
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload
```

#### 2.3 内网穿透（可选）

如果服务器没有公网 IP，可以使用内网穿透工具：

**使用 ngrok：**
```bash
ngrok http 3000
```

**使用 frp：**
```ini
# frpc.ini
[wecom]
type = tcp
local_ip = 127.0.0.1
local_port = 3000
remote_port = 3000
```

## OpenClaw 配置

### 1. 编辑配置文件

编辑 `~/.openclaw/config.yaml`：

```yaml
channels:
  wecom:
    enabled: true
    
    # 应用凭证
    corpId: "ww1234567890abcdef"
    agentId: "1000002"
    secret: "your_secret_here"
    
    # Webhook 配置
    token: "your_token_here"
    encodingAESKey: "your_aes_key_here"
    webhookPort: 3000
    webhookPath: "/wecom/events"
    webhookHost: "0.0.0.0"
    
    # 访问策略
    dmPolicy: "pairing"           # 私聊策略: open/pairing/allowlist
    groupPolicy: "allowlist"      # 群聊策略: open/allowlist/disabled
    requireMention: false         # 群聊是否需要 @提醒（测试时建议 false）
    
    # 白名单（可选）
    allowFrom:
      - "*"                       # 允许所有用户（测试用）
    groupAllowFrom:
      - "*"                       # 允许所有群聊（测试用）
    
    # 历史记录
    historyLimit: 20              # 群聊历史记录条数
    dmHistoryLimit: 20            # 私聊历史记录条数
    
    # 媒体文件
    mediaMaxMb: 20                # 最大媒体文件大小（MB）
```

### 2. 配置说明

#### 访问策略

**dmPolicy（私聊策略）：**
- `open`：允许所有用户（需要 allowFrom 包含 `*`）
- `pairing`：需要配对（用户首次使用需要批准）
- `allowlist`：仅白名单用户

**groupPolicy（群聊策略）：**
- `open`：允许所有群聊
- `allowlist`：仅白名单群聊
- `disabled`：禁用群聊

**requireMention：**
- `true`：群聊中需要 @机器人才响应
- `false`：群聊中所有消息都响应

## 启动和测试

### 1. 编译 OpenClaw

```bash
cd /home/openclaw/code/openclaw

# 安装依赖
pnpm install

# 编译
pnpm build
```

### 2. 启动 Gateway

```bash
# 启动
openclaw gateway start

# 查看状态
openclaw status

# 查看日志
openclaw gateway logs -f
```

**预期输出：**
```
wecom[default]: starting Webhook server on 0.0.0.0:3000, path /wecom/events...
wecom[default]: Webhook server listening on 0.0.0.0:3000/wecom/events
```

### 3. 验证 Webhook

在企业微信管理后台保存 Webhook 配置时，企业微信会发送验证请求。

**成功标志：**
- 企业微信显示"保存成功"
- Gateway 日志显示：`wecom[default]: URL verification successful`

**失败排查：**
```bash
# 检查端口是否监听
netstat -tlnp | grep 3000

# 检查防火墙
sudo ufw status

# 测试 Webhook 可访问性
curl http://你的服务器IP:3000/wecom/events
```

### 4. 测试消息收发

#### 4.1 私聊测试

1. 在企业微信中找到你的应用
2. 点击进入应用
3. 发送测试消息：

```
你好
```

**预期结果：**
- Gateway 日志显示接收到消息
- 收到 AI 回复

**日志示例：**
```
wecom[default]: received text message from userid
wecom[default]: invoking agent...
wecom[default]: sending response...
```

#### 4.2 群聊测试

1. 创建一个测试群
2. 在群聊中添加应用（群设置 → 群机器人 → 添加）
3. 在群里发送消息：

```
你好，机器人
```

**预期结果：**
- 如果 `requireMention: false`，直接收到回复
- 如果 `requireMention: true`，需要 @机器人

#### 4.3 图片测试

发送一张图片给机器人。

**预期结果：**
- 日志显示：`received image message`
- AI 能识别图片内容并回复

#### 4.4 文件测试

发送一个文件给机器人。

**预期结果：**
- 日志显示：`received file message`
- AI 能识别文件并回复

## 功能测试清单

### 基础功能

- [ ] 私聊发送文本消息
- [ ] 私聊接收文本回复
- [ ] 群聊发送文本消息
- [ ] 群聊接收文本回复
- [ ] 会话历史保持（连续对话）

### 媒体功能

- [ ] 发送图片
- [ ] 接收图片回复
- [ ] 发送文件
- [ ] 接收文件回复
- [ ] 发送位置
- [ ] 发送链接

### 策略功能

- [ ] 白名单过滤（allowFrom）
- [ ] 群聊白名单（groupAllowFrom）
- [ ] @提醒策略（requireMention）
- [ ] 消息去重（重复消息不处理）

### 错误处理

- [ ] 网络错误恢复
- [ ] 无效消息处理
- [ ] 超大文件拒绝
- [ ] 错误提示发送

## 常见问题排查

### 1. Webhook 验证失败

**症状：** 企业微信提示"URL 验证失败"

**排查步骤：**

1. 检查 Gateway 是否启动：
```bash
openclaw status
```

2. 检查端口是否监听：
```bash
netstat -tlnp | grep 3000
```

3. 检查 token 和 encodingAESKey 是否正确：
```bash
grep -A 5 "wecom:" ~/.openclaw/config.yaml
```

4. 查看详细日志：
```bash
openclaw gateway logs | grep wecom
```

### 2. 收不到消息

**症状：** 发送消息后没有任何响应

**排查步骤：**

1. 检查日志是否有接收记录：
```bash
openclaw gateway logs | grep "received.*message"
```

2. 检查是否被策略拦截：
```bash
openclaw gateway logs | grep "not in allowlist\|skipping"
```

3. 检查 Agent 是否正常：
```bash
openclaw status
```

4. 测试手动发送：
```bash
# 使用 OpenClaw CLI 测试
openclaw message send --channel wecom --target "userid" --message "测试"
```

### 3. 发送失败

**症状：** 日志显示"Failed to send message"

**排查步骤：**

1. 检查 access_token 是否有效：
```bash
openclaw gateway logs | grep "access_token\|Failed to get"
```

2. 检查 corpId、agentId、secret 是否正确

3. 检查网络连接：
```bash
curl https://qyapi.weixin.qq.com/cgi-bin/gettoken
```

### 4. 图片/文件下载失败

**症状：** 日志显示"failed to download image/file"

**排查步骤：**

1. 检查 mediaMaxMb 限制
2. 检查网络连接
3. 查看详细错误信息：
```bash
openclaw gateway logs | grep "download.*failed"
```

### 5. 群聊不响应

**症状：** 群聊中发送消息没有回复

**排查步骤：**

1. 检查 groupPolicy：
```bash
grep "groupPolicy" ~/.openclaw/config.yaml
```

2. 检查是否需要 @提醒：
```bash
grep "requireMention" ~/.openclaw/config.yaml
```

3. 检查群聊是否在白名单：
```bash
grep "groupAllowFrom" ~/.openclaw/config.yaml
```

## 性能测试

### 1. 并发测试

使用多个用户同时发送消息，测试并发处理能力。

**预期：**
- 每个用户的会话独立
- 消息不会混乱
- 响应时间稳定

### 2. 大文件测试

发送接近 mediaMaxMb 限制的文件。

**预期：**
- 正常处理
- 不会超时
- 内存使用正常

### 3. 长时间运行

持续运行 24 小时以上。

**预期：**
- 无内存泄漏
- 连接稳定
- 日志正常轮转

## 调试技巧

### 1. 启用详细日志

```bash
export LOG_LEVEL=debug
openclaw gateway restart
```

### 2. 实时监控日志

```bash
# 只看 WeCom 相关日志
openclaw gateway logs -f | grep wecom

# 只看错误
openclaw gateway logs -f | grep -i error

# 只看消息收发
openclaw gateway logs -f | grep "received\|sending"
```

### 3. 检查配置

```bash
# 查看完整配置
openclaw config show

# 验证配置格式
openclaw config validate
```

### 4. 测试 API 连接

```bash
# 测试获取 access_token
curl "https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=YOUR_CORPID&corpsecret=YOUR_SECRET"

# 测试发送消息
curl -X POST "https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "touser": "userid",
    "msgtype": "text",
    "agentid": 1000002,
    "text": {
      "content": "测试消息"
    }
  }'
```

## 生产环境建议

### 1. 安全配置

```yaml
channels:
  wecom:
    # 使用白名单模式
    dmPolicy: "allowlist"
    groupPolicy: "allowlist"
    
    # 明确指定允许的用户/群聊
    allowFrom:
      - "userid1"
      - "userid2"
    groupAllowFrom:
      - "chatid1"
      - "chatid2"
    
    # 群聊需要 @提醒
    requireMention: true
```

### 2. 性能优化

```yaml
channels:
  wecom:
    # 限制历史记录
    historyLimit: 10
    dmHistoryLimit: 20
    
    # 限制媒体大小
    mediaMaxMb: 10
    
    # 文本分块
    textChunkLimit: 2000
```

### 3. 监控告警

```bash
# 设置日志告警
openclaw gateway logs | grep -i "error\|failed" | mail -s "WeCom Error" admin@example.com

# 监控进程
watch -n 60 'openclaw status'
```

### 4. 备份配置

```bash
# 定期备份配置
cp ~/.openclaw/config.yaml ~/.openclaw/config.yaml.backup.$(date +%Y%m%d)
```

## 附录

### A. 配置模板

完整配置模板见上文"OpenClaw 配置"部分。

### B. 企业微信 API 文档

- 官方文档：https://developer.work.weixin.qq.com/document/
- 接收消息：https://developer.work.weixin.qq.com/document/path/90238
- 发送消息：https://developer.work.weixin.qq.com/document/path/90236

### C. 支持的消息类型

| 类型 | 接收 | 发送 | 说明 |
|------|------|------|------|
| text | ✅ | ✅ | 文本消息 |
| image | ✅ | ✅ | 图片消息 |
| file | ✅ | ✅ | 文件消息 |
| voice | ✅ | ❌ | 语音消息（仅识别） |
| video | ✅ | ❌ | 视频消息（仅识别） |
| location | ✅ | ❌ | 位置消息（仅识别） |
| link | ✅ | ❌ | 链接消息（仅识别） |
| markdown | ❌ | ✅ | Markdown 消息 |

### D. 错误码参考

| 错误码 | 说明 | 解决方法 |
|--------|------|----------|
| 40001 | 不合法的 secret | 检查 secret 是否正确 |
| 40013 | 不合法的 corpid | 检查 corpId 是否正确 |
| 40014 | 不合法的 access_token | Token 过期，会自动刷新 |
| 41001 | 缺少 access_token | 检查配置 |
| 42001 | access_token 超时 | 会自动刷新 |
| 60020 | 不合法的 agentid | 检查 agentId 是否正确 |

---

**测试完成后，记得：**
1. 调整策略为生产环境配置
2. 启用白名单
3. 设置监控告警
4. 备份配置文件

祝测试顺利！🦐
