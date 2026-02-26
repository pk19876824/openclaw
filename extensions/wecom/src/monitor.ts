import * as crypto from "crypto";
import * as http from "http";
import type { ClawdbotConfig, RuntimeEnv, HistoryEntry } from "openclaw/plugin-sdk";
import { installRequestBodyLimitGuard } from "openclaw/plugin-sdk";
import { resolveWeComAccount } from "./accounts.js";
import { handleWeComMessage, type WeComMessageEvent } from "./bot.js";
import { probeWeCom } from "./probe.js";
import type { ResolvedWeComAccount } from "./types.js";

export type MonitorWeComOpts = {
  config?: ClawdbotConfig;
  runtime?: RuntimeEnv;
  abortSignal?: AbortSignal;
  accountId?: string;
};

const httpServers = new Map<string, http.Server>();
const WECOM_WEBHOOK_MAX_BODY_BYTES = 1024 * 1024;
const WECOM_WEBHOOK_BODY_TIMEOUT_MS = 30_000;

/**
 * Verify WeCom webhook signature
 */
function verifyWeComSignature(
  signature: string,
  timestamp: string,
  nonce: string,
  body: string,
  token: string,
): boolean {
  const arr = [token, timestamp, nonce, body].sort();
  const str = arr.join("");
  const hash = crypto.createHash("sha1").update(str).digest("hex");
  return hash === signature;
}

/**
 * Decrypt WeCom message
 */
function decryptWeComMessage(
  encrypt: string,
  encodingAESKey: string,
): { message: string; corpId: string } {
  const key = Buffer.from(encodingAESKey + "=", "base64");
  const encryptBuffer = Buffer.from(encrypt, "base64");

  // Extract IV (first 16 bytes)
  const iv = encryptBuffer.slice(0, 16);

  // Decrypt
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  decipher.setAutoPadding(false);
  let decrypted = Buffer.concat([decipher.update(encryptBuffer.slice(16)), decipher.final()]);

  // Remove padding
  const pad = decrypted[decrypted.length - 1];
  decrypted = decrypted.slice(0, decrypted.length - pad);

  // Extract message length (4 bytes after random 16 bytes)
  const msgLen = decrypted.readUInt32BE(16);
  const message = decrypted.slice(20, 20 + msgLen).toString("utf8");
  const corpId = decrypted.slice(20 + msgLen).toString("utf8");

  return { message, corpId };
}

/**
 * Monitor WeCom webhook
 */
async function monitorWeComWebhook({
  cfg,
  account,
  runtime,
  abortSignal,
}: {
  cfg: ClawdbotConfig;
  account: ResolvedWeComAccount;
  runtime?: RuntimeEnv;
  abortSignal?: AbortSignal;
}): Promise<void> {
  const { accountId } = account;
  const log = runtime?.log ?? console.log;
  const error = runtime?.error ?? console.error;

  const port = account.config?.webhookPort ?? 3000;
  const path = account.config?.webhookPath ?? "/wecom/events";
  const host = account.config?.webhookHost ?? "127.0.0.1";
  const token = account.config?.token;
  const encodingAESKey = account.config?.encodingAESKey;

  if (!token || !encodingAESKey) {
    throw new Error(`WeCom account "${accountId}" requires token and encodingAESKey`);
  }

  log(`wecom[${accountId}]: starting Webhook server on ${host}:${port}, path ${path}...`);

  const chatHistories = new Map<string, HistoryEntry[]>();
  const server = http.createServer();

  server.on("request", async (req, res) => {
    if (req.url !== path) {
      res.statusCode = 404;
      res.end("Not Found");
      return;
    }

    // Handle URL verification (GET request)
    if (req.method === "GET") {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const msgSignature = url.searchParams.get("msg_signature");
      const timestamp = url.searchParams.get("timestamp");
      const nonce = url.searchParams.get("nonce");
      const echostr = url.searchParams.get("echostr");

      if (!msgSignature || !timestamp || !nonce || !echostr) {
        res.statusCode = 400;
        res.end("Bad Request");
        return;
      }

      try {
        // Verify signature
        if (!verifyWeComSignature(msgSignature, timestamp, nonce, echostr, token)) {
          res.statusCode = 401;
          res.end("Unauthorized");
          return;
        }

        // Decrypt echostr
        const { message } = decryptWeComMessage(echostr, encodingAESKey);
        res.statusCode = 200;
        res.end(message);
        log(`wecom[${accountId}]: URL verification successful`);
      } catch (err) {
        error(`wecom[${accountId}]: URL verification error: ${String(err)}`);
        res.statusCode = 500;
        res.end("Internal Server Error");
      }
      return;
    }

    // Handle message events (POST request)
    if (req.method === "POST") {
      const guard = installRequestBodyLimitGuard(req, res, {
        maxBytes: WECOM_WEBHOOK_MAX_BODY_BYTES,
        timeoutMs: WECOM_WEBHOOK_BODY_TIMEOUT_MS,
        responseFormat: "text",
      });

      if (guard.isTripped()) {
        return;
      }

      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", async () => {
        try {
          const body = Buffer.concat(chunks).toString("utf8");
          const data = JSON.parse(body);

          const url = new URL(req.url!, `http://${req.headers.host}`);
          const msgSignature = url.searchParams.get("msg_signature");
          const timestamp = url.searchParams.get("timestamp");
          const nonce = url.searchParams.get("nonce");

          if (!msgSignature || !timestamp || !nonce) {
            res.statusCode = 400;
            res.end("Bad Request");
            return;
          }

          // Verify signature
          if (!verifyWeComSignature(msgSignature, timestamp, nonce, data.Encrypt, token)) {
            res.statusCode = 401;
            res.end("Unauthorized");
            return;
          }

          // Decrypt message
          const { message } = decryptWeComMessage(data.Encrypt, encodingAESKey);
          const event = JSON.parse(message) as WeComMessageEvent;

          // Handle message (fire and forget to avoid blocking response)
          handleWeComMessage({
            cfg,
            event,
            runtime,
            chatHistories,
            accountId,
          }).catch((err) => {
            error(`wecom[${accountId}]: error handling message: ${String(err)}`);
          });

          res.statusCode = 200;
          res.end("success");
        } catch (err) {
          if (!guard.isTripped()) {
            error(`wecom[${accountId}]: webhook handler error: ${String(err)}`);
            res.statusCode = 500;
            res.end("Internal Server Error");
          }
        } finally {
          guard.dispose();
        }
      });
      return;
    }

    res.statusCode = 405;
    res.end("Method Not Allowed");
  });

  httpServers.set(accountId, server);

  return new Promise((resolve, reject) => {
    const cleanup = (callback?: () => void) => {
      server.close(() => {
        httpServers.delete(accountId);
        callback?.();
      });
    };

    const handleAbort = () => {
      log(`wecom[${accountId}]: abort signal received, stopping`);
      cleanup(() => resolve());
    };

    if (abortSignal?.aborted) {
      cleanup(() => resolve());
      return;
    }

    abortSignal?.addEventListener("abort", handleAbort, { once: true });

    // Attach error handler before listen() so async bind failures (e.g. EADDRINUSE) are caught.
    server.on("error", (err) => {
      error(`wecom[${accountId}]: server error: ${String(err)}`);
      abortSignal?.removeEventListener("abort", handleAbort);
      cleanup(() => reject(err));
    });

    server.listen(port, host, () => {
      log(`wecom[${accountId}]: Webhook server listening on ${host}:${port}${path}`);
    });
  });
}

/**
 * Monitor WeCom provider
 */
export async function monitorWeComProvider(opts: MonitorWeComOpts): Promise<() => void> {
  const { config, runtime, abortSignal, accountId } = opts;

  if (!config) {
    throw new Error("Config is required");
  }

  const account = resolveWeComAccount({ cfg: config, accountId });

  if (!account.configured) {
    throw new Error(`WeCom account "${account.accountId}" is not configured`);
  }

  const log = runtime?.log ?? console.log;
  log(`wecom[${account.accountId}]: starting monitor...`);

  // Start webhook server and wait for it to be ready
  await monitorWeComWebhook({
    cfg: config,
    account,
    runtime,
    abortSignal,
  });

  // Return cleanup function
  return () => {
    const server = httpServers.get(account.accountId);
    if (server) {
      server.close();
      httpServers.delete(account.accountId);
    }
  };
}
