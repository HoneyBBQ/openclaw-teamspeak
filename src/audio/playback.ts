import type { Client } from "@honeybbq/teamspeak-client";

const TS3_OPUS_VOICE_CODEC = 4;
const FRAME_INTERVAL_MS = 20;

/**
 * Serialized playback queue — ensures only one voice stream plays at a time.
 * Subsequent calls wait until the previous playback finishes.
 * Supports barge-in: calling `interrupt()` aborts the current playback.
 */
export class PlaybackQueue {
  #tail: Promise<void> = Promise.resolve();
  #currentAbort: AbortController | null = null;

  play(client: Client, frames: Uint8Array[], signal?: AbortSignal): Promise<void> {
    const abort = new AbortController();
    if (signal) {
      signal.addEventListener("abort", () => abort.abort(), { once: true });
    }
    this.#currentAbort = abort;

    const prev = this.#tail;
    const next = prev.then(() => {
      if (abort.signal.aborted) return;
      return playOpusFramesInternal(client, frames, abort.signal);
    });
    this.#tail = next
      .catch(() => {})
      .finally(() => {
        if (this.#currentAbort === abort) this.#currentAbort = null;
      });
    return next;
  }

  interrupt(): void {
    this.#currentAbort?.abort();
    this.#currentAbort = null;
  }

  get isPlaying(): boolean {
    return this.#currentAbort !== null;
  }
}

function playOpusFramesInternal(
  client: Client,
  frames: Uint8Array[],
  signal?: AbortSignal,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (frames.length === 0) {
      resolve();
      return;
    }

    let index = 0;
    let expected = Date.now();
    let timer: ReturnType<typeof setTimeout> | null = null;

    function cleanup() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    }

    function onAbort() {
      cleanup();
      resolve();
    }

    signal?.addEventListener("abort", onAbort, { once: true });

    function tick() {
      if (signal?.aborted) {
        cleanup();
        resolve();
        return;
      }

      if (index >= frames.length) {
        cleanup();
        signal?.removeEventListener("abort", onAbort);
        resolve();
        return;
      }

      try {
        client.sendVoice(frames[index]!, TS3_OPUS_VOICE_CODEC);
      } catch (err) {
        cleanup();
        signal?.removeEventListener("abort", onAbort);
        reject(err);
        return;
      }

      index++;
      expected += FRAME_INTERVAL_MS;
      const drift = expected - Date.now();
      timer = setTimeout(tick, Math.max(0, drift));
    }

    expected = Date.now();
    tick();
  });
}
