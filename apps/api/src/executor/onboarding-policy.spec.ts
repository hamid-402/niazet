import { nextOnboardingStage, ONBOARDING_STEPS } from './onboarding-policy';
describe('external onboarding policy', () => {
  it('advances every stage exactly once without skipping checks', () => {
    ONBOARDING_STEPS.slice(0, -1).forEach((stage, index) => {
      expect(nextOnboardingStage(stage, 'approve_step', 'DOC-123')).toBe(
        ONBOARDING_STEPS[index + 1],
      );
    });
  });
  it.each(ONBOARDING_STEPS.slice(1, -1))(
    'requires reviewed evidence at %s',
    (stage) => {
      expect(() => nextOnboardingStage(stage, 'approve_step', '   ')).toThrow();
    },
  );
  it('requires reopening rejection and rejects advancing completed dossiers', () => {
    expect(nextOnboardingStage('approved', 'reject')).toBe('rejected');
    expect(nextOnboardingStage('rejected', 'reopen')).toBe('registered');
    expect(() =>
      nextOnboardingStage('rejected', 'approve_step', 'DOC-123'),
    ).toThrow();
    expect(() =>
      nextOnboardingStage('approved', 'approve_step', 'DOC-123'),
    ).toThrow();
    expect(() => nextOnboardingStage('nda', 'reopen')).toThrow();
  });
});
