// Owner approval: 2026-09-07. This is an exact package/version/license approval,
// not a global addition of MIT-0 to the project's allowed licenses.
export function hasReviewedLicense(identity, license) {
  return ['nodemailer@10.0.0', 'nodemailer@10.2.1'].includes(identity) && license === 'MIT-0';
}
