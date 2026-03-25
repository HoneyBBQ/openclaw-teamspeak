import type { Client } from "@honeybbq/teamspeak-client";
import type { PluginLogger } from "../types.js";
import { decodeAudioBuffer } from "./decode.js";
import { encodeToOpusFrames } from "./encode.js";
import { PlaybackQueue } from "./playback.js";

export { decodeAudioBuffer } from "./decode.js";
export { encodeToOpusFrames } from "./encode.js";
export { PlaybackQueue } from "./playback.js";

const globalQueue = new PlaybackQueue();

/**
 * Convert TTS audio output to TS3 voice and play it in the bot's current channel.
 * Playback is serialized through a global queue — concurrent calls wait in line.
 *
 * Pipeline: audioBuffer → decode to PCM → encode to Opus frames → queued sendVoice
 */
export async function ttsToVoice(params: {
  audioBuffer: Buffer;
  outputFormat: string;
  client: Client;
  logger: PluginLogger;
  signal?: AbortSignal;
}): Promise<void> {
  const { audioBuffer, outputFormat, client, logger, signal } = params;

  const decoded = await decodeAudioBuffer(audioBuffer, outputFormat);
  logger.info(`decoded TTS audio: ${decoded.pcm.length} samples, ${decoded.sampleRate}Hz`);

  const frames = await encodeToOpusFrames(decoded.pcm);
  logger.info(`encoded ${frames.length} Opus frames (${frames.length * 20}ms)`);

  await globalQueue.play(client, frames, signal);
  logger.info("voice playback complete");
}
