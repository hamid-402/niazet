import { createServer, type Server } from 'node:net';
import { scanBufferWithClamAv } from './antivirus.service';

describe('ClamAV INSTREAM client', () => {
  let server: Server;

  afterEach(async () => {
    if (server)
      await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function listenWithResponse(response: string) {
    let request = Buffer.alloc(0);
    server = createServer((socket) => {
      socket.on('data', (chunk: Buffer) => {
        request = Buffer.concat([request, chunk]);
      });
      socket.on('end', () => socket.end(response));
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('No test port');
    return { port: address.port, request: () => request };
  }

  it('streams a file and accepts a clean response', async () => {
    const testServer = await listenWithResponse('stream: OK\0');
    await expect(
      scanBufferWithClamAv({
        buffer: Buffer.from('safe file'),
        host: '127.0.0.1',
        port: testServer.port,
        timeoutMs: 2_000,
      }),
    ).resolves.toEqual({ status: 'clean' });
    expect(testServer.request().subarray(0, 10).toString('ascii')).toBe(
      'zINSTREAM\0',
    );
    expect(testServer.request().includes(Buffer.from('safe file'))).toBe(true);
  });

  it('returns the malware signature', async () => {
    const testServer = await listenWithResponse(
      'stream: Eicar-Signature FOUND\0',
    );
    await expect(
      scanBufferWithClamAv({
        buffer: Buffer.from('unsafe file'),
        host: '127.0.0.1',
        port: testServer.port,
        timeoutMs: 2_000,
      }),
    ).resolves.toEqual({
      status: 'infected',
      signature: 'Eicar-Signature',
    });
  });

  it('rejects an unknown scanner response', async () => {
    const testServer = await listenWithResponse('stream: UNKNOWN ERROR\0');
    await expect(
      scanBufferWithClamAv({
        buffer: Buffer.from('file'),
        host: '127.0.0.1',
        port: testServer.port,
        timeoutMs: 2_000,
      }),
    ).rejects.toThrow('Unexpected ClamAV response');
  });
});
