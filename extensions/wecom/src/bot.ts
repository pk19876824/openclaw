import type { ClawdbotConfig, RuntimeEnv, HistoryEntry } from "openclaw/plugin-sdk";
import {
  buildPendingHistoryContextFromMap,
  clearHistoryEntriesIfEnabled,
  recordPendingHistoryEntryIfEnabled,
  buildAgentMediaPayload,
} from "openclaw/plugin-sdk";
import { resolveWeComAccount } from "./accounts.js";
import { sendMessageWeCom } from "./send.js";
import { downloadMediaWeCom, sendImageWeCom, sendFileWeCom } from "./media.js";

export interface WeComMessageEvent {
  ToUserName: string; // 企业微信 CorpID
  FromUserName: string; // 发送者 UserID
  CreateTime: number; // 消息创建时间
  MsgType: string; // 消息类型：text, image, voice, video, file, location, link
  Content?: string; // 文本消息内容
  MsgId: string; // 消息 ID
  AgentID: string; // 企业应用 ID
  // Image message
  PicUrl?: string; // 图片链接
  MediaId?: string; // 媒体文件 ID
  // File message
  Title?: string; // 文件名
  Description?: string; // 文件描述
  FileKey?: string; // 文件 Key
  // Location message
  Location_X?: string; // 纬度
  Location_Y?: string; // 经度
  Scale?: string; // 地图缩放大小
  Label?: string; // 地理位置信息
  // Link message
  Url?: string; // 链接地址
  // Group chat
  ChatId?: string; // 群聊 ID (when in group)
  ChatType?: string; // 聊天类型: single (单聊) or group (群聊)
}

/**
 * Handle incoming WeCom message
 */
export async function handleWeComMessage({
  cfg,
  event,
  runtime,
  chatHistories,
  accountId,
}: {
  cfg: ClawdbotConfig;
  event: WeComMessageEvent;
  runtime?: RuntimeEnv;
  chatHistories: Map<string, HistoryEntry[]>;
  accountId?: string;
}): Promise<void> {
  const log = runtime?.log ?? console.log;
  const error = runtime?.error ?? console.error;

  try {
    const userId = event.FromUserName;
    const messageId = event.MsgId;
    const msgType = event.MsgType;
    const chatId = event.ChatId;
    const chatType = event.ChatType ?? (chatId ? "group" : "single");
    const isGroupChat = chatType === "group" || !!chatId;

    // Check for duplicate messages
    const { tryRecordMessagePersistent } = await import("./dedup.js");
    const isNew = await tryRecordMessagePersistent(messageId, accountId, log);
    if (!isNew) {
      log(`wecom[${accountId}]: duplicate message ${messageId}, skipping`);
      return;
    }

    log(`wecom[${accountId}]: received ${msgType} message from ${userId} in ${isGroupChat ? "group" : "DM"}`);

    // Build session key
    const sessionKey = isGroupChat
      ? `wecom:${accountId}:group:${chatId}`
      : `wecom:${accountId}:user:${userId}`;

    // Get or create history
    let history = chatHistories.get(sessionKey);
    if (!history) {
      history = [];
      chatHistories.set(sessionKey, history);
    }

    let messageText = "";
    let mediaPayload: any = undefined;

    // Handle different message types
    switch (msgType) {
      case "text":
        messageText = event.Content ?? "";
        break;

      case "image":
        if (event.MediaId) {
          try {
            const imageBuffer = await downloadMediaWeCom({
              cfg,
              mediaId: event.MediaId,
              accountId,
            });
            mediaPayload = buildAgentMediaPayload({
              type: "image",
              data: imageBuffer,
              mimeType: "image/jpeg",
            });
            messageText = "[图片]";
          } catch (err) {
            error(`wecom[${accountId}]: failed to download image: ${String(err)}`);
            messageText = "[图片下载失败]";
          }
        }
        break;

      case "file":
        if (event.MediaId) {
          try {
            const fileBuffer = await downloadMediaWeCom({
              cfg,
              mediaId: event.MediaId,
              accountId,
            });
            mediaPayload = buildAgentMediaPayload({
              type: "file",
              data: fileBuffer,
              filename: event.Title ?? "file",
            });
            messageText = `[文件: ${event.Title ?? "未知"}]`;
          } catch (err) {
            error(`wecom[${accountId}]: failed to download file: ${String(err)}`);
            messageText = "[文件下载失败]";
          }
        }
        break;

      case "location":
        messageText = `[位置: ${event.Label ?? ""}] (${event.Location_X}, ${event.Location_Y})`;
        break;

      case "link":
        messageText = `[链接: ${event.Title ?? ""}] ${event.Url ?? ""}`;
        break;

      case "voice":
      case "video":
        messageText = `[${msgType === "voice" ? "语音" : "视频"}]`;
        log(`wecom[${accountId}]: ${msgType} message not fully supported yet`);
        break;

      default:
        log(`wecom[${accountId}]: unsupported message type: ${msgType}`);
        return;
    }

    // For group chats, check if bot should respond
    // Check group policy and allowlist
    if (isGroupChat) {
      const account = resolveWeComAccount({ cfg, accountId });
      const wecomCfg = account.config;
      
      // Import policy functions
      const { resolveWeComReplyPolicy, isWeComGroupAllowed } = await import("./policy.js");
      const { resolveDefaultGroupPolicy, resolveAllowlistProviderRuntimeGroupPolicy } = await import("openclaw/plugin-sdk");
      
      const defaultGroupPolicy = resolveDefaultGroupPolicy(cfg);
      const { groupPolicy, groupAllowFrom } = resolveAllowlistProviderRuntimeGroupPolicy({
        providerConfigPresent: cfg.channels?.wecom !== undefined,
        groupPolicy: wecomCfg?.groupPolicy,
        groupAllowFrom: wecomCfg?.groupAllowFrom,
        defaultGroupPolicy,
      });
      
      // Check if group is allowed
      if (!isWeComGroupAllowed({
        groupPolicy,
        allowFrom: groupAllowFrom,
        senderId: userId,
      })) {
        log(`wecom[${accountId}]: group ${chatId} not in allowlist, skipping`);
        return;
      }
      
      // Check mention policy
      const { requireMention } = resolveWeComReplyPolicy({
        isDirectMessage: false,
        globalConfig: wecomCfg,
      });
      
      if (requireMention) {
        // TODO: Implement proper @mention detection for WeCom
        // For now, skip if requireMention is true (WeCom doesn't provide mention info in basic events)
        log(`wecom[${accountId}]: group message without mention, skipping (requireMention=true)`);
        return;
      }
    }

    // Get sender name for group chats
    let senderName = userId;
    if (isGroupChat) {
      try {
        const { getUserInfoWeCom } = await import("./directory.js");
        const userInfo = await getUserInfoWeCom({ cfg, userId, accountId });
        senderName = userInfo.name || userId;
      } catch (err) {
        log(`wecom[${accountId}]: failed to get sender name: ${String(err)}`);
      }
    }

    // Prefix message with sender name in group chats
    const displayMessage = isGroupChat ? `${senderName}: ${messageText}` : messageText;

    // Record user message in history
    recordPendingHistoryEntryIfEnabled({
      history,
      role: "user",
      content: displayMessage,
      externalKey: messageId,
    });

    // Build context for agent
    const historyContext = buildPendingHistoryContextFromMap(chatHistories, sessionKey);

    // Get runtime and invoke agent
    const runtimeEnv = runtime ?? (await import("openclaw/plugin-sdk")).getRuntime();
    
    if (!runtimeEnv?.invokeAgent) {
      error(`wecom[${accountId}]: runtime.invokeAgent not available`);
      return;
    }

    const agentRequest: any = {
      sessionKey,
      message: displayMessage,
      context: {
        channel: "wecom",
        accountId: accountId ?? "default",
        userId,
        messageId,
        chatType: isGroupChat ? "group" : "direct",
        chatId: isGroupChat ? chatId : undefined,
        history: historyContext,
      },
    };

    // Add media if present
    if (mediaPayload) {
      agentRequest.media = [mediaPayload];
    }

    const response = await runtimeEnv.invokeAgent(agentRequest);

    // Send response back
    if (response?.text) {
      if (isGroupChat && chatId) {
        // Send to group chat
        await sendGroupMessageWeCom({
          cfg,
          chatId,
          text: response.text,
          accountId,
        });
      } else {
        // Send to user
        await sendMessageWeCom({
          cfg,
          to: userId,
          text: response.text,
          accountId,
        });
      }

      // Record assistant response in history
      recordPendingHistoryEntryIfEnabled({
        history,
        role: "assistant",
        content: response.text,
      });
    }

    // Handle media responses (if agent returns media)
    if (response?.media && Array.isArray(response.media)) {
      for (const media of response.media) {
        try {
          if (media.type === "image" && media.data) {
            const { uploadMediaWeCom } = await import("./media.js");
            const mediaId = await uploadMediaWeCom({
              cfg,
              type: "image",
              buffer: Buffer.from(media.data),
              filename: media.filename ?? "image.jpg",
              accountId,
            });
            
            if (isGroupChat && chatId) {
              await sendGroupImageWeCom({ cfg, chatId, mediaId, accountId });
            } else {
              await sendImageWeCom({ cfg, to: userId, mediaId, accountId });
            }
          } else if (media.type === "file" && media.data) {
            const { uploadMediaWeCom } = await import("./media.js");
            const mediaId = await uploadMediaWeCom({
              cfg,
              type: "file",
              buffer: Buffer.from(media.data),
              filename: media.filename ?? "file",
              accountId,
            });
            
            if (isGroupChat && chatId) {
              await sendGroupFileWeCom({ cfg, chatId, mediaId, accountId });
            } else {
              await sendFileWeCom({ cfg, to: userId, mediaId, accountId });
            }
          }
        } catch (err) {
          error(`wecom[${accountId}]: failed to send media: ${String(err)}`);
        }
      }
    }

    // Clear old history entries if needed
    clearHistoryEntriesIfEnabled({
      history,
      limit: 20, // Keep last 20 messages
    });

  } catch (err) {
    error(`wecom[${accountId}]: error handling message: ${String(err)}`);
    
    // Try to send error message
    try {
      const chatId = event.ChatId;
      const isGroupChat = event.ChatType === "group" || !!chatId;
      
      if (isGroupChat && chatId) {
        await sendGroupMessageWeCom({
          cfg,
          chatId,
          text: "抱歉，处理消息时出现错误。",
          accountId,
        });
      } else {
        await sendMessageWeCom({
          cfg,
          to: event.FromUserName,
          text: "抱歉，处理消息时出现错误。",
          accountId,
        });
      }
    } catch (sendErr) {
      error(`wecom[${accountId}]: failed to send error message: ${String(sendErr)}`);
    }
  }
}
