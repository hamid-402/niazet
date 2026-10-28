import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import {
  assertVerifiedEmailProof,
  emailFamilyAllowed,
  requireVerifiedEmail,
  verifiedEmailEnabled,
  VerifiedEmailSessionProof,
} from './verified-email-session';

describe('verified email session proof', () => {
  const proof: VerifiedEmailSessionProof = {
    identityId: 'identity',
    userId: 'owner',
    emailNormalized: 'owner@example.com',
    revision: 1,
    credentialHash: 'actually-verified-hash',
  };
  function fixture() {
    const owner = {
      email: 'Owner@Example.com',
      passwordHash: proof.credentialHash,
      status: 'active',
    };
    const identity = {
      id: proof.identityId,
      userId: 'owner',
      emailNormalized: proof.emailNormalized,
      revision: 1,
    };
    const query = jest.fn().mockResolvedValue([{ id: 'owner' }]);
    const findUser = jest.fn().mockResolvedValue(owner),
      findIdentity = jest.fn().mockResolvedValue(identity);
    const tx = {
      $queryRaw: query,
      user: { findUnique: findUser },
      emailLoginIdentity: { findUnique: findIdentity },
    } as unknown as Prisma.TransactionClient;
    return {
      owner,
      identity,
      query,
      findUser,
      findIdentity,
      run: (value = proof) => assertVerifiedEmailProof(tx, 'owner', value),
    };
  }
  it('requires explicit schema activation and never guesses truthy configuration', () => {
    for (const value of [undefined, false, 'false', 'TRUE', 'yes', 1])
      expect(
        verifiedEmailEnabled(
          new ConfigService({ ZEUS_VERIFIED_EMAIL_ENABLED: value }),
        ),
      ).toBe(false);
    for (const value of [true, 'true'])
      expect(
        verifiedEmailEnabled(
          new ConfigService({ ZEUS_VERIFIED_EMAIL_ENABLED: value }),
        ),
      ).toBe(true);
    expect(() =>
      requireVerifiedEmail(
        new ConfigService({ ZEUS_VERIFIED_EMAIL_ENABLED: false }),
      ),
    ).toThrow();
  });
  it('locks the owner and binds the current email, identity version and verified password hash', async () => {
    const f = fixture();
    await expect(f.run()).resolves.toEqual(f.identity);
    expect(f.query).toHaveBeenCalledTimes(1);
    expect(f.findUser).toHaveBeenCalledWith({
      where: { id: 'owner' },
      select: { email: true, passwordHash: true, status: true },
    });
  });
  it.each(['blocked', 'suspended', 'pending_verification'])(
    'rejects a freshly changed account status: %s',
    async (status) => {
      const f = fixture();
      f.owner.status = status;
      await expect(f.run()).rejects.toThrow();
    },
  );
  it('rejects password reset between password verification and session issue', async () => {
    const f = fixture();
    f.owner.passwordHash = 'new-hash-after-reset';
    await expect(f.run()).rejects.toThrow();
  });
  it('rejects missing, foreign, renamed or version-changed bindings', async () => {
    for (const change of [
      { userId: 'other' },
      { emailNormalized: 'other@example.com' },
      { revision: 2 },
    ]) {
      const f = fixture();
      Object.assign(f.identity, change);
      await expect(f.run()).rejects.toThrow();
    }
    const missing = fixture();
    missing.findIdentity.mockResolvedValue(null);
    await expect(missing.run()).rejects.toThrow();
  });
  it('rejects a changed profile email and never treats the old binding as current', async () => {
    const f = fixture();
    f.owner.email = 'different@example.com';
    await expect(f.run()).rejects.toThrow();
  });
  it('rejects malformed/internal forged proof before querying the database', async () => {
    for (const value of [
      null,
      { ...proof, userId: 'other' },
      { ...proof, revision: 0 },
      { ...proof, revision: NaN },
      { ...proof, emailNormalized: 'Owner@Example.com' },
      { ...proof, credentialHash: '' },
    ]) {
      const f = fixture();
      await expect(f.run(value as VerifiedEmailSessionProof)).rejects.toThrow();
      expect(f.findIdentity).not.toHaveBeenCalled();
    }
  });
});

describe('email family revocation survives rotation', () => {
  const session = {
    familyId: 'family',
    userId: 'owner',
    user: { email: 'owner@example.com' },
  };
  const active = {
    userId: 'owner',
    emailNormalized: 'owner@example.com',
    revokedAt: null,
    identityId: 'identity',
    identityUserId: 'owner',
    identityEmail: 'owner@example.com',
    boundRevision: 1,
    currentRevision: 1,
  };
  const run = (rows: unknown[], email = session.user.email) =>
    emailFamilyAllowed(
      { $queryRaw: jest.fn().mockResolvedValue(rows) },
      { ...session, user: { email } },
    );
  it('preserves original mobile/password/OTP families with no email tag', async () => {
    await expect(run([])).resolves.toBe(true);
  });
  it('allows only an active exact version with the same profile address', async () => {
    await expect(run([active])).resolves.toBe(true);
  });
  it.each([
    { revokedAt: new Date() },
    { identityId: null },
    { userId: 'other' },
    { identityUserId: 'other' },
    { identityEmail: 'other@example.com' },
    { currentRevision: 2 },
  ])(
    'rejects a revoked, missing, foreign or stale proof: %p',
    async (change) => {
      await expect(run([{ ...active, ...change }])).resolves.toBe(false);
    },
  );
  it('also rejects a changed profile address when a marker has not yet been written', async () => {
    await expect(run([active], 'other@example.com')).resolves.toBe(false);
  });
});
