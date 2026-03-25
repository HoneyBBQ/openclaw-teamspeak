import { createChatChannelPlugin } from "openclaw/plugin-sdk/core";
import type { ResolvedTeamspeakAccount } from "./types.js";
import { resolveAccount, inspectAccount, listAccountIds } from "./config.js";

type Base = Parameters<typeof createChatChannelPlugin<ResolvedTeamspeakAccount>>[0]["base"];

const base: Base = {
  id: "teamspeak",

  meta: {
    id: "teamspeak",
    label: "TeamSpeak",
    selectionLabel: "TeamSpeak",
    docsPath: "/channels/teamspeak",
    blurb: "Connect OpenClaw to TeamSpeak 3 servers via text chat.",
  },

  capabilities: {
    chatTypes: ["direct", "channel", "group"],
    media: false,
    polls: false,
    reactions: false,
    edit: false,
    unsend: false,
    reply: false,
    effects: false,
    threads: false,
  },

  setup: {
    applyAccountConfig({ cfg, input }) {
      const channels =
        ((cfg as Record<string, unknown>)["channels"] as Record<string, unknown> | undefined) ?? {};
      const section = (channels["teamspeak"] ?? {}) as Record<string, unknown>;

      if (input.token) section["server"] = input.token;
      if (input.name) section["nickname"] = input.name;
      if (input.dmAllowlist) section["allowFrom"] = input.dmAllowlist;

      channels["teamspeak"] = section;
      return { ...cfg, channels } as typeof cfg;
    },
  },

  config: {
    listAccountIds,
    resolveAccount,
    inspectAccount,
  },
};

export const teamspeakPlugin = createChatChannelPlugin<ResolvedTeamspeakAccount>({
  base,

  security: {
    dm: {
      channelKey: "teamspeak",
      resolvePolicy: (account) => account.dmPolicy,
      resolveAllowFrom: (account) => account.allowFrom,
      defaultPolicy: "allowlist",
    },
  },

  threading: { topLevelReplyToMode: "reply" },

  outbound: {
    attachedResults: {
      channel: "teamspeak",
      sendText: async (ctx) => {
        const { getClientManager } = await import("./service.js");
        const manager = getClientManager();
        if (!manager) throw new Error("teamspeak: not connected");

        const { targetMode, targetID } = resolveOutboundTarget(ctx.to);
        await manager.sendText(targetMode, targetID, ctx.text);

        return { messageId: `ts3-out-${Date.now()}` };
      },
    },
    base: {
      deliveryMode: "direct" as const,
    },
  },
});

/**
 * Parse an outbound target string back into TS3 targetMode + targetID.
 *
 * Target format conventions:
 *   - UID string (DM, targetMode=1): the invokerUID
 *   - numeric string (channel, targetMode=2): the channel ID
 *   - "server" (server-wide, targetMode=3): target 0
 */
function resolveOutboundTarget(to: string): {
  targetMode: number;
  targetID: bigint;
} {
  if (to === "server") {
    return { targetMode: 3, targetID: 0n };
  }

  if (/^\d+$/.test(to)) {
    return { targetMode: 2, targetID: BigInt(to) };
  }

  // Assume UID → private message; target ID must be the client's clid,
  // but we use 0 since TS3 private messages target by invokerID from the
  // original message context. The real clid resolution happens via the
  // client's internal tracking.
  return { targetMode: 1, targetID: 0n };
}
