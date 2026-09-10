import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  deleteContainedFile,
  listStalePhysicalFiles,
} from './file-cleanup-storage';

export const UPLOAD_ROOT = join(process.cwd(), 'storage', 'uploads');
export const QUARANTINE_ROOT = join(process.cwd(), 'storage', 'quarantine');
const MAX_BYTES = 25 * 1024 * 1024;

@Injectable()
export class ObjectStorageService {
  readonly name: string;
  private readonly client?: S3Client;
  private readonly bucket: string;
  private readonly prefix: string;
  constructor(config: ConfigService) {
    this.name = config.get<string>('STORAGE_DRIVER') ?? 'local';
    if (!['local', 's3'].includes(this.name))
      throw new Error('Unsupported STORAGE_DRIVER.');
    this.bucket = config.get<string>('S3_BUCKET') ?? '';
    this.prefix = config.get<string>('S3_PREFIX') ?? 'niazat-files';
    if (!/^[a-zA-Z0-9_-]+$/.test(this.prefix))
      throw new Error('Invalid S3_PREFIX.');
    if (this.name === 's3') {
      this.client = new S3Client({
        region: config.get<string>('S3_REGION') ?? 'us-east-1',
        endpoint: config.get<string>('S3_ENDPOINT') || undefined,
        forcePathStyle: String(config.get('S3_FORCE_PATH_STYLE')) === 'true',
        credentials: {
          accessKeyId: config.get<string>('S3_ACCESS_KEY_ID') ?? '',
          secretAccessKey: config.get<string>('S3_SECRET_ACCESS_KEY') ?? '',
        },
        maxAttempts: 2,
      });
    }
    for (const root of [UPLOAD_ROOT, QUARANTINE_ROOT])
      mkdirSync(root, { recursive: true });
  }
  private key(key: string) {
    if (!/^(?:[0-9a-f-]{36}|\.readiness-[0-9a-f-]{36}\.tmp)$/.test(key))
      throw new Error('Invalid storage key.');
    return `${this.prefix}/${key}`;
  }
  private path(key: string) {
    this.key(key);
    const path = join(UPLOAD_ROOT, key);
    if (existsSync(path)) {
      const stat = lstatSync(path);
      if (stat.isSymbolicLink() || !stat.isFile())
        throw new Error('Storage object must be a regular file.');
    }
    return path;
  }
  async put(key: string, body: Buffer, mimeType = 'application/octet-stream') {
    if (body.length > MAX_BYTES)
      throw new Error('Storage object is too large.');
    if (!this.client)
      return writeFile(this.path(key), body, { mode: 0o600, flag: 'wx' });
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.key(key),
        Body: body,
        ContentType: mimeType,
        ServerSideEncryption: 'AES256',
      }),
      { abortSignal: AbortSignal.timeout(10000) },
    );
  }
  async get(key: string) {
    if (!this.client) return readFile(this.path(key));
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: this.key(key) }),
      { abortSignal: AbortSignal.timeout(10000) },
    );
    if (
      !result.Body ||
      result.ContentLength === undefined ||
      result.ContentLength > MAX_BYTES
    )
      throw new Error('Invalid storage object.');
    const bytes = Buffer.from(await result.Body.transformToByteArray());
    if (bytes.length > MAX_BYTES)
      throw new Error('Storage object is too large.');
    return bytes;
  }
  async exists(key: string) {
    if (!this.client) return existsSync(this.path(key));
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: this.key(key) }),
        { abortSignal: AbortSignal.timeout(8000) },
      );
      return true;
    } catch (error) {
      if (
        (error as { $metadata?: { httpStatusCode?: number } }).$metadata
          ?.httpStatusCode === 404
      )
        return false;
      throw error;
    }
  }
  async delete(key: string) {
    this.key(key);
    if (!this.client) return deleteContainedFile(UPLOAD_ROOT, key);
    const existed = await this.exists(key);
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: this.key(key) }),
      { abortSignal: AbortSignal.timeout(8000) },
    );
    return existed;
  }
  async listStale(cutoff: Date) {
    if (!this.client) return listStalePhysicalFiles(UPLOAD_ROOT, cutoff);
    const keys: string[] = [];
    let continuation: string | undefined;
    do {
      const result = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: `${this.prefix}/`,
          ContinuationToken: continuation,
        }),
        { abortSignal: AbortSignal.timeout(8000) },
      );
      for (const object of result.Contents ?? []) {
        const key = object.Key?.slice(this.prefix.length + 1);
        if (
          key &&
          /^[0-9a-f-]{36}$/.test(key) &&
          object.LastModified &&
          object.LastModified < cutoff
        )
          keys.push(key);
      }
      continuation = result.IsTruncated
        ? result.NextContinuationToken
        : undefined;
    } while (continuation);
    return keys;
  }
  async probe() {
    const key = `.readiness-${randomUUID()}.tmp`;
    try {
      await this.put(key, Buffer.from('ready'));
      if ((await this.get(key)).toString() !== 'ready')
        throw new Error('Storage probe mismatch.');
    } finally {
      await this.delete(key);
    }
  }
}
