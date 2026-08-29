import { readFile } from 'node:fs/promises';

const API_ORIGIN = process.env.API_ORIGIN ?? 'http://localhost:3001';
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://localhost:3002';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function json(response) {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function login(account) {
  return json(
    await fetch(`${API_ORIGIN}/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: account.phone, password: account.password }),
    }),
  );
}

const demo = await json(
  await fetch(`${WEB_ORIGIN}/api/development/demo-accounts`),
);
const ops = demo.accounts.find((account) => account.phone === '09120000002');
const finance = demo.accounts.find(
  (account) => account.phone === '09120000003',
);
const superAdmin = demo.accounts.find(
  (account) => account.phone === '09120000001',
);
assert(ops && finance && superAdmin, 'Required demo accounts are missing.');

const opsLogin = await login(ops);
const headers = {
  authorization: `Bearer ${opsLogin.accessToken}`,
  'content-type': 'application/json',
};
const [staff, teams, skills] = await Promise.all([
  json(await fetch(`${API_ORIGIN}/v1/admin/staff`, { headers })),
  json(await fetch(`${API_ORIGIN}/v1/admin/teams`, { headers })),
  json(await fetch(`${API_ORIGIN}/v1/admin/skills`, { headers })),
]);
assert(Array.isArray(staff) && staff.length > 0, 'Staff list is empty.');
assert(Array.isArray(teams) && teams.length > 0, 'Team catalog is empty.');
assert(Array.isArray(skills) && skills.length > 0, 'Skill catalog is empty.');
assert(
  staff.every(
    (item) =>
      item.verificationStatus && Array.isArray(item.skills) && item.user,
  ),
  'Staff list does not expose verification, skill and safe user metadata.',
);

const target = staff[0];
const performance = await json(
  await fetch(
    `${API_ORIGIN}/v1/admin/staff/${target.id}/performance/recalculate`,
    { method: 'POST', headers },
  ),
);
assert(
  performance.executorProfileId === target.id &&
    Number(performance.riskScore) >= 0 &&
    Number(performance.riskScore) <= 100,
  'Manual performance calculation is malformed.',
);
const detail = await json(
  await fetch(`${API_ORIGIN}/v1/admin/staff/${target.id}`, { headers }),
);
assert(Array.isArray(detail.user.capabilities), 'Access capabilities are missing.');
assert(Array.isArray(detail.attendanceRecords), 'Attendance records are missing.');
assert(Array.isArray(detail.capacitySnapshots), 'Capacity history is missing.');
assert(Array.isArray(detail.performanceSnapshots), 'Performance history is missing.');
assert(
  detail.performanceSnapshots.some((item) => item.id === performance.id),
  'Daily performance snapshot was not persisted.',
);
assert(Array.isArray(detail.feedback), 'Executor feedback history is missing.');
assert(Array.isArray(detail.history), 'Staff audit history is missing.');
assert(
  detail.history.every((item) => item.action && item.createdAt),
  'Staff history entries are malformed.',
);

const attendance = await json(
  await fetch(`${API_ORIGIN}/v1/admin/staff/${target.id}/attendance`, {
    headers,
  }),
);
assert(Array.isArray(attendance), 'Attendance endpoint is malformed.');

for (const [path, body, label] of [
  [`/v1/admin/staff/${target.id}/capacity`, { capacityPercent: 30 }, 'capacity'],
  [`/v1/admin/staff/${target.id}/status`, { status: target.status }, 'status'],
  [`/v1/admin/staff/${target.id}/access`, { userStatus: 'active', customerCapability: false }, 'access'],
]) {
  const response = await fetch(`${API_ORIGIN}${path}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  });
  assert(response.status === 400, `${label} mutation without note must fail.`);
}

const financeLogin = await login(finance);
const forbidden = await fetch(`${API_ORIGIN}/v1/admin/staff`, {
  headers: { authorization: `Bearer ${financeLogin.accessToken}` },
});
assert(forbidden.status === 403, 'Finance scope must not access staff management.');

const superLogin = await login(superAdmin);
const superHeaders = {
  authorization: `Bearer ${superLogin.accessToken}`,
  'content-type': 'application/json',
};
const jobs = await json(
  await fetch(`${API_ORIGIN}/v1/admin/jobs`, { headers: superHeaders }),
);
const performanceJob = jobs.find(
  (item) => item.name === 'recalculate_staff_performance',
);
assert(
  performanceJob?.intervalMs === 24 * 60 * 60 * 1000,
  'Daily staff performance job is not registered.',
);
const jobResult = await json(
  await fetch(
    `${API_ORIGIN}/v1/admin/jobs/recalculate_staff_performance/run`,
    { method: 'POST', headers: superHeaders },
  ),
);
assert(
  Number.isInteger(jobResult.processed) && Number.isInteger(jobResult.skipped ?? 0),
  'Performance job result is malformed.',
);
const opsJobForbidden = await fetch(`${API_ORIGIN}/v1/admin/jobs`, { headers });
assert(opsJobForbidden.status === 403, 'Ops scope must not run global jobs.');

const detailPage = await readFile(
  '../web/src/app/(admin)/admin/staff/[id]/page.tsx',
  'utf8',
);
assert(detailPage.includes('ConfirmationModal'), 'Sensitive staff actions must use the standard confirmation modal.');
assert(detailPage.includes('/attendance') && detailPage.includes('/access'), 'Staff attendance/access UI contracts are missing.');
assert(
  detailPage.includes('role="tablist"') &&
    detailPage.includes("activeTab === 'performance'") &&
    detailPage.includes("activeTab === 'feedback'") &&
    detailPage.includes("activeTab === 'history'"),
  'Tabbed staff performance, feedback and history UI contracts are missing.',
);
assert(
  detailPage.includes('/performance/recalculate') &&
    detailPage.includes('محاسبه اکنون'),
  'Manual performance recalculation UI contract is missing.',
);

console.log('Phase 5 staff contract passed: team, skill, verification, attendance, capacity, access, profile tabs, feedback/history, daily performance snapshots/job, required-note and scope isolation.');
