import type { ClawdbotConfig } from "openclaw/plugin-sdk";
import { getWeComAccessToken } from "./client.js";
import { resolveWeComCredentials } from "./accounts.js";

export async function sendMessageWeCom({
  cfg,
  to,
  text,
  accountId,
}: {
  cfg: ClawdbotConfig;
  to: string;
  text: string;
  accountId?: string;
}): Promise<void> {
  const accessToken = await getWeComAccessToken({ cfg, accountId });
  const { agentId } = resolveWeComCredentials({ cfg, accountId });

  const url = `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${accessToken}`;

  const body = {
    touser: to,
    msgtype: "text",
    agentid: agentId,
    text: {
      content: text,
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
    throw new Error(`Failed to send WeCom message: ${data.errmsg}`);
  }
}
