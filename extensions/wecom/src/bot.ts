import type { ClawdbotConfig, RuntimeEnv, HistoryEntry } from "openclaw/plugin-sdk";
import {
  buildPendingHistoryContextFromMap,
  clearHistoryEntriesIfEnabled,
  recordPendingHistoryEntryIfEnabled,
} from "openclaw/plugin-sdk";
import { resolveWeComAccount } from "./accounts.js";
import { sendMessageWeCom } from "./send.js";

export interface WeComMessageEvent {
  ToUserName: string; // 企业微信 CorpID
  FromUserName: string; // 发送者 UserID
  CreateTime: number; // 消息创建时间
  MsgType: string; // 消息类型：text, image, voice, video, file, location, link
  Content?: string; // 文本消息内容
  MsgId: string; // 消息 ID
  AgentID: string; // 企业应用 ID
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
    // Only handle text messages for MVP
    if (event.MsgType !== "text") {
      log(`wecom[${accountId}]: ignoring non-text message type: ${event.MsgType}`);
      return;
    }

    const userId = event.FromUserName;
    const messageText = event.Content ?? "";
    const messageId = event.MsgId;

    log(`wecom[${accountId}]: received message from ${userId}: ${messageText.substring(0, 50)}...`);

    // Build session key
    const sessionKey = `wecom:${accountId}:user:${userId}`;

    // Get or create history
    let history = chatHistories.get(sessionKey);
    if (!history) {
      history = [];
      chatHistories.set(sessionKey, history);
    }

    // Record user message in history
    recordPendingHistoryEntryIfEnabled({
      history,
      role: "user",
      content: messageText,
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

    const response = await runtimeEnv.invokeAgent({
      sessionKey,
      message: messageText,
      context: {
        channel: "wecom",
        accountId: accountId ?? "default",
        userId,
        messageId,
        chatType: "direct",
        history: historyContext,
      },
    });

    // Send response back to user
    if (response?.text) {
      await sendMessageWeCom({
        cfg,
        to: userId,
        text: response.text,
        accountId,
      });

      // Record assistant response in history
      recordPendingHistoryEntryIfEnabled({
        history,
        role: "assistant",
        content: response.text,
      });
    }

    // Clear old history entries if needed
    clearHistoryEntriesIfEnabled({
      history,
      limit: 20, // Keep last 20 messages
    });

  } catch (err) {
    error(`wecom[${accountId}]: error handling message: ${String(err)}`);
    
    // Try to send error message to user
    try {
      await sendMessageWeCom({
        cfg,
        to: event.FromUserName,
        text: "抱歉，处理消息时出现错误。",
        accountId,
      });
    } catch (sendErr) {
      error(`wecom[${accountId}]: failed to send error message: ${String(sendErr)}`);
    }
  }
}
