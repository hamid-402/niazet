import { createDecipheriv, createHash, timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open, readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Writable } from 'node:stream';

export const BACKUP_MAGIC = Buffer.from('NIAZATBK1\n', 'ascii');
export const AUTH_TAG_BYTES = 16;
export const MAX_HEADER_BYTES = 16 * 1024;

export function encryptionKey(value = process.env.BACKUP_ENCRYPTION_KEY) {
  if (!value) throw new Error('BACKUP_ENCRYPTION_KEY is required.');
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value)) {
    throw new Error(
      'BACKUP_ENCRYPTION_KEY must use canonical base64 encoding.',
    );
  }
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32) {
    throw new Error(
      'BACKUP_ENCRYPTION_KEY must be a base64-encoded 32-byte key.',
    );
  }
  return key;
}

export function encodeHeader(header) {
  const json = Buffer.from(JSON.stringify(header), 'utf8');
  if (json.length > MAX_HEADER_BYTES)
    throw new Error('Backup header is too large.');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(json.length);
  return Buffer.concat([BACKUP_MAGIC, length, json]);
}

export async function readBackupMetadata(file) {
  const handle = await open(file, 'r');
  try {
    const stat = await handle.stat();
    const prefix = Buffer.alloc(BACKUP_MAGIC.length + 4);
    await handle.read(prefix, 0, prefix.length, 0);
    if (!prefix.subarray(0, BACKUP_MAGIC.length).equals(BACKUP_MAGIC)) {
      throw new Error('Backup magic/version is invalid.');
    }
    const headerLength = prefix.readUInt32BE(BACKUP_MAGIC.length);
    if (headerLength < 2 || headerLength > MAX_HEADER_BYTES) {
      throw new Error('Backup header length is invalid.');
    }
    const cipherStart = prefix.length + headerLength;
    if (stat.size <= cipherStart + AUTH_TAG_BYTES) {
      throw new Error('Backup payload is incomplete.');
    }
    const headerBuffer = Buffer.alloc(headerLength);
    await handle.read(headerBuffer, 0, headerLength, prefix.length);
    const authTag = Buffer.alloc(AUTH_TAG_BYTES);
    await handle.read(authTag, 0, AUTH_TAG_BYTES, stat.size - AUTH_TAG_BYTES);
    const header = JSON.parse(headerBuffer.toString('utf8'));
    if (
      header?.version !== 1 ||
      header?.algorithm !== 'aes-256-gcm' ||
      typeof header?.iv !== 'string' ||
      typeof header?.keyId !== 'string'
    ) {
      throw new Error('Backup cryptographic metadata is invalid.');
    }
    const iv = Buffer.from(header.iv, 'base64');
    if (iv.length !== 12) throw new Error('Backup IV is invalid.');
    return {
      header,
      authenticatedHeader: Buffer.concat([prefix, headerBuffer]),
      iv,
      authTag,
      cipherStart,
      cipherEnd: stat.size - AUTH_TAG_BYTES - 1,
      size: stat.size,
    };
  } finally {
    await handle.close();
  }
}

export async function sha256File(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

export async function verifyChecksum(file) {
  const checksumFile = `${file}.sha256`;
  const expectedLine = (await readFile(checksumFile, 'utf8')).trim();
  const [expected, expectedName] = expectedLine.split(/\s+/, 2);
  if (!expected || expectedName !== basename(file)) {
    throw new Error('Backup checksum manifest is invalid.');
  }
  const actual = await sha256File(file);
  const left = Buffer.from(expected, 'hex');
  const right = Buffer.from(actual, 'hex');
  if (
    left.length !== 32 ||
    right.length !== 32 ||
    !timingSafeEqual(left, right)
  ) {
    throw new Error('Backup checksum verification failed.');
  }
  return actual;
}

export function decryptedStream(file, key, metadata) {
  const decipher = createDecipheriv('aes-256-gcm', key, metadata.iv);
  decipher.setAAD(metadata.authenticatedHeader);
  decipher.setAuthTag(metadata.authTag);
  return {
    source: createReadStream(file, {
      start: metadata.cipherStart,
      end: metadata.cipherEnd,
    }),
    decipher,
  };
}

export async function verifyBackupFile(file, key = encryptionKey()) {
  await verifyChecksum(file);
  const metadata = await readBackupMetadata(file);
  const expectedKeyId = process.env.BACKUP_EXPECTED_KEY_ID;
  if (expectedKeyId && metadata.header.keyId !== expectedKeyId) {
    throw new Error(
      'Backup key identifier does not match BACKUP_EXPECTED_KEY_ID.',
    );
  }
  const { source, decipher } = decryptedStream(file, key, metadata);
  const sink = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
  await pipeline(source, decipher, sink);
  return metadata;
}
