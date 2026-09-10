import {
  createRefreshToken,
  parseRefreshToken,
  refreshTokenMatches,
} from './refresh-token';

describe('opaque refresh token', () => {
  it('round-trips its session id and verifies only the original token', () => {
    const generated = createRefreshToken();

    expect(parseRefreshToken(generated.token)).toEqual({
      sessionId: generated.sessionId,
    });
    expect(refreshTokenMatches(generated.token, generated.tokenHash)).toBe(
      true,
    );
    expect(
      refreshTokenMatches(`${generated.token}x`, generated.tokenHash),
    ).toBe(false);
  });

  it('rejects malformed values', () => {
    expect(parseRefreshToken('')).toBeNull();
    expect(parseRefreshToken('not-a-token')).toBeNull();
    expect(parseRefreshToken('rt_bad.secret')).toBeNull();
  });
});
