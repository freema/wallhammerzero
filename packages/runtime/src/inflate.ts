// Inflate: decompresses a zlib stream (RFC 1950) of DEFLATE data (RFC 1951). A baked sheet is
// an indexed PNG, and a browser's own image decoder gives colours, not palette indices; so the
// runtime reads the PNG itself, and that needs this. Written from the two RFCs, in plain
// integer TypeScript: it runs the same in the browser, in Node and in a later port, and it
// is synchronous.
//
// The caller knows how long the output is (a PNG says its size), so the output is one buffer
// of that length and a stream that gives more or less is an error.
//
// Huffman codes are decoded one bit at a time against the count of codes per length (the
// canonical code of RFC 1951 §3.2.2). That is simple and exact, and fast enough for sprite
// sheets; a table-driven decoder is the next step if a profile ever asks for it.

const MAX_BITS = 15;

/** A canonical Huffman code: how many codes each length has, and the symbols in code order. */
interface Huffman {
  readonly counts: Uint16Array;
  readonly symbols: Uint16Array;
}

function fail(message: string): never {
  throw new Error(`inflate: ${message}`);
}

function buildHuffman(lengths: Uint8Array, what: string): Huffman {
  const counts = new Uint16Array(MAX_BITS + 1);
  for (let symbol = 0; symbol < lengths.length; symbol += 1) counts[lengths[symbol] as number] += 1;
  // More codes of a length than the bits allow: the lengths do not describe a code.
  let left = 1;
  for (let length = 1; length <= MAX_BITS; length += 1) {
    left = left * 2 - (counts[length] as number);
    if (left < 0) fail(`the ${what} code lengths are over-subscribed`);
  }
  const offsets = new Uint16Array(MAX_BITS + 2);
  for (let length = 1; length <= MAX_BITS; length += 1) offsets[length + 1] = (offsets[length] as number) + (counts[length] as number);
  const symbols = new Uint16Array(lengths.length);
  for (let symbol = 0; symbol < lengths.length; symbol += 1) {
    const length = lengths[symbol] as number;
    if (length !== 0) {
      symbols[offsets[length] as number] = symbol;
      offsets[length] += 1;
    }
  }
  return { counts, symbols };
}

// RFC 1951 §3.2.5: the base value and the number of extra bits of each length and distance code.
const LENGTH_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LENGTH_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DISTANCE_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577,
];
const DISTANCE_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
// RFC 1951 §3.2.7: the order in which the lengths of the code-length code are stored.
const CODE_LENGTH_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

let fixedCodes: { literals: Huffman; distances: Huffman } | null = null;

/** The codes of a "fixed" block (RFC 1951 §3.2.6). */
function fixed(): { literals: Huffman; distances: Huffman } {
  if (fixedCodes === null) {
    const literals = new Uint8Array(288);
    literals.fill(8, 0, 144).fill(9, 144, 256).fill(7, 256, 280).fill(8, 280, 288);
    fixedCodes = { literals: buildHuffman(literals, "fixed literal"), distances: buildHuffman(new Uint8Array(30).fill(5), "fixed distance") };
  }
  return fixedCodes;
}

/** Adler-32 of `data` (RFC 1950 §8.2), as an unsigned 32-bit integer. */
export function adler32(data: Uint8Array): number {
  let a = 1;
  let b = 0;
  let at = 0;
  while (at < data.length) {
    // 5552 bytes is the longest run for which the sums stay below 2^32 without the modulo.
    const end = Math.min(at + 5552, data.length);
    for (; at < end; at += 1) {
      a += data[at] as number;
      b += a;
    }
    a %= 65521;
    b %= 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/**
 * Decompresses a zlib stream into exactly `size` bytes. Throws when the stream is damaged or
 * cut off, when it gives another number of bytes, or when its checksum is wrong.
 */
export function inflateZlib(data: Uint8Array, size: number): Uint8Array {
  if (!Number.isInteger(size) || size < 0) fail(`the output size must be a non-negative integer, got ${String(size)}`);
  if (data.length < 6) fail("the stream is cut off (shorter than a zlib header and checksum)");
  const cmf = data[0] as number;
  const flags = data[1] as number;
  if ((cmf & 0x0f) !== 8 || cmf >>> 4 > 7) fail(`not a zlib stream of DEFLATE data (first byte ${cmf})`);
  if (((cmf << 8) | flags) % 31 !== 0) fail("the zlib header check failed");
  if ((flags & 0x20) !== 0) fail("the stream needs a preset dictionary");

  const out = new Uint8Array(size);
  let written = 0;
  let pos = 2;
  let bitBuffer = 0;
  let bitCount = 0;

  /** The next `need` bits (0..16), least significant first. */
  const bits = (need: number): number => {
    while (bitCount < need) {
      if (pos >= data.length) fail("the stream is cut off");
      bitBuffer |= (data[pos] as number) << bitCount;
      pos += 1;
      bitCount += 8;
    }
    const value = bitBuffer & ((1 << need) - 1);
    bitBuffer >>>= need;
    bitCount -= need;
    return value;
  };

  /** The next symbol of a code: bits are read until they form a code of the current length. */
  const decode = (code: Huffman): number => {
    let value = 0;
    let first = 0; // the first code of this length
    let index = 0; // the place of that code's symbol in `symbols`
    for (let length = 1; length <= MAX_BITS; length += 1) {
      value |= bits(1);
      const count = code.counts[length] as number;
      if (value - count < first) return code.symbols[index + (value - first)] as number;
      index += count;
      first = (first + count) << 1;
      value <<= 1;
    }
    return fail("a code that is not in the Huffman table");
  };

  const readDynamic = (): { literals: Huffman; distances: Huffman } => {
    const literalCount = bits(5) + 257;
    const distanceCount = bits(5) + 1;
    const lengthCount = bits(4) + 4;
    if (literalCount > 286 || distanceCount > 30) fail("a dynamic block lists too many codes");
    const codeLengths = new Uint8Array(19);
    for (let i = 0; i < lengthCount; i += 1) codeLengths[CODE_LENGTH_ORDER[i] as number] = bits(3);
    const lengthCode = buildHuffman(codeLengths, "code-length");
    const total = literalCount + distanceCount;
    const lengths = new Uint8Array(total);
    let at = 0;
    while (at < total) {
      const symbol = decode(lengthCode);
      if (symbol < 16) {
        lengths[at] = symbol;
        at += 1;
        continue;
      }
      let value = 0;
      let repeat: number;
      if (symbol === 16) {
        if (at === 0) fail("a dynamic block repeats a length before giving one");
        value = lengths[at - 1] as number;
        repeat = 3 + bits(2);
      } else if (symbol === 17) repeat = 3 + bits(3);
      else repeat = 11 + bits(7);
      if (at + repeat > total) fail("a dynamic block repeats lengths past the end of its tables");
      lengths.fill(value, at, at + repeat);
      at += repeat;
    }
    if (lengths[256] === 0) fail("a dynamic block has no end-of-block code");
    return {
      literals: buildHuffman(lengths.subarray(0, literalCount), "literal"),
      distances: buildHuffman(lengths.subarray(literalCount), "distance"),
    };
  };

  let last: number;
  do {
    last = bits(1);
    const type = bits(2);
    if (type === 0) {
      // Stored: the rest of the current byte is skipped, then LEN, its complement, and the bytes.
      bitBuffer = 0;
      bitCount = 0;
      if (pos + 4 > data.length) fail("the stream is cut off");
      const length = (data[pos] as number) | ((data[pos + 1] as number) << 8);
      const check = (data[pos + 2] as number) | ((data[pos + 3] as number) << 8);
      pos += 4;
      if ((length ^ 0xffff) !== check) fail("a stored block has a damaged length");
      if (pos + length > data.length) fail("the stream is cut off");
      if (written + length > size) fail(`the stream holds more than the expected ${size} bytes`);
      out.set(data.subarray(pos, pos + length), written);
      pos += length;
      written += length;
    } else if (type === 1 || type === 2) {
      const { literals, distances } = type === 1 ? fixed() : readDynamic();
      for (;;) {
        const symbol = decode(literals);
        if (symbol < 256) {
          if (written >= size) fail(`the stream holds more than the expected ${size} bytes`);
          out[written] = symbol;
          written += 1;
        } else if (symbol === 256) {
          break;
        } else {
          const lengthCode = symbol - 257;
          if (lengthCode >= LENGTH_BASE.length) fail("a length code that does not exist");
          const length = (LENGTH_BASE[lengthCode] as number) + bits(LENGTH_EXTRA[lengthCode] as number);
          const distanceCode = decode(distances);
          if (distanceCode >= DISTANCE_BASE.length) fail("a distance code that does not exist");
          const distance = (DISTANCE_BASE[distanceCode] as number) + bits(DISTANCE_EXTRA[distanceCode] as number);
          if (distance > written) fail("a copy from before the start of the output");
          if (written + length > size) fail(`the stream holds more than the expected ${size} bytes`);
          // Byte by byte on purpose: the source may overlap the bytes being written.
          for (let i = 0; i < length; i += 1) {
            out[written] = out[written - distance] as number;
            written += 1;
          }
        }
      }
    } else {
      fail("a block of a type that does not exist");
    }
  } while (last === 0);

  if (written !== size) fail(`the stream holds ${written} bytes, expected ${size}`);
  // The checksum follows the last block, at the next whole byte.
  if (pos + 4 > data.length) fail("the stream is cut off before its checksum");
  const expected = (((data[pos] as number) << 24) | ((data[pos + 1] as number) << 16) | ((data[pos + 2] as number) << 8) | (data[pos + 3] as number)) >>> 0;
  if (adler32(out) !== expected) fail("the checksum (Adler-32) does not match: the data is damaged");
  return out;
}
