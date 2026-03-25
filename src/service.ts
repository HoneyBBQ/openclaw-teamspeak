import { TeamspeakClientManager } from "./client-manager.js";
import { resolveAccount } from "./config.js";
import { toInboundMessage, chatTypeFromTargetMode } from "./inbound.js";
import { getRuntime } from "./runtime.js";
import type { PluginLogger, TeamspeakInboundMessage } from "./types.js";
import { dispatchInboundReplyWithBase } from "openclaw/plugin-sdk/irc";
import { ttsToVoice } from "./audio/index.js";
import { VoiceBuffer, type VoiceSegment } from "./audio/voice-buffer.js";
import { writeOggOpus } from "./audio/ogg-writer.js";
import { getClientInfo } from "@honeybbq/teamspeak-client";

let activeManager: TeamspeakClientManager | null = null;
let activeVoiceBuffer: VoiceBuffer | null = null;

export function getClientManager(): TeamspeakClientManager | null {
  return activeManager;
}

async function handleVoiceSegment(params: {
  segment: VoiceSegment;
  config: Record<string, unknown>;
  logger: PluginLogger;
  stateDir: string;
}): Promise<void> {
  const { segment, config, logger, stateDir } = params;
  const runtime = getRuntime();
  const manager = getClientManager();
  if (!manager?.client) return;

  let senderNick = `clid-${segment.clientId}`;
  let senderUid = `clid-${segment.clientId}`;
  try {
    const info = await getClientInfo(manager.client, segment.clientId);
    senderNick = info["client_nickname"] ?? senderNick;
    senderUid = info["client_unique_identifier"] ?? senderUid;
  } catch {
    logger.warn(`could not resolve client info for clid=${segment.clientId}`);
  }

  logger.info(
    `voice segment from "${senderNick}" (${segment.durationMs}ms, ${segment.frames.length} frames)`,
  );

  const oggBuffer = writeOggOpus(segment.frames, 1);

  const { writeFile, mkdir } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const tmpDir = join(stateDir, "voice-tmp");
  await mkdir(tmpDir, { recursive: true });
  const filePath = join(tmpDir, `voice-${segment.clientId}-${Date.now()}.ogg`);
  await writeFile(filePath, oggBuffer);

  logger.info(
    `wrote OGG file: ${filePath} (${oggBuffer.length} bytes, ${segment.frames.length} frames, codec=${segment.codec})`,
  );

  try {
    const result = await runtime.stt.transcribeAudioFile({
      filePath,
      cfg: config,
      mime: "audio/ogg",
    });

    // Keep file for debugging if transcript is empty
    if (result.text?.trim()) {
      const { unlink } = await import("node:fs/promises");
      await unlink(filePath).catch(() => {});
    }

    const text = result.text?.trim();
    if (!text) {
      logger.info(`STT returned empty transcript for ${senderNick}, skipping`);
      return;
    }

    logger.info(`STT from "${senderNick}": ${text.slice(0, 80)}`);

    const inbound: TeamspeakInboundMessage = {
      messageId: `ts3-stt-${Date.now()}`,
      target: senderUid,
      senderNick,
      senderUid,
      senderClid: segment.clientId,
      text,
      timestamp: segment.startedAt,
      isGroup: false,
      targetMode: 1,
      channelId: undefined,
    };

    await handleTeamspeakInbound({ message: inbound, config, logger });
  } catch (err) {
    logger.error(`STT failed: ${err instanceof Error ? err.message : String(err)}`);
    const { unlink } = await import("node:fs/promises");
    await unlink(filePath).catch(() => {});
  }
}

async function handleTeamspeakInbound(params: {
  message: TeamspeakInboundMessage;
  config: Record<string, unknown>;
  logger: PluginLogger;
}): Promise<void> {
  const { message, config, logger } = params;
  const runtime = getRuntime();

  const rawBody = message.text?.trim() ?? "";
  if (!rawBody) return;

  const chatType = chatTypeFromTargetMode(message.targetMode);
  const peerId = message.isGroup ? message.target : message.senderUid;

  const route = runtime.channel.routing.resolveAgentRoute({
    cfg: config,
    channel: "teamspeak",
    peer: {
      kind: message.isGroup ? "group" : "direct",
      id: peerId,
    },
  });

  const sessionSection = (config as Record<string, unknown>)["session"] as
    | Record<string, unknown>
    | undefined;
  const storePath = runtime.channel.session.resolveStorePath(
    sessionSection?.["store"] as string | undefined,
    { agentId: route.agentId },
  );

  const envelopeOptions = runtime.channel.reply.resolveEnvelopeFormatOptions(config);

  const previousTimestamp = runtime.channel.session.readSessionUpdatedAt({
    storePath,
    sessionKey: route.sessionKey,
  });

  const body = runtime.channel.reply.formatAgentEnvelope({
    channel: "TeamSpeak",
    from: message.isGroup ? `${message.senderNick} in ${message.target}` : message.senderNick,
    timestamp: message.timestamp,
    previousTimestamp,
    envelope: envelopeOptions,
    body: rawBody,
  });

  const ctxPayload = runtime.channel.reply.finalizeInboundContext({
    Body: body,
    RawBody: rawBody,
    CommandBody: rawBody,
    From: message.isGroup
      ? `teamspeak:channel:${message.target}`
      : `teamspeak:${message.senderUid}`,
    To: `teamspeak:${peerId}`,
    SessionKey: route.sessionKey,
    AccountId: route.accountId,
    ChatType: chatType,
    ConversationLabel: message.isGroup ? message.target : message.senderNick,
    SenderName: message.senderNick,
    SenderId: message.senderUid,
    GroupSubject: message.isGroup ? message.target : undefined,
    Provider: "teamspeak",
    Surface: "teamspeak",
    WasMentioned: message.isGroup ? undefined : undefined,
    MessageSid: message.messageId,
    Timestamp: message.timestamp,
    OriginatingChannel: "teamspeak",
    OriginatingTo: `teamspeak:${peerId}`,
    CommandAuthorized: true,
  });

  runtime.channel.activity.record({
    channel: "teamspeak",
    direction: "inbound",
    at: message.timestamp,
  });

  await dispatchInboundReplyWithBase({
    cfg: config,
    channel: "teamspeak",
    route,
    storePath,
    ctxPayload,
    core: runtime,
    deliver: async (payload) => {
      const manager = getClientManager();
      if (!manager?.connected) {
        logger.warn("cannot deliver reply: not connected to TeamSpeak");
        return;
      }
      const text =
        typeof payload === "string" ? payload : ((payload as { text?: string }).text ?? "");
      if (!text) return;

      const account = resolveAccount(config);
      const sendText = account.tts.replyMode !== "voice";
      const sendVoice = account.tts.enabled && account.tts.replyMode !== "text";

      if (sendText) {
        const targetMode = message.isGroup ? message.targetMode : 1;
        const targetID = message.isGroup ? BigInt(message.target) : BigInt(message.senderClid);
        await manager.sendText(targetMode, targetID, text);
      }

      if (sendVoice && manager.client) {
        try {
          const ttsResult = await runtime.tts.textToSpeech({
            text,
            cfg: config,
            channel: "teamspeak",
          });

          if (ttsResult.success && ttsResult.audioPath) {
            const { readFile } = await import("node:fs/promises");
            const audioBuffer = await readFile(ttsResult.audioPath);
            await ttsToVoice({
              audioBuffer,
              outputFormat: ttsResult.outputFormat ?? "opus",
              client: manager.client,
              logger,
            });
          } else if (!ttsResult.success) {
            logger.warn(`TTS failed: ${ttsResult.error ?? "unknown error"}`);
          }
        } catch (err) {
          logger.warn(
            `TTS voice playback failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      runtime.channel.activity.record({
        channel: "teamspeak",
        direction: "outbound",
      });
    },
    onRecordError: (err) => {
      logger.error(
        `failed updating session meta: ${err instanceof Error ? err.message : String(err)}`,
      );
    },
    onDispatchError: (err, info) => {
      logger.error(
        `${info.kind} reply failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    },
  });
}

export const teamspeakService = {
  id: "teamspeak-connection",

  async start(ctx: { config: Record<string, unknown>; stateDir: string; logger: PluginLogger }) {
    const account = resolveAccount(ctx.config);
    const logger = ctx.logger;

    const manager = new TeamspeakClientManager(account, logger, ctx.stateDir);
    activeManager = manager;

    manager.onMessage(async (msg) => {
      const botChannelId = manager.channelID || undefined;
      const inbound = toInboundMessage(msg, botChannelId);

      logger.info(
        `inbound ${chatTypeFromTargetMode(msg.targetMode)} from "${inbound.senderNick}": ${inbound.text.slice(0, 80)}`,
      );

      try {
        await handleTeamspeakInbound({
          message: inbound,
          config: ctx.config,
          logger,
        });
      } catch (err) {
        logger.error(
          `inbound handling failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    });

    if (account.stt.enabled) {
      const voiceBuffer = new VoiceBuffer({
        silenceTimeoutMs: account.stt.silenceTimeoutMs,
        minDurationMs: account.stt.minDurationMs,
        onSegment: (segment) => {
          handleVoiceSegment({
            segment,
            config: ctx.config,
            logger,
            stateDir: ctx.stateDir,
          }).catch((err) => {
            logger.error(
              `voice segment handling failed: ${err instanceof Error ? err.message : String(err)}`,
            );
          });
        },
      });
      activeVoiceBuffer = voiceBuffer;

      manager.onVoiceData((data) => {
        voiceBuffer.push(data);
      });

      logger.info(
        `STT enabled (silence=${account.stt.silenceTimeoutMs}ms, min=${account.stt.minDurationMs}ms)`,
      );
    }

    await manager.start();
  },

  async stop(_ctx: unknown) {
    if (activeVoiceBuffer) {
      activeVoiceBuffer.destroy();
      activeVoiceBuffer = null;
    }
    if (activeManager) {
      await activeManager.stop();
      activeManager = null;
    }
  },
};
