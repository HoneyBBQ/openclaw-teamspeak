import { defineSetupPluginEntry } from "openclaw/plugin-sdk/core";
import { teamspeakPlugin } from "./src/channel.js";

export default defineSetupPluginEntry(teamspeakPlugin);
