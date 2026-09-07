import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { ObjectStorageService } from './object-storage.service';
describe('private object storage', () => {
  const key = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  let send: jest.SpyInstance;
  beforeEach(() => {
    send = jest.spyOn(S3Client.prototype, 'send').mockImplementation(jest.fn());
  });
  afterEach(() => jest.restoreAllMocks());
  const storage = () =>
    new ObjectStorageService(
      new ConfigService({
        STORAGE_DRIVER: 's3',
        S3_BUCKET: 'private-test',
        S3_PREFIX: 'isolated-test',
      }),
    );
  it('uploads only to the private prefix with encryption and no public ACL', async () => {
    send.mockResolvedValue({});
    await storage().put(key, Buffer.from('test'), 'text/plain');
    const calls = send.mock.calls as unknown as Array<[PutObjectCommand]>;
    const command = calls[0][0];
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toMatchObject({
      Bucket: 'private-test',
      Key: `isolated-test/${key}`,
      ServerSideEncryption: 'AES256',
    });
    expect(command.input.ACL).toBeUndefined();
  });
  it.each(['../file', '/etc/passwd', '..', 'nested/key', ''])(
    'rejects traversal key %s before any network request',
    async (invalid) => {
      await expect(storage().put(invalid, Buffer.from('test'))).rejects.toThrow(
        'Invalid storage key',
      );
      expect(send).not.toHaveBeenCalled();
    },
  );
  it('distinguishes missing content from authorization/network failure', async () => {
    send.mockRejectedValue({ $metadata: { httpStatusCode: 404 } });
    await expect(storage().exists(key)).resolves.toBe(false);
    send.mockRejectedValue({ $metadata: { httpStatusCode: 403 } });
    await expect(storage().exists(key)).rejects.toBeDefined();
  });
  it('roundtrips probe content and deletes the probe object', async () => {
    send.mockImplementation((command: unknown) => {
      if (command instanceof GetObjectCommand)
        return Promise.resolve({
          ContentLength: 5,
          Body: {
            transformToByteArray: () => Promise.resolve(Buffer.from('ready')),
          },
        });
      return Promise.resolve({});
    });
    await storage().probe();
    const calls = send.mock.calls as unknown as Array<[object]>;
    expect(calls.map(([command]) => command.constructor)).toEqual([
      PutObjectCommand,
      GetObjectCommand,
      HeadObjectCommand,
      DeleteObjectCommand,
    ]);
  });
});
