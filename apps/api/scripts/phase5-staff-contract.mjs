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
assert(ops && finance, 'Required demo accounts are missing.');

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
const detail = await json(
  await fetch(`${API_ORIGIN}/v1/admin/staff/${target.id}`, { headers }),
);
assert(Array.isArray(detail.user.capabilities), 'Access capabilities are missing.');
assert(Array.isArray(detail.attendanceRecords), 'Attendance records are missing.');
assert(Array.isArray(detail.capacitySnapshots), 'Capacity history is missing.');

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

const detailPage = await readFile(
  '../web/src/app/(admin)/admin/staff/[id]/page.tsx',
  'utf8',
);
assert(detailPage.includes('ConfirmationModal'), 'Sensitive staff actions must use the standard confirmation modal.');
assert(detailPage.includes('/attendance') && detailPage.includes('/access'), 'Staff attendance/access UI contracts are missing.');

console.log('Phase 5 staff contract passed: team, skill, verification, attendance, capacity, access, required-note and scope isolation.');
