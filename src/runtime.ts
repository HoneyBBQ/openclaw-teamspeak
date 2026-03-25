import { createPluginRuntimeStore } from "openclaw/plugin-sdk/runtime-store";
import type { PluginRuntime } from "openclaw/plugin-sdk/runtime-store";

const store = createPluginRuntimeStore<PluginRuntime>("teamspeak plugin runtime not initialized");

export const setRuntime = store.setRuntime;

export function getRuntime(): PluginRuntime {
  return store.getRuntime();
}

export function tryGetRuntime(): PluginRuntime | null {
  return store.tryGetRuntime();
}
