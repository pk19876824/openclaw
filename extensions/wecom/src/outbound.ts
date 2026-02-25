import type { OutboundAdapter } from "openclaw/plugin-sdk";
import { sendMessageWeCom } from "./send.js";

export const wecomOutbound: OutboundAdapter = {
  send: async ({ cfg, target, message, accountId }) => {
    const userId = target.replace(/^(wecom|user):/i, "");
    await sendMessageWeCom({
      cfg,
      to: userId,
      text: message,
      accountId,
    });
    return { ok: true };
  },
};
