import { readFile } from 'node:fs/promises';

const API_ORIGIN = process.env.API_ORIGIN ?? 'http://localhost:3001';
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://localhost:3002';
function assert(condition, message) { if (!condition) throw new Error(message); }
async function json(response) {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

const demo = await json(await fetch(`${WEB_ORIGIN}/api/development/demo-accounts`));
const account = demo.accounts.find((item) => item.phone === '09120000001');
assert(account, 'Super Admin demo account is missing.');
const login = await json(await fetch(`${API_ORIGIN}/v1/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ phone: account.phone, password: account.password }),
}));
const headers = { authorization: `Bearer ${login.accessToken}`, 'content-type': 'application/json' };
const users = await json(await fetch(`${API_ORIGIN}/v1/admin/users`, { headers }));
const targetUser = users.find((item) => item.id !== login.user.id);
assert(targetUser, 'A target user is required for the confirmation contract.');
const missingUserNote = await fetch(`${API_ORIGIN}/v1/admin/users/${targetUser.id}/status`, {
  method: 'PATCH', headers, body: JSON.stringify({ status: targetUser.status }),
});
assert(missingUserNote.status === 400, `User status without note must fail; received ${missingUserNote.status}.`);

const admins = await json(await fetch(`${API_ORIGIN}/v1/admin/admins`, { headers }));
const targetAdmin = admins.find((item) => item.id !== login.user.id);
assert(targetAdmin, 'A target admin is required for the confirmation contract.');
const missingScopeNote = await fetch(`${API_ORIGIN}/v1/admin/admins/${targetAdmin.id}/scope`, {
  method: 'PATCH', headers, body: JSON.stringify({ adminScope: targetAdmin.adminScope }),
});
assert(missingScopeNote.status === 400, `Scope change without note must fail; received ${missingScopeNote.status}.`);

const [modal, escrowPage, usersPage, adminsPage] = await Promise.all([
  readFile('../web/src/components/confirmation-modal.tsx', 'utf8'),
  readFile('../web/src/app/(admin)/admin/finance/escrow/page.tsx', 'utf8'),
  readFile('../web/src/app/(admin)/admin/users/page.tsx', 'utf8'),
  readFile('../web/src/app/(admin)/admin/admins/page.tsx', 'utf8'),
]);
assert(modal.includes('role="alertdialog"') && modal.includes('aria-modal="true"'), 'Accessible dialog semantics are missing.');
assert(modal.includes("event.key === 'Escape'") && modal.includes("event.key !== 'Tab'"), 'Keyboard handling is incomplete.');
assert(modal.includes('submitLockRef.current'), 'Duplicate-submit lock is missing.');
assert(modal.includes('restoreFocusRef.current?.focus()'), 'Focus restoration is missing.');
assert([escrowPage, usersPage, adminsPage].every((source) => source.includes('ConfirmationModal')), 'A critical action is not using the standard modal.');

console.log('Phase 4 confirmation contract passed: required notes, impact summary, keyboard/focus behavior, duplicate-submit lock, and critical-action adoption.');
