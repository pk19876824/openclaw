import type { ClawdbotConfig } from "openclaw/plugin-sdk";
import { resolveWeComCredentials } from "./accounts.js";

let accessTokenCache: { token: string; expiresAt: number } | null = null;

export async function getWeComAccessToken({
  cfg,
  accountId,
}: {
  cfg: ClawdbotConfig;
  accountId?: string;
}): Promise<string> {
  // Check cache
  if (accessTokenCache && accessTokenCache.expiresAt > Date.now()) {
    return accessTokenCache.token;
  }

  const { corpId, secret } = resolveWeComCredentials({ cfg, accountId });

  const url = `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${corpId}&corpsecret=${secret}`;
  const response = await fetch(url);
  const data = await response.json();

  if (data.errcode !== 0) {
    throw new Error(`Failed to get WeCom access token: ${data.errmsg}`);
  }

  // Cache token (expires in 7200 seconds, cache for 7000 to be safe)
  accessTokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + 7000 * 1000,
  };

  return data.access_token;
}

export function clearWeComAccessTokenCache(): void {
  accessTokenCache = null;
}
