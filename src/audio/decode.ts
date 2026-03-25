const TS3_SAMPLE_RATE = 48_000;
const _TS3_CHANNELS = 1;

export type DecodedAudio = {
  pcm: Float32Array;
  sampleRate: number;
  channels: number;
};

/**
 * Decode an audio buffer into mono PCM Float32 at 48kHz,
 * ready for Opus encoding into TS3 voice frames.
 */
export async function decodeAudioBuffer(
  audioBuffer: Buffer,
  outputFormat: string,
): Promise<DecodedAudio> {
  let decoded: DecodedAudio;

  if (outputFormat.includes("opus") || outputFormat.includes("ogg")) {
    decoded = await decodeOggOpus(audioBuffer);
  } else if (outputFormat.includes("mp3") || outputFormat.includes("mpeg")) {
    decoded = await decodeMp3(audioBuffer);
  } else {
    throw new Error(`unsupported TTS output format: ${outputFormat}`);
  }

  if (decoded.channels > 1) {
    decoded = mixToMono(decoded);
  }

  if (decoded.sampleRate !== TS3_SAMPLE_RATE) {
    decoded = resample(decoded, TS3_SAMPLE_RATE);
  }

  return decoded;
}

async function decodeOggOpus(buf: Buffer): Promise<DecodedAudio> {
  const { OggOpusDecoder } = await import("ogg-opus-decoder");
  const decoder = new OggOpusDecoder();
  await decoder.ready;

  try {
    const result = decoder.decode(new Uint8Array(buf));
    const channels = result.channelData.length;
    return {
      pcm: result.channelData[0]!,
      sampleRate: result.sampleRate,
      channels,
    };
  } finally {
    decoder.free();
  }
}

async function decodeMp3(buf: Buffer): Promise<DecodedAudio> {
  const { MPEGDecoder } = await import("mpg123-decoder");
  const decoder = new MPEGDecoder();
  await decoder.ready;

  try {
    const result = decoder.decode(new Uint8Array(buf));
    const channels = result.channelData.length;
    return {
      pcm: result.channelData[0]!,
      sampleRate: result.sampleRate,
      channels,
    };
  } finally {
    decoder.free();
  }
}

function mixToMono(audio: DecodedAudio): DecodedAudio {
  return { pcm: audio.pcm, sampleRate: audio.sampleRate, channels: 1 };
}

/**
 * Linear interpolation resampler. Good enough for speech;
 * avoids pulling in a full resampling library.
 */
function resample(audio: DecodedAudio, targetRate: number): DecodedAudio {
  const ratio = targetRate / audio.sampleRate;
  const outLen = Math.ceil(audio.pcm.length * ratio);
  const out = new Float32Array(outLen);

  for (let i = 0; i < outLen; i++) {
    const srcIdx = i / ratio;
    const lo = Math.floor(srcIdx);
    const hi = Math.min(lo + 1, audio.pcm.length - 1);
    const frac = srcIdx - lo;
    out[i] = audio.pcm[lo]! * (1 - frac) + audio.pcm[hi]! * frac;
  }

  return { pcm: out, sampleRate: targetRate, channels: 1 };
}
