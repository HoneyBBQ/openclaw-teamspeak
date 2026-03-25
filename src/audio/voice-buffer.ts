import type { VoiceData } from "@honeybbq/teamspeak-client";

const DEFAULT_SILENCE_TIMEOUT_MS = 300;
const DEFAULT_MIN_DURATION_MS = 500;
const FRAME_DURATION_MS = 20;

export type VoiceSegment = {
  clientId: number;
  codec: number;
  frames: Uint8Array[];
  startedAt: number;
  durationMs: number;
};

type ClientBuffer = {
  codec: number;
  frames: Uint8Array[];
  startedAt: number;
  lastFrameAt: number;
  silenceTimer: ReturnType<typeof setTimeout> | null;
};

export type VoiceBufferOptions = {
  silenceTimeoutMs?: number;
  minDurationMs?: number;
  onSegment: (segment: VoiceSegment) => void;
};

/**
 * Buffers incoming Opus frames per-client and emits complete voice segments
 * when a silence gap is detected (no new frames for silenceTimeoutMs).
 */
export class VoiceBuffer {
  #buffers = new Map<number, ClientBuffer>();
  #silenceTimeoutMs: number;
  #minDurationMs: number;
  #onSegment: (segment: VoiceSegment) => void;

  constructor(options: VoiceBufferOptions) {
    this.#silenceTimeoutMs = options.silenceTimeoutMs ?? DEFAULT_SILENCE_TIMEOUT_MS;
    this.#minDurationMs = options.minDurationMs ?? DEFAULT_MIN_DURATION_MS;
    this.#onSegment = options.onSegment;
  }

  push(voice: VoiceData): void {
    if (voice.data.length === 0) {
      this.#flush(voice.clientId);
      return;
    }

    let buf = this.#buffers.get(voice.clientId);
    if (!buf) {
      buf = {
        codec: voice.codec,
        frames: [],
        startedAt: Date.now(),
        lastFrameAt: Date.now(),
        silenceTimer: null,
      };
      this.#buffers.set(voice.clientId, buf);
    }

    buf.frames.push(new Uint8Array(voice.data));
    buf.lastFrameAt = Date.now();

    if (buf.silenceTimer !== null) {
      clearTimeout(buf.silenceTimer);
    }
    buf.silenceTimer = setTimeout(() => {
      this.#flush(voice.clientId);
    }, this.#silenceTimeoutMs);
  }

  #flush(clientId: number): void {
    const buf = this.#buffers.get(clientId);
    if (!buf || buf.frames.length === 0) {
      this.#buffers.delete(clientId);
      return;
    }

    if (buf.silenceTimer !== null) {
      clearTimeout(buf.silenceTimer);
      buf.silenceTimer = null;
    }

    const durationMs = buf.frames.length * FRAME_DURATION_MS;

    this.#buffers.delete(clientId);

    if (durationMs < this.#minDurationMs) {
      return;
    }

    this.#onSegment({
      clientId: clientId,
      codec: buf.codec,
      frames: buf.frames,
      startedAt: buf.startedAt,
      durationMs,
    });
  }

  destroy(): void {
    for (const [, buf] of this.#buffers) {
      if (buf.silenceTimer !== null) clearTimeout(buf.silenceTimer);
    }
    this.#buffers.clear();
  }
}
