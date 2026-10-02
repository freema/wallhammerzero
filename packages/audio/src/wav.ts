// WAV files: 16-bit PCM, written and read byte by byte (RIFF, a `fmt ` chunk, a `data` chunk).
// The writer is deterministic: the same samples give the same bytes.

const HEADER_BYTES = 44;

function ascii(view: DataView, at: number, text: string): void {
  for (let i = 0; i < text.length; i += 1) view.setUint8(at + i, text.charCodeAt(i));
}

/** A WAV file of interleaved 16-bit samples. */
export function encodeWav(pcm: Int16Array, channels: number, sampleRate: number): Uint8Array {
  if (!Number.isInteger(channels) || channels < 1 || channels > 2 || pcm.length % channels !== 0) {
    throw new RangeError(`encodeWav: ${pcm.length} samples do not fit ${String(channels)} channel(s)`);
  }
  const dataBytes = pcm.length * 2;
  const bytes = new Uint8Array(HEADER_BYTES + dataBytes);
  const view = new DataView(bytes.buffer);
  ascii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  ascii(view, 8, "WAVE");
  ascii(view, 12, "fmt ");
  view.setUint32(16, 16, true); // the size of the fmt chunk
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 2, true); // bytes per second
  view.setUint16(32, channels * 2, true); // bytes per frame
  view.setUint16(34, 16, true); // bits per sample
  ascii(view, 36, "data");
  view.setUint32(40, dataBytes, true);
  for (let i = 0; i < pcm.length; i += 1) view.setInt16(HEADER_BYTES + i * 2, pcm[i] as number, true);
  return bytes;
}

export interface DecodedWav {
  readonly sampleRate: number;
  readonly channels: number;
  /** Interleaved 16-bit samples. */
  readonly pcm: Int16Array;
}

/** Reads a 16-bit PCM WAV file (what `encodeWav` writes; other chunks are skipped). */
export function decodeWav(bytes: Uint8Array): DecodedWav {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at: number): string => String.fromCharCode(view.getUint8(at), view.getUint8(at + 1), view.getUint8(at + 2), view.getUint8(at + 3));
  if (bytes.length < 12 || tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new Error("decodeWav: not a WAV file");
  let sampleRate = 0;
  let channels = 0;
  let at = 12;
  while (at + 8 <= bytes.length) {
    const id = tag(at);
    const size = view.getUint32(at + 4, true);
    if (id === "fmt ") {
      const format = view.getUint16(at + 8, true);
      channels = view.getUint16(at + 10, true);
      sampleRate = view.getUint32(at + 12, true);
      const bits = view.getUint16(at + 22, true);
      if (format !== 1 || bits !== 16) throw new Error(`decodeWav: only 16-bit PCM is read (format ${format}, ${bits} bits)`);
    } else if (id === "data") {
      if (channels === 0) throw new Error("decodeWav: the data chunk comes before the fmt chunk");
      const count = Math.floor(Math.min(size, bytes.length - at - 8) / 2);
      const pcm = new Int16Array(count);
      for (let i = 0; i < count; i += 1) pcm[i] = view.getInt16(at + 8 + i * 2, true);
      return { sampleRate, channels, pcm };
    }
    at += 8 + size + (size % 2);
  }
  throw new Error("decodeWav: the file has no data chunk");
}

/** The channels of interleaved 16-bit samples as floats in -1..1. */
export function pcmToFloat(pcm: Int16Array, channels: number): Float32Array[] {
  const frames = Math.floor(pcm.length / channels);
  return Array.from({ length: channels }, (_, c) => {
    const out = new Float32Array(frames);
    for (let i = 0; i < frames; i += 1) out[i] = (pcm[i * channels + c] as number) / 32767;
    return out;
  });
}
