import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { wecomPlugin } from "./src/channel.js";

export { sendMessageWeCom } from "./src/send.js";
export { probeWeCom } from "./src/probe.js";
export { monitorWeComProvider } from "./src/monitor.js";
export { wecomPlugin } from "./src/channel.js";

const plugin = {
  id: "wecom",
  name: "WeCom",
  description: "WeCom (企业微信) channel plugin",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    api.registerChannel({ plugin: wecomPlugin });
  },
};

export default plugin;
