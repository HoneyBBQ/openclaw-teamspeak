/**
 * Minimal OGG/Opus writer — packs raw Opus frames into a valid OGG container
 * so the STT API can process them as a standard audio file.
 *
 * Based on RFC 7845 (Ogg Encapsulation for Opus) and RFC 3533 (OGG).
 */

const OGG_CAPTURE = new Uint8Array([0x4f, 0x67, 0x67, 0x53]); // "OggS"
const OPUS_HEAD_MAGIC = new Uint8Array([0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64]); // "OpusHead"
const OPUS_TAGS_MAGIC = new Uint8Array([0x4f, 0x70, 0x75, 0x73, 0x54, 0x61, 0x67, 0x73]); // "OpusTags"

const SAMPLE_RATE = 48_000;
const FRAME_DURATION_MS = 20;
const SAMPLES_PER_FRAME = (SAMPLE_RATE * FRAME_DURATION_MS) / 1000; // 960
const SERIAL_NUMBER = 0x54533301; // arbitrary

/**
 * Write a sequence of raw Opus frames into a Buffer containing
 * a valid OGG/Opus file (OpusHead + OpusTags + audio pages).
 */
export function writeOggOpus(frames: Uint8Array[], channels = 1): Buffer {
  const pages: Buffer[] = [];
  let pageSeq = 0;
  let granulePos = 0n;

  // Page 1: OpusHead (BOS)
  const opusHead = buildOpusHead(channels);
  pages.push(buildOggPage(opusHead, pageSeq++, 0n, SERIAL_NUMBER, 0x02));

  // Page 2: OpusTags
  const opusTags = buildOpusTags();
  pages.push(buildOggPage(opusTags, pageSeq++, 0n, SERIAL_NUMBER, 0x00));

  // Audio pages: pack frames into pages (max ~255 segments per page)
  const MAX_SEGMENTS = 255;
  let pageFrames: Uint8Array[] = [];

  for (let i = 0; i < frames.length; i++) {
    pageFrames.push(frames[i]!);
    granulePos += BigInt(SAMPLES_PER_FRAME);

    const isLast = i === frames.length - 1;
    if (pageFrames.length >= MAX_SEGMENTS || isLast) {
      const flags = isLast ? 0x04 : 0x00; // EOS on last
      pages.push(buildOggPageMultiSegment(pageFrames, pageSeq++, granulePos, SERIAL_NUMBER, flags));
      pageFrames = [];
    }
  }

  return Buffer.concat(pages);
}

function buildOpusHead(channels: number): Uint8Array {
  const buf = new Uint8Array(19);
  buf.set(OPUS_HEAD_MAGIC, 0);
  buf[8] = 1; // version
  buf[9] = channels;
  // pre-skip (u16 LE) — 3840 is standard for 80ms
  new DataView(buf.buffer).setUint16(10, 3840, true);
  // input sample rate (u32 LE)
  new DataView(buf.buffer).setUint32(12, SAMPLE_RATE, true);
  // output gain (i16 LE) = 0
  new DataView(buf.buffer).setInt16(16, 0, true);
  buf[18] = 0; // channel mapping family
  return buf;
}

function buildOpusTags(): Uint8Array {
  const vendor = new TextEncoder().encode("openclaw-teamspeak");
  const buf = new Uint8Array(8 + 4 + vendor.length + 4);
  buf.set(OPUS_TAGS_MAGIC, 0);
  new DataView(buf.buffer).setUint32(8, vendor.length, true);
  buf.set(vendor, 12);
  // user comment list length = 0
  new DataView(buf.buffer).setUint32(12 + vendor.length, 0, true);
  return buf;
}

function buildOggPage(
  data: Uint8Array,
  pageSeq: number,
  granulePos: bigint,
  serial: number,
  flags: number,
): Buffer {
  return buildOggPageMultiSegment([data], pageSeq, granulePos, serial, flags);
}

function buildOggPageMultiSegment(
  segments: Uint8Array[],
  pageSeq: number,
  granulePos: bigint,
  serial: number,
  flags: number,
): Buffer {
  const segmentTable: number[] = [];
  for (const seg of segments) {
    let remaining = seg.length;
    while (remaining >= 255) {
      segmentTable.push(255);
      remaining -= 255;
    }
    segmentTable.push(remaining);
  }

  const headerSize = 27 + segmentTable.length;
  const dataSize = segments.reduce((sum, s) => sum + s.length, 0);
  const page = Buffer.alloc(headerSize + dataSize);

  page.set(OGG_CAPTURE, 0);
  page[4] = 0; // stream structure version
  page[5] = flags;
  page.writeBigInt64LE(granulePos, 6);
  page.writeUInt32LE(serial, 14);
  page.writeUInt32LE(pageSeq, 18);
  // checksum at offset 22 — fill after
  page[26] = segmentTable.length;
  for (let i = 0; i < segmentTable.length; i++) {
    page[27 + i] = segmentTable[i]!;
  }

  let offset = headerSize;
  for (const seg of segments) {
    page.set(seg, offset);
    offset += seg.length;
  }

  // CRC-32 (OGG variant)
  const crc = oggCrc32(page);
  page.writeUInt32LE(crc, 22);

  return page;
}

// OGG uses a non-standard CRC-32 polynomial
const CRC_TABLE = buildCrcTable();

function buildCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let j = 0; j < 8; j++) {
      r = (r & 0x80000000) !== 0 ? ((r << 1) ^ 0x04c11db7) >>> 0 : (r << 1) >>> 0;
    }
    table[i] = r >>> 0;
  }
  return table;
}

function oggCrc32(data: Uint8Array): number {
  let crc = 0;
  for (let i = 0; i < data.length; i++) {
    crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) & 0xff) ^ data[i]!]!) >>> 0;
  }
  return crc >>> 0;
}
