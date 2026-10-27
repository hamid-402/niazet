import {
  matchesPublishedVersion,
  type PublicationFile,
  type PublicationProof,
} from './output-publication';
const at = new Date('2026-10-27T09:00:00.000Z');
const file: PublicationFile = {
  id: 'file-1',
  orderId: 'order-1',
  fileKind: 'output',
  checksum: 'a'.repeat(64),
  storageKey: 'key-1',
  sizeBytes: 12,
  scanStatus: 'clean',
  purgedAt: null,
};
const proof: PublicationProof = {
  id: 'publication-1',
  fileId: file.id,
  orderId: file.orderId,
  checksum: file.checksum!,
  storageKey: file.storageKey,
  sizeBytes: file.sizeBytes,
  basis: 'qc_passed',
  releasedAt: at,
  reviewerUserId: 'reviewer',
  qcReviewId: 'review-1',
  reason: null,
  checklistSnapshot: null,
  qcReview: { result: 'passed', reviewerUserId: 'reviewer', reviewedAt: at },
};
describe('exact output publication, never order-wide QC inference', () => {
  it('allows the exact approved version', () =>
    expect(matchesPublishedVersion(file, proof)).toBe(true));
  it.each(['pending_qc', 'invented'])('does not release %s', (basis) =>
    expect(matchesPublishedVersion(file, { ...proof, basis })).toBe(false),
  );
  it.each(['fileId', 'orderId', 'storageKey', 'checksum'])(
    'rejects mismatched %s',
    (key) =>
      expect(matchesPublishedVersion(file, { ...proof, [key]: 'other' })).toBe(
        false,
      ),
  );
  it('rejects changed size', () =>
    expect(matchesPublishedVersion(file, { ...proof, sizeBytes: 13 })).toBe(
      false,
    ));
  it('rejects missing release', () =>
    expect(matchesPublishedVersion(file, { ...proof, releasedAt: null })).toBe(
      false,
    ));
  it('requires the specific passed review and reviewer', () => {
    expect(matchesPublishedVersion(file, { ...proof, qcReview: null })).toBe(
      false,
    );
    expect(
      matchesPublishedVersion(file, {
        ...proof,
        qcReview: { ...proof.qcReview!, result: 'needs_rework' },
      }),
    ).toBe(false);
    expect(
      matchesPublishedVersion(file, {
        ...proof,
        qcReview: { ...proof.qcReview!, reviewerUserId: 'other' },
      }),
    ).toBe(false);
    expect(
      matchesPublishedVersion(file, {
        ...proof,
        qcReview: {
          ...proof.qcReview!,
          reviewedAt: new Date(at.getTime() + 1),
        },
      }),
    ).toBe(false);
  });
  it('rejects quarantined/purged/misclassified files', () => {
    expect(
      matchesPublishedVersion({ ...file, scanStatus: 'pending' }, proof),
    ).toBe(false);
    expect(matchesPublishedVersion({ ...file, purgedAt: at }, proof)).toBe(
      false,
    );
    expect(matchesPublishedVersion({ ...file, fileKind: 'input' }, proof)).toBe(
      false,
    );
  });
  it('permits immutable historical approved bytes during later rework, not a different new file', () => {
    expect(matchesPublishedVersion(file, proof)).toBe(true);
    expect(matchesPublishedVersion({ ...file, id: 'new-file' }, proof)).toBe(
      false,
    );
  });
  it('missing checklist or an invented waiver never substitutes for human QC', () => {
    const exempt = {
      ...proof,
      basis: 'policy_exempt',
      qcReviewId: null,
      reviewerUserId: null,
      checklistSnapshot: { version: 1, qcRequired: false },
    };
    expect(matchesPublishedVersion(file, exempt)).toBe(false);
    expect(
      matchesPublishedVersion(file, {
        ...exempt,
        checklistSnapshot: { version: 1, qcRequired: true },
      }),
    ).toBe(false);
    expect(
      matchesPublishedVersion(file, { ...exempt, checklistSnapshot: null }),
    ).toBe(false);
  });
  it('requires genuine human reason and all successful checklist items for manual legacy publication', () => {
    const manual = {
      ...proof,
      basis: 'manual_qc',
      qcReviewId: null,
      reason: 'بازبینی واقعی نسخه',
      checklistSnapshot: { version: 1, items: [{ passed: true }] },
    };
    expect(matchesPublishedVersion(file, manual)).toBe(true);
    expect(matchesPublishedVersion(file, { ...manual, reason: '  ' })).toBe(
      false,
    );
    expect(
      matchesPublishedVersion(file, { ...manual, reviewerUserId: null }),
    ).toBe(false);
    expect(
      matchesPublishedVersion(file, {
        ...manual,
        checklistSnapshot: { version: 1, items: [{ passed: false }] },
      }),
    ).toBe(false);
  });
  it('legacy null checksum is not an approval; a specific human proof and verified download bytes are still required', () => {
    expect(
      matchesPublishedVersion(
        { ...file, checksum: null },
        { ...proof, releasedAt: null },
      ),
    ).toBe(false);
    expect(matchesPublishedVersion({ ...file, checksum: null }, proof)).toBe(
      true,
    );
  });
});
