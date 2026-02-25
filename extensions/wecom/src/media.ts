import type { ClawdbotConfig } from "openclaw/plugin-sdk";
import { getWeComAccessToken } from "./client.js";
import { resolveWeComCredentials } from "./accounts.js";

/**
 * Download media file from WeCom
 */
export async function downloadMediaWeCom({
  cfg,
  mediaId,
  accountId,
}: {
  cfg: ClawdbotConfig;
  mediaId: string;
  accountId?: string;
}): Promise<Buffer> {
  const accessToken = await getWeComAccessToken({ cfg, accountId });
  const url = `https://qyapi.weixin.qq.com/cgi-bin/media/get?access_token=${accessToken}&media_id=${mediaId}`;

  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Failed to download media: ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  return Buffer.from(buffer);
}

/**
 * Upload media file to WeCom
 */
export async function uploadMediaWeCom({
  cfg,
  type,
  buffer,
  filename,
  accountId,
}: {
  cfg: ClawdbotConfig;
  type: "image" | "voice" | "video" | "file";
  buffer: Buffer;
  filename: string;
  accountId?: string;
}): Promise<string> {
  const accessToken = await getWeComAccessToken({ cfg, accountId });
  const url = `https://qyapi.weixin.qq.com/cgi-bin/media/upload?access_token=${accessToken}&type=${type}`;

  const FormData = (await import("form-data")).default;
  const form = new FormData();
  form.append("media", buffer, { filename });

  const response = await fetch(url, {
    method: "POST",
    body: form as any,
    headers: form.getHeaders(),
  });

  const data = await response.json();

  if (data.errcode !== 0) {
    throw new Error(`Failed to upload media: ${data.errmsg}`);
  }

  return data.media_id;
}

/**
 * Send image message
 */
export async function sendImageWeCom({
  cfg,
  to,
  mediaId,
  accountId,
}: {
  cfg: ClawdbotConfig;
  to: string;
  mediaId: string;
  accountId?: string;
}): Promise<void> {
  const accessToken = await getWeComAccessToken({ cfg, accountId });
  const { agentId } = resolveWeComCredentials({ cfg, accountId });

  const url = `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${accessToken}`;

  const body = {
    touser: to,
    msgtype: "image",
    agentid: agentId,
    image: {
      media_id: mediaId,
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (data.errcode !== 0) {
    throw new Error(`Failed to send image: ${data.errmsg}`);
  }
}

/**
 * Send file message
 */
export async function sendFileWeCom({
  cfg,
  to,
  mediaId,
  accountId,
}: {
  cfg: ClawdbotConfig;
  to: string;
  mediaId: string;
  accountId?: string;
}): Promise<void> {
  const accessToken = await getWeComAccessToken({ cfg, accountId });
  const { agentId } = resolveWeComCredentials({ cfg, accountId });

  const url = `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${accessToken}`;

  const body = {
    touser: to,
    msgtype: "file",
    agentid: agentId,
    file: {
      media_id: mediaId,
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (data.errcode !== 0) {
    throw new Error(`Failed to send file: ${data.errmsg}`);
  }
}

/**
 * Send image to group chat
 */
export async function sendGroupImageWeCom({
  cfg,
  chatId,
  mediaId,
  accountId,
}: {
  cfg: ClawdbotConfig;
  chatId: string;
  mediaId: string;
  accountId?: string;
}): Promise<void> {
  const accessToken = await getWeComAccessToken({ cfg, accountId });

  const url = `https://qyapi.weixin.qq.com/cgi-bin/appchat/send?access_token=${accessToken}`;

  const body = {
    chatid: chatId,
    msgtype: "image",
    image: {
      media_id: mediaId,
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (data.errcode !== 0) {
    throw new Error(`Failed to send group image: ${data.errmsg}`);
  }
}

/**
 * Send file to group chat
 */
export async function sendGroupFileWeCom({
  cfg,
  chatId,
  mediaId,
  accountId,
}: {
  cfg: ClawdbotConfig;
  chatId: string;
  mediaId: string;
  accountId?: string;
}): Promise<void> {
  const accessToken = await getWeComAccessToken({ cfg, accountId });

  const url = `https://qyapi.weixin.qq.com/cgi-bin/appchat/send?access_token=${accessToken}`;

  const body = {
    chatid: chatId,
    msgtype: "file",
    file: {
      media_id: mediaId,
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (data.errcode !== 0) {
    throw new Error(`Failed to send group file: ${data.errmsg}`);
  }
}

/**
 * Send markdown message
 */
export async function sendMarkdownWeCom({
  cfg,
  to,
  content,
  accountId,
}: {
  cfg: ClawdbotConfig;
  to: string;
  content: string;
  accountId?: string;
}): Promise<void> {
  const accessToken = await getWeComAccessToken({ cfg, accountId });
  const { agentId } = resolveWeComCredentials({ cfg, accountId });

  const url = `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${accessToken}`;

  const body = {
    touser: to,
    msgtype: "markdown",
    agentid: agentId,
    markdown: {
      content,
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (data.errcode !== 0) {
    throw new Error(`Failed to send markdown: ${data.errmsg}`);
  }
}
