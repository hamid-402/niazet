import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { controllerRoutes } from './zeus-z0-traceability.mjs';
import { prismaModels } from './zeus-z0-domain-contracts.mjs';
const root = new URL('../../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8').replaceAll('\r\n', '\n');
const hash = value => createHash('sha256').update(value).digest('hex');
const json = p => JSON.parse(read(p));
const ts = createRequire(new URL('../../apps/api/package.json', import.meta.url))('typescript');
const walk = folder => readdirSync(new URL(folder, root), { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(folder + '/' + e.name) : [folder + '/' + e.name]);

export function buildZ1Contracts() {
  const inventory = json('docs/zeus/z0-inventory.json'), mappings = json('docs/zeus/z0-mappings.json');
  const files = walk('apps/api/src');
  const routes = files.filter(p => p.endsWith('.controller.ts')).flatMap(p => controllerRoutes(read(p), p));
  const dtoContracts = files.filter(p => p.endsWith('.ts') && !p.endsWith('.spec.ts')).flatMap(file => {
    const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    return source.statements.filter(node => ts.isClassDeclaration(node) && node.name?.text.endsWith('Dto')).map(node => ({
      name: node.name.text, file, sourceHash: hash(read(file)),
      inheritance: node.heritageClauses?.map(c => c.getText(source)) ?? [],
      fields: node.members.filter(member => ts.isPropertyDeclaration(member)).map(member => ({
        name: member.name.getText(source), type: member.type?.getText(source) ?? 'inferred',
        validators: ts.canHaveDecorators(member) ? (ts.getDecorators(member) ?? []).map(d => d.getText(source)) : [],
      })),
    }));
  });
  assert.equal(new Set(routes.map(r => r.method + ' ' + r.path)).size, routes.length, 'Route collision');
  const overrides = {
    API12: ['POST /v1/customer/orders/:orderId/review'], API25: ['GET /v1/admin/stats'], API26: ['GET /v1/admin/staff-report'],
    API27: ['POST /v1/ai/suggest-price'], API28: ['POST /v1/ai/triage'], API29: ['POST /v1/ai/support-reply'],
    'ZEUS-API4-007': ['GET /v1/customer/dashboard'], 'ZEUS-API4-034': ['GET /v1/admin/staff/:id/performance'],
  };
  const metadata = (r, name) => {
    const choose = ds => ds.filter(d => new RegExp('^@' + name + '\\(').test(d));
    return choose(r.methodDecorators).length ? choose(r.methodDecorators) : choose(r.classDecorators);
  };
  const api = mappings.api.map((m, index) => {
    const source = index < 29 ? inventory.d1Apis[index] : inventory.v4Apis[index - 29];
    const targets = (overrides[m.id] ?? m.targets).map(signature => {
      const r = routes.find(r => r.method + ' ' + r.path === signature);
      assert(r, 'Missing Z1 API binding: ' + m.id + ' ' + signature);
      const roles = metadata(r, 'Roles').flatMap(s => [...s.matchAll(/(?:UserRole\.|['"])(customer|executor|support|admin)/g)].map(m => m[1]));
      const scopes = metadata(r, 'AdminScopes').flatMap(s => [...s.matchAll(/(?:AdminScope\.|['"])(ops_admin|finance_admin|super_admin)/g)].map(m => m[1]));
      return { signature, ...r, roles, scopes, public: metadata(r, 'Public').length > 0, sourceHash: hash(read(r.file)) };
    });
    return { id: m.id, source, targets, binding: overrides[m.id] ? 'implemented-additive-contract' : m.mappingKind, deferredProvider: /^API2[789]$/.test(m.id), behaviorAcceptance: 'separate HTTP report, not AST inference' };
  });
  assert.equal(api.length, 84);
  const models = prismaModels(read('apps/api/prisma/schema.prisma'));
  const fields = new Map(models.flatMap(m => m.fields.map(f => [f.ref, { ...f, table: m.table, modelAttributes: m.attributes }])));
  const replacements = {
    'users.last_login': ['UserLoginState.lastSuccessfulLoginAt'], 'users.is_verified': ['UserLoginState.phoneVerifiedAt'],
    'services.same_day_surcharge': ['ServiceContractPolicy.sameDayRateBps'], 'services.urgent_surcharge': ['ServiceContractPolicy.urgentRateBps'], 'services.sort_order': ['ServiceContractPolicy.sortOrder'],
    'orders.base_price': ['OrderContractSnapshot.basePrice'], 'orders.surcharge_pct': ['OrderContractSnapshot.surchargeRateBps'],
    'orders.deadline': ['OrderContractSnapshot.deadlineNormal'], 'orders.same_day_deadline': ['OrderContractSnapshot.deadlineEffective'], 'orders.notes': ['OrderContractSnapshot.internalNote'],
    'tickets.sla_hours': ['TicketSlaPolicySnapshot.firstResponseBusinessMinutes'], 'tickets.customer_rating': ['Ticket.customerRating'],
    'reviews.id': ['PublicServiceReview.id'], 'reviews.order_id': ['PublicServiceReview.orderId'], 'reviews.customer_id': ['PublicServiceReview.customerId'],
    'reviews.rating': ['PublicServiceReview.rating'], 'reviews.comment': ['PublicServiceReview.comment', 'PublicServiceReview.publicComment'],
    'reviews.is_public': ['PublicServiceReview.publicConsent', 'PublicServiceReview.moderationStatus', 'PublicServiceReview.publishedAt'],
  };
  const semantic = key => key.startsWith('reviews.') ? 'DEC03: consent + human moderation; executor identity remains private in assignment/Feedback, not public review' : key === 'users.is_verified' ? 'phone proof timestamp only; unknown historic value remains null, not inferred from active status' : key === 'tickets.sla_hours' ? '240 business minutes = four business hours; versioned calendar only for newly created tickets' : key.includes('surcharge') ? 'basis points: percentage = bps/100; snapshot rate remains null when not actually applied' : key.startsWith('orders.') ? '20-state workflow/IRT/immutable accepted quote; unknown historical base/date/rate not fabricated; Z2 owns deadline/rate application' : 'explicit normalized representation; literal SQL type/names may differ under DEC01/07/09/11/15';
  const sourceSql = json('docs/zeus/z0-domain-review.json').facts.sourceSql;
  const data = sourceSql.flatMap(group => group.tables.flatMap(t => t.columns.map(column => {
    const key = t.table + '.' + column.name;
    const mapping = mappings.sql.find(m => m.table === t.table && m.column === column.name);
    const ledgerAlias = t.table === 'ledger_entries' && column.name === 'created_by' ? 'createdByUserId' : column.name.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    const refs = replacements[key] ?? mapping?.targets ?? [(t.table === 'ledger_accounts' ? 'LedgerAccount.' : 'LedgerEntry.') + ledgerAlias];
    assert(refs.length, 'Unbound data field: ' + key);
    const targets = refs.map(ref => { const f = fields.get(ref); assert(f, 'Missing Prisma field: ' + ref); return f; });
    return { source: t.source, table: t.table, column, targets, semantic: semantic(key), equivalence: 'reviewed-functional-mapping-not-literal-SQL-equivalence' };
  })));
  assert.equal(data.length, 120);
  return { schemaVersion: 1, date: '2026-10-26', scope: 'Z1 data and API bindings; not later-phase feature or live-provider acceptance', baseline: '2c701d7', sourceHashes: inventory.sources, api, data,
    allCurrentRoutes: routes, dtoContracts, models: models.map(m => ({ name: m.name, table: m.table, attributes: m.attributes })),
    unknownHistoryPolicy: 'No backfill from current tariff, active status, feedback or guessed deadline',
    phaseAcceptanceRequires: ['current source hashes and fixed guard', '25-migration isolated upgrade + old client compatibility', 'real JWT/HTTP role and DTO/ownership matrix', 'all related API/Web acceptance and local safe activation'],
    deferredFeatureOwners: { rateAndDeadlineApplication: 'Z2', sameDayCapacity: 'Z2', publicReviewFrontend: 'Z5', aiRuntime: 'Z7, owner-deferred live provider' },
  };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(JSON.stringify(buildZ1Contracts(), null, 2));
