import assert from 'node:assert/strict';
import test from 'node:test';
import { hasReviewedLicense } from './dependency-license-policy.mjs';

test('accepts only the owner-approved Nodemailer release and license', () => {
  assert.equal(hasReviewedLicense('nodemailer@10.0.0', 'MIT-0'), true);
});
for (const [identity, license] of [
  ['nodemailer@10.0.1', 'MIT-0'],
  ['nodemailer@11.0.0', 'MIT-0'],
  ['another-package@10.0.0', 'MIT-0'],
  ['nodemailer@10.0.0', 'GPL-3.0-only'],
  ['nodemailer@10.0.0', undefined],
]) {
  test(`does not extend approval to ${identity} with ${license}`, () => {
    assert.equal(hasReviewedLicense(identity, license), false);
  });
}
