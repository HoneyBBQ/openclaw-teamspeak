import { defineChannelPluginEntry } from "openclaw/plugin-sdk/core";
import { teamspeakPlugin } from "./src/channel.js";
import { teamspeakService } from "./src/service.js";
import { setRuntime } from "./src/runtime.js";

export default defineChannelPluginEntry({
  id: "openclaw-teamspeak",
  name: "TeamSpeak",
  description:
    "Connect OpenClaw to TeamSpeak servers via text & voice chat. Compatible with TS 3, 5 & 6.",
  plugin: teamspeakPlugin,
  setRuntime,

  registerFull(api) {
    api.registerService(teamspeakService);
  },
});
