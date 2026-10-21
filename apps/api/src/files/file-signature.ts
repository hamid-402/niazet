const PDF = Buffer.from('%PDF-');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff]);
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const OLE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

function startsWith(buffer: Buffer, signature: Buffer) {
  return (
    buffer.length >= signature.length &&
    buffer.subarray(0, signature.length).equals(signature)
  );
}

function isText(buffer: Buffer) {
  if (buffer.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return true;
  } catch {
    return false;
  }
}

export function matchesDeclaredMime(buffer: Buffer, mimeType: string): boolean {
  switch (mimeType) {
    case 'application/pdf':
      return startsWith(buffer, PDF);
    case 'image/png':
      return startsWith(buffer, PNG);
    case 'image/jpeg':
      return startsWith(buffer, JPEG);
    case 'image/webp':
      return (
        buffer.length >= 12 &&
        buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
        buffer.subarray(8, 12).toString('ascii') === 'WEBP'
      );
    case 'application/msword':
      return startsWith(buffer, OLE);
    case 'application/zip':
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
    case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
      return startsWith(buffer, ZIP);
    case 'text/plain':
    case 'text/csv':
      return isText(buffer);
    default:
      return false;
  }
}
