import type { ResolvedTeamspeakAccount, TeamspeakAccountConfig } from "./types.js";

type OpenClawConfig = Record<string, unknown>;

const CHANNEL_KEY = "teamspeak";

function getSection(cfg: OpenClawConfig): TeamspeakAccountConfig | undefined {
  const channels = cfg["channels"] as Record<string, unknown> | undefined;
  return channels?.[CHANNEL_KEY] as TeamspeakAccountConfig | undefined;
}

export function resolveAccount(
  cfg: OpenClawConfig,
  accountId?: string | null,
): ResolvedTeamspeakAccount {
  const section = getSection(cfg);
  if (!section?.server) {
    throw new Error("teamspeak: server address is required");
  }

  return {
    accountId: accountId ?? null,
    server: section.server,
    nickname: section.nickname ?? "OpenClaw",
    identity: section.identity,
    identityLevel: section.identityLevel ?? 8,
    dmPolicy: section.dmPolicy,
    allowFrom: section.allowFrom ?? [],
    groupPolicy: section.groupPolicy,
    groupAllowFrom: section.groupAllowFrom ?? [],
    mentionPatterns: section.mentionPatterns ?? [],
    groups: section.groups ?? {},
    tts: {
      enabled: section.tts?.enabled ?? false,
      replyMode: section.tts?.replyMode ?? "both",
    },
    stt: {
      enabled: section.stt?.enabled ?? false,
      silenceTimeoutMs: section.stt?.silenceTimeoutMs ?? 300,
      minDurationMs: section.stt?.minDurationMs ?? 500,
    },
  };
}

export function inspectAccount(
  cfg: OpenClawConfig,
  _accountId?: string | null,
): {
  enabled: boolean;
  configured: boolean;
  tokenStatus: string;
} {
  const section = getSection(cfg);
  const hasServer = Boolean(section?.server);
  return {
    enabled: hasServer,
    configured: hasServer,
    tokenStatus: hasServer ? "available" : "missing",
  };
}

export function listAccountIds(_cfg: OpenClawConfig): string[] {
  return ["default"];
}
