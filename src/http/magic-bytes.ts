export type MagicByteType = 'jpg' | 'png' | 'webm' | 'unknown';

export function magicByteType(bytes: Uint8Array): MagicByteType {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'jpg';

  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'png';
  }

  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) {
    return includesAscii(bytes, 'webm') ? 'webm' : 'unknown';
  }

  return 'unknown';
}

function startsWith(bytes: Uint8Array, prefix: number[]): boolean {
  if (bytes.length < prefix.length) return false;

  return prefix.every((byte, index) => bytes[index] === byte);
}

function includesAscii(bytes: Uint8Array, text: string): boolean {
  const needle = Buffer.from(text, 'ascii');
  return Buffer.from(bytes).includes(needle);
}
