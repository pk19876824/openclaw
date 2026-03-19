import type { StreamFn } from "@mariozechner/pi-agent-core";
import type { ProviderStreamOptions } from "@mariozechner/pi-ai";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("agent/llm-call");

type LlmCallLogConfig = {
  enabled: boolean;
  maxPreviewLength: number;
};

function resolveLlmCallLogConfig(): LlmCallLogConfig {
  const enabled =
    process.env.OPENCLAW_LLM_CALL_LOG !== "0" && process.env.OPENCLAW_LLM_CALL_LOG !== "false";
  const maxPreviewLength = parseInt(process.env.OPENCLAW_LLM_CALL_LOG_PREVIEW || "500", 10);
  return { enabled, maxPreviewLength: Math.max(50, Math.min(5000, maxPreviewLength)) };
}

type LlmCallLogger = {
  enabled: true;
  wrapStreamFn: (streamFn: StreamFn) => StreamFn;
};

function truncatePreview(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}…`;
}

function extractPromptPreview(messages: unknown[], maxPreviewLength: number): string {
  const lastUserMessage = messages
    .slice()
    .toReversed()
    .find((m) => m && typeof m === "object" && (m as Record<string, unknown>).role === "user");

  if (!lastUserMessage) {
    return "<no user message>";
  }

  const content = (lastUserMessage as Record<string, unknown>).content;
  if (typeof content === "string") {
    return truncatePreview(content, maxPreviewLength);
  }

  if (Array.isArray(content)) {
    const textParts = content
      .filter((c) => c && typeof c === "object" && (c as Record<string, unknown>).type === "text")
      .map((c) => (c as Record<string, unknown>).text as string)
      .join("\n");
    return truncatePreview(textParts || "<non-text content>", maxPreviewLength);
  }

  return "<unknown content format>";
}

export function createLlmCallLogger(params: {
  runId?: string;
  sessionId?: string;
  provider?: string;
  modelId?: string;
}): LlmCallLogger | null {
  const cfg = resolveLlmCallLogConfig();
  if (!cfg.enabled) {
    return null;
  }

  const wrapStreamFn: LlmCallLogger["wrapStreamFn"] = (streamFn) => {
    const wrapped: StreamFn = (model, context, options) => {
      const requestPreview = extractPromptPreview(context.messages, cfg.maxPreviewLength);

      log.info(
        `[llm-request] runId=${params.runId ?? "N/A"} sessionId=${params.sessionId ?? "N/A"} ` +
          `provider=${params.provider ?? "unknown"} model=${params.modelId ?? "unknown"} ` +
          `messageCount=${context.messages.length} ` +
          `tools=${context.tools?.length ?? 0} ` +
          `promptPreview=${JSON.stringify(requestPreview)}`,
      );

      // Determine options type and wrap onPayload
      const hasOnPayload = options && "onPayload" in options;
      if (hasOnPayload) {
        const providerOptions = options as ProviderStreamOptions;
        const originalOnPayload = providerOptions.onPayload;
        providerOptions.onPayload = (payload, modelInstance) => {
          const payloadStr = JSON.stringify(payload);
          const payloadPreview = truncatePreview(payloadStr, cfg.maxPreviewLength);
          log.debug(
            `[llm-payload] runId=${params.runId ?? "N/A"} sessionId=${params.sessionId ?? "N/A"} ` +
              `preview=${payloadPreview}`,
          );
          return originalOnPayload?.(payload, modelInstance);
        };
      }

      return streamFn(model, context, options);
    };
    return wrapped;
  };

  return { enabled: true, wrapStreamFn };
}
