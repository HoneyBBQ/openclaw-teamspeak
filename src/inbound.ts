import type { TextMessage } from "@honeybbq/teamspeak-client";
import type { TeamspeakInboundMessage } from "./types.js";

let messageSeq = 0;

/**
 * Convert a TS3 textMessage event into the plugin's inbound message format.
 *
 * TS3 targetMode values:
 *   1 = private (DM to bot)
 *   2 = channel
 *   3 = server-wide
 */
export function toInboundMessage(
  msg: TextMessage,
  botChannelId: bigint | undefined,
): TeamspeakInboundMessage {
  const isGroup = msg.targetMode !== 1;

  let target: string;
  let channelId: bigint | undefined;

  switch (msg.targetMode) {
    case 1:
      target = msg.invokerUID;
      break;
    case 2:
      channelId = botChannelId;
      target = channelId !== undefined ? String(channelId) : "unknown-channel";
      break;
    case 3:
      target = "server";
      break;
    default:
      target = msg.invokerUID;
  }

  return {
    messageId: `ts3-${Date.now()}-${++messageSeq}`,
    target,
    senderNick: msg.invokerName,
    senderUid: msg.invokerUID,
    senderClid: msg.invokerID,
    text: msg.message,
    timestamp: Date.now(),
    isGroup,
    targetMode: msg.targetMode,
    channelId,
  };
}

/**
 * Determine the OpenClaw ChatType from a TS3 targetMode.
 */
export function chatTypeFromTargetMode(targetMode: number): "direct" | "channel" | "group" {
  switch (targetMode) {
    case 1:
      return "direct";
    case 2:
      return "channel";
    case 3:
      return "group";
    default:
      return "direct";
  }
}
