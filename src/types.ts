import type { Logger } from "@honeybbq/teamspeak-client";

export type TeamspeakTtsConfig = {
  enabled?: boolean;
  replyMode?: "voice" | "text" | "both";
};

export type TeamspeakSttConfig = {
  enabled?: boolean;
  silenceTimeoutMs?: number;
  minDurationMs?: number;
};

export type TeamspeakAccountConfig = {
  server?: string;
  nickname?: string;
  identity?: string;
  identityLevel?: number;
  dmPolicy?: string;
  allowFrom?: string[];
  groupPolicy?: string;
  groupAllowFrom?: string[];
  mentionPatterns?: string[];
  groups?: Record<string, TeamspeakGroupConfig>;
  tts?: TeamspeakTtsConfig;
  stt?: TeamspeakSttConfig;
};

export type TeamspeakGroupConfig = {
  requireMention?: boolean;
  enabled?: boolean;
};

export type ResolvedTeamspeakAccount = {
  accountId: string | null;
  server: string;
  nickname: string;
  identity: string | undefined;
  identityLevel: number;
  dmPolicy: string | undefined;
  allowFrom: string[];
  groupPolicy: string | undefined;
  groupAllowFrom: string[];
  mentionPatterns: string[];
  groups: Record<string, TeamspeakGroupConfig>;
  tts: { enabled: boolean; replyMode: "voice" | "text" | "both" };
  stt: { enabled: boolean; silenceTimeoutMs: number; minDurationMs: number };
};

export type TeamspeakInboundMessage = {
  messageId: string;
  target: string;
  senderNick: string;
  senderUid: string;
  senderClid: number;
  text: string;
  timestamp: number;
  isGroup: boolean;
  targetMode: number;
  channelId: bigint | undefined;
};

/**
 * OpenClaw's PluginLogger only accepts a single string per call,
 * and `debug` is optional. Re-export for use across the plugin.
 */
export type PluginLogger = {
  debug?: ((message: string) => void) | undefined;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
};

function formatArgs(msg: string, args: unknown[]): string {
  if (args.length === 0) return msg;
  const parts = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a)));
  return `${msg} ${parts.join(" ")}`;
}

/**
 * Adapt OpenClaw's single-string PluginLogger to teamspeak-js's
 * multi-arg Logger interface by serialising extra args into the message.
 */
export function adaptLogger(pluginLogger: PluginLogger): Logger {
  return {
    debug: (msg, ...args) => pluginLogger.debug?.(formatArgs(msg, args)),
    info: (msg, ...args) => pluginLogger.info(formatArgs(msg, args)),
    warn: (msg, ...args) => pluginLogger.warn(formatArgs(msg, args)),
    error: (msg, ...args) => pluginLogger.error(formatArgs(msg, args)),
  };
}
