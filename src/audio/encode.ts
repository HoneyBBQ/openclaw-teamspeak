const TS3_SAMPLE_RATE = 48_000;
const FRAME_DURATION_MS = 20;
const FRAME_SIZE = (TS3_SAMPLE_RATE * FRAME_DURATION_MS) / 1000; // 960 samples

/**
 * Encode mono 48kHz PCM Float32 into a sequence of Opus frames
 * suitable for TS3 voice packets (20ms each, 960 samples/frame).
 */
export async function encodeToOpusFrames(pcm: Float32Array): Promise<Uint8Array[]> {
  const { Encoder } = await import("@evan/opus");

  const encoder = new Encoder({
    channels: 1,
    sample_rate: TS3_SAMPLE_RATE,
    application: "voip",
  });
  encoder.signal = "voice";
  encoder.expert_frame_duration = FRAME_DURATION_MS as 20;

  const frames: Uint8Array[] = [];
  const totalFrames = Math.floor(pcm.length / FRAME_SIZE);

  for (let i = 0; i < totalFrames; i++) {
    const slice = pcm.subarray(i * FRAME_SIZE, (i + 1) * FRAME_SIZE);

    // @evan/opus expects Int16 PCM input; convert from Float32
    const int16 = float32ToInt16(slice);
    const encoded = encoder.encode(int16);
    frames.push(new Uint8Array(encoded));
  }

  return frames;
}

function float32ToInt16(float32: Float32Array): Int16Array {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]!));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16;
}
