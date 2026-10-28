// Planned acceptance scenarios, not executed tests or product completion.
// Explicit preservation cases complement the detailed gap criteria already in
// roadmap rows; a generic phase profile must never be their only test plan.
const preserved = {
  1: "Exercise all four primary roles on their real panel/API; reject guest/cross-role and show enum has no fifth operator role.",
  2: "Ops may manage catalog/QC but not refunds; Finance may use finance projection but not HR/settings; Super still obeys owner/state/QC prerequisites.",
  3: "Grant customer/executor capability only; prove customer+executor dual access, deny support/admin escalation through capability string.",
  4: "Use one real dual-capability account across canonical customer/executor navigation and HTTP; revoke capability and verify stale session cannot retain revoked privilege.",
  5: "Internal staff fulfills order from assignment to delivery; public UI says managed team, not public freelancer marketplace; no existing service/category lost.",
  6: "Unapproved external profile cannot receive assignment/file/income; complete evidence/reviewer/version stages to approval, deny self-review/skipped stage.",
  7: "Customer references public OPS/team/QC code linked to own order; current-ticket target uses current handler, historical feedback may reference an authorized visible prior participant. Forged/wrong-order code denied; no internal employee identity disclosed or legitimate history lost.",
  8: "Inspect customer payload, export, file metadata and UI: no internal employee full name/contact/HR/capacity/risk/payroll; admin retains authorized detail.",
  11: "Render landing and real active service/detail catalog with all eight categories, preserved SEO/links/CTA; mobile two themes, no giant hero image.",
  14: "Load dynamic required field/options from versioned service; edit/reload owned draft with files, survive offline/conflict/retry without lost fields or autosave false success.",
  17: "Open owned order and all history/tabs/next actions across representative states; hide AND reject invalid action; no other customer's or internal employee data in response.",
  18: "Customer finance totals derive from all own payments/holds/refunds/invoices/Ledger projection, not first page; invoice download preserves issued amount and currency.",
  19: "Update own profile/preferences, list and revoke own sessions; login/recovery/refresh/logout error branches work; never store verified email flag from unproved contact.",
  21: "Executor dashboard counts own active assignments/checklists/near deadlines/rework; large fixture beyond one page and unknown deadline produce honest totals/order.",
  23: "Assigned queue permits only active assignment for current executor, preserves pagination/filter/order and decline/accept target; foreign and unassigned order reject HTTP.",
  24: "Executor receives exact saved brief/inputs/acceptance criteria and approved version; internal-only/customer finance/other executor output not disclosed.",
  25: "Accept exactly once before start/checklist; wrong assignment/foreign criterion/unaccepted/terminal order denied, required items gate delivery and audit records actor.",
  27: "Progress report version/author/summary/progress/file and visibility saved to own assigned order; duplicate retry and same-version race do not create misleading extra progress.",
  28: "Deliver own clean output after complete checklist -> independent QC; rejected/rework branch returns safely with history and customer cannot download unpublished output.",
  30: "Executor can see own earned Ledger/withdrawal but not customer price/payment identifiers, other staff scores/contact/HR, or another executor's private artifact.",
  33: "Customer creates each supported ticket category on own optional order with clean attachment; enum/foreign order/handler/blank body denied and no phantom ticket from failed write.",
  34: "Ticket detail links permitted order/public handler and attachment; customer sees only public messages, support internal context scoped and own attachment download authorized.",
  35: "Two support users compete for unassigned ticket; exactly one claim. Self vs admin reassignment explicit; non-assignee public reply denied and actor audit truthful.",
  36: "Prepared public answer and internal note stay distinct through API/UI/export/notifications; internal note never counts first public response or reaches customer.",
  37: "Escalate with trimmed real reason, resolve then close with valid transition/history; closed/repeated/racing reply behavior explicit, no financial side effect.",
  38: "New ticket first meaningful public human reply4 business hours with versioned Sat-Thu09-18 Tehran/Fri-holidays; waiting customer does not pause; old deadlines unchanged.",
  43: "Human Ops triage/manual quote uses valid service/requirements and approved amount/version; reject stale, zero-invalid, wrong state/scope and no hidden assignment.",
  44: "Under row lock recheck executor type/onboarding/user/profile status/skills/capacity and order version immediately on assignment, not only stale suggestion card.",
  46: "Ops creates/edits actual team/staff/profile with transaction-bound actor Audit; failure cannot leave orphan active user/financial profile; external verification via onboarding only.",
  47: "Human capacity/attendance/access edits have bounded values, actual business date and trimmed consumed reason; revoke sessions on access loss and preserve other role/domain data.",
  48: "Recalculate rolling period from immutable assignment/QC/feedback facts with sample counts; zero samples unknown, repeat period one snapshot, no automatic under_review punishment.",
  53: "Parallel stale draft/quote/milestone edits fail version/CAS without losing accepted snapshots, new catalog changes do not alter historical price/specification/QC.",
  55: "QC reviewer cannot review own contribution including any multi-executor assignment; all current saved acceptance items and clean deliverable needed before approval.",
  57: "Customer delivered confirmation modal permits cancel/Escape/focus return and one pending request; successful confirm closes once and releases exactly authorized escrow.",
  59: "Resolve dispute using authorized human decision + real reason; actor/owner/system separate in history/Audit, partial funds/rework/release effects balanced and replay-safe.",
  61: "Verify stored gateway authority/amount/order currency from server, deny mismatched/late/failed/replayed callbacks; successful payment and order/hold/Ledger/history atomic.",
  62: "Same financial key/scope+payload returns prior result, changed amount/subject/reason conflicts; concurrent keys and P2034 retry never double credit or re-label failed work as success.",
  63: "Hold -> permitted release under confirmed QC/acceptance or explicit audited settlement basis; remaining and commission exact, no release during frozen unresolved dispute.",
  64: "Full/partial refund requires valid amount, trimmed consumed reason/note, deciding actor and Audit; credits own customer through Ledger once, partial remainder not auto released.",
  65: "Every positive journal entry has distinct valid debit/credit accounts and same amount; immutable history, explicit currency/reference/creator, no direct balance patch.",
  66: "Inject failure between journal/projections and prove isolated DB rollback of entry/wallet/transactions; concurrent debit respects spendable/reserves and no negative balance.",
  69: "Issued invoice unique per order with immutable amount/billing snapshot; authorized Persian RTL PDF byte/content/layout verified, other owner/role denied and download never reprices.",
  71: "Each of eight existing service lines/canonical links remains available with real category data; no static mock replacement or accidentally missing inactive historical reference.",
  72: "Ops edits permitted catalog fields and active status via typed command; Finance/customer denied; parent package/form/QC cannot attach cross-service and saved orders unchanged.",
  75: "Allowed size/MIME/extension plus byte signature, one UUID object; malformed/double-extension/path traversal/too-large content rejected before durable storage; scan unavailable fails closed.",
  77: "Signed download grant bound to file/user/type/audience/issuer/jti and expiry/revocation/one-use CAS; foreign/used/expired/unpublished file and revoked-authority target rejected.",
  78: "Versioned report preserves author/type/visibility and clean authorized file; customer sees allowed published version only, concurrent same version handled without duplicate artifact.",
  80: "Operations/finance/team/conversion/delivery reports share correct filter/period/denominator with reference query; scope/redaction/CSV-formula safety and actual PDF/XLSX accepted separately.",
  82: "Wrong/expired/reused refresh, revoked session, concurrent rotate, OTP attempt limit and rate excess reject; secure cookie and local-vs-distributed limiter limitation documented.",
  84: "Scan response/log/export/artifacts for secret/OTP/token/cookie/internal PII leakage; real owner credentials never printed; correlation identifiers and minimal redacted Audit preserved.",
  85: "Each user's in-app list/read/read-all/preferences affects only own rows; public vs private events and unread/link states correct; opt-out honored without enabling live channels.",
  89: "Payment-recheck/scan/expiry/cleanup/performance jobs use durable run identity/lease, per-item failure/retry and truthful metrics; no material file deletion outside validated owned eligible path.",
  90: "Independent Tehran02 reconciliation actually compares Ledger and cache, reports nonzero wallet with missing account as discrepancy, force freshness vs daily cache explicit; alerts never auto repair.",
  91: "Isolated migrated DB FK/default/null/unique/check/enum match schema review; source UUID/TEXT and consolidated models disclosed, additive changes preserve all old identifiers and history.",
  93: "Versioned external onboarding requires evidence, independent human stages/contract/NDA/trial/limited-access/approval; rejection/reopen with active assignment guard and no direct verification bypass.",
  95: "Org owner/manager/member scopes, invite consent/seats, team/order ownership/quota and subscription version locks survive concurrent tests; subscription activation not online payment proof.",
  96: "BI period/cohort/return and service/customer metrics use real authorized data and minimum samples; small cohort masked, unknown denominator not zero, no PII side-channel.",
  98: "Kill switch and enforced human approval cannot be bypassed through backend command or stale proposal; AI suggestion carries entity version/evidence, never autonomous money/access/dispute action.",
};
const addendum = {
  S01: "Assert all twenty order states present without replacement by simplified diagram statuses; final closed/cancelled deny ordinary outgoing transitions.",
  S02: "For every explicit D4 table edge exercise authorized source/actor and reject unlisted edge; financial effects/history/version atomic in isolated DB.",
  S04: "Every actual state change records from/to/time/reason/source/actor and financial context in same tx; no phantom history on denied/replayed command.",
  S06: "For disputed, deny generic cancel/assign/delivery/payment/release except explicit authorized resolution paths; stale client cannot exit frozen dispute via another handler.",
  S08: "Ops paid/assigned cancellation refunds100%, in_progress approved50% policy snapshot; prepayment customer cancel has no invented refund; remainder explicit Finance only.",
  S09: "Dispute rework/full-refund/partial-refund/release each has bounded justified money effect and history; close-without-disposition must not hide escrow, repeated decision conflicts/replays safely.",
  S10: "Independent QC reviewer differs from every active/contributing executor including multi-executor/milestone delivery; Super cannot bypass independence.",
  L01: "Five ledger account types/currency IRT and optional owner/system uniqueness validated; wrong-type/owner system account cannot be silently reused as user wallet.",
  L02: "Negative/zero/noninteger/overflow amount, same debit/credit and missing account rejected by DTO/domain AND database constraints; paired amount conserved.",
  L03: "Actual isolated DB UPDATE/DELETE LedgerEntry/WalletTransaction trigger fails; correction is appended, original hashes and wallet history remain unchanged.",
  L04: "Correction reverses exact original accounts/amount with real trimmed reason/actor, payload-bound replay and one authorized correction lineage; multiple keys cannot double-reverse.",
  L05: "Financial key is unique under correct owner/scope and fingerprint; same key new subject/amount/reason must conflict; replay does not accept existing unrelated journal.",
  L06: "Successful stored-authority payment produces one clearing->escrow journal + hold + order transition/history; mismatch/late failure cannot leave partial credits or false commitment.",
  L07: "Release splits integer executor+commission exactly to released gross, handles rounding/zero net bounds and multiple contributors, conditional escrow CAS and valid settlement basis.",
  L08: "Refund credits correct customer's ledger wallet once and preserves partial remainder, reason/Audit and original payment; no claim of external bank repayment from cache credit.",
  L09: "Inject failure during either debit/credit wallet projection/history; journal and both cache effects rollback atomically, concurrency cannot overdraw available reserved funds.",
  L10: "Nightly02 Tehran and explicit force semantics compare wallet/ledger, CRITICAL Finance/Super Audit/Outbox on discrepancies, no silent repair; duplicated alert/report period tracked.",
};
const ops = {
  1: "Measure homepage mobile CLS/LCP under the same three-sample protocol; actual content/fonts ready, no hidden layout shift or skeleton declared ready; keep Hero motion/reduced-motion.",
  2: "Trace login and each role shell/session/data/css critical path separately; maintain guards and correct HTML redirect, verify real usable page not login/skeleton, exact mobile budget.",
  3: "Record dated API/Web production+all audit graph, lock hashes/runtime/Node/SBOM/reachability; node counts not unique CVEs or exploited proof, no secret credentials in evidence.",
  4: "Minimal reviewed patch changes exact affected dependency/lock with integrity/license/parent compatibility; no audit-fix force, rerun relevant build/security/regression and isolated restore checks.",
  5: "Clean isolated install from locks into _runtime junction layout is reproducible and licensed; no deleting user data or copying project versions, verify Docker/runtime dependency set.",
  6: "Candidate-bound API/role/file/QC/full-order exception branches plus browser/accessibility/performance/PDF accepted with skips visible; main DB untouched, historic pass not fresh execution.",
  7: "CI run for exact committed candidate has all required jobs/permissions/artifacts and preservation history, no skipped critical gate falsely green; absent CI auth/run remains unaccepted.",
  8: "Two concurrent executor/team assignments have bounded private files/checklists/messages, shared QC independence and balanced milestone commission/refund shares under reassign/replay.",
  9: "Offline AI adapter proposals evaluated against labeled cases for every use, explicit rules-vs-model provenance/fallback/error/version; live engine/credentials/cost not auto activated.",
  10: "Kill switch/Human approval enforced in domain: prompt injection/stale/foreign/expired/duplicate approval cannot execute money/access/block/dispute command; actor and evidence Audit real.",
  11: "Separately approved gateway sandbox/recipient/budget: real amount/authority/callback/replay/timeout/late money reconciliation proven; configuration/mock success never live accepted.",
  12: "Separately approved SMS sender/template/recipient and real delivery/retry/failure evidence, OTP secrecy/rate/purpose; no credentials printed or live SMS during deferred phase.",
  13: "Separately approved SMTP/API domain/sender/recipient consent, secure transport, real PDF RTL attachment, unsubscribe/retry/dedup/failure; queued is not sent/delivered.",
  14: "Separately approved private object store: actual put/get/checksum/access/timeout/cleanup under unique contained keys, bucket policy no public read; main files preserved.",
  15: "Separately approved AV endpoint: safe and controlled malicious test, unavailable scanner fail-closed/quarantine/retry/cleanup and no clean download until actual accepted scan.",
};

export const plannedEndpoints = {
  API27: {
    path: "POST /v1/ai/suggest-price",
    files: ["apps/api/src/ai/price-suggestion.service.ts"],
    contract:
      "Authorized Ops proposal only from minimized allowlisted order/catalog/version; no direct quote mutation, mocked/offline adapter and kill switch; no live engine.",
  },
  API28: {
    path: "POST /v1/ai/triage",
    files: ["apps/api/src/ai/triage-proposal.service.ts"],
    contract:
      "Authorized Ops version-bound triage proposal and explicit human command; no automatic assignment/status; preserve current human triage endpoint.",
  },
  API29: {
    path: "POST /v1/ai/support-reply",
    files: ["apps/api/src/ai/support-draft.service.ts"],
    contract:
      "Assigned/authorized support receives private draft with limited ticket context; no send, first-response credit or external provider without human command/approval.",
  },
  "ZEUS-API4-007": {
    path: "GET /v1/customer/dashboard",
    files: ["apps/api/src/orders/customer-dashboard-query.service.ts"],
    contract:
      "Owned aggregate counts/actions across whole authorized dataset, all seven customer work areas, no first-page approximation or internal staff projection.",
  },
  "ZEUS-API4-034": {
    path: "GET /v1/admin/staff/:id/performance",
    files: ["apps/api/src/executor/staff-performance-query.service.ts"],
    contract:
      "Ops/Super scoped read with sample counts/period/provenance and explicit unknown metrics, not substitute POST recalculation or expose HR to customer.",
  },
};

export function preservedScenario(id) {
  const v4 = /^ZEUS-V4-(\d{3})$/.exec(id),
    addon = /^ZEUS-ADD-([SL]\d{2})$/.exec(id),
    operation = /^ZEUS-OPS-(\d{3})$/.exec(id);
  return v4
    ? preserved[Number(v4[1])]
    : addon
      ? addendum[addon[1]]
      : operation
        ? ops[Number(operation[1])]
        : null;
}
export function rowScenarios(rows) {
  return rows.flatMap((row) => {
    const cells = row.text.split("|").map((cell) => cell.trim());
    return cells.length >= 8 && cells[6] ? [cells[6]] : [];
  });
}
export const targetClarifications = {
  reportTargets:
    "Progress/QC/delivery/management/support remain order-scoped versioned reports with real author/visibility. Staff-performance aggregate uses explicit staff/team+period target and a separate approved report artifact; never fabricate an order id or relax existing OrderReport.orderId FK to fit it.",
  firstMeaningfulReply:
    "Versioned policy counts only an authorized human public answer/clarification purpose with validated nonblank explanatory body. Bot/internal note/acknowledgement-only templates excluded; purpose/actor/time/audit retained and semantic misuse reviewable. No customer-wait pause of first-response clock, resolution separately measured, no old-history inference.",
  settlementBasis:
    "Finance release requires immutable authorized settlement basis: customer acceptance/QC, explicit dispute decision, or explicit approved cancellation remainder settlement. State/QC/freeze gates apply to the matching basis; a cancelled order's partial remainder is never automatically released/refunded or justified by generic Finance scope alone.",
  messageSafety:
    "Explainable policy signals on contact/circumvention text, legitimate Persian numbers/domains/file content tested for false positives, minimal evidence and human review. No silent deletion, account/financial punishment or automatic block from a rule/model signal.",
  visualUnity:
    "Every new feature uses existing canonical pages/primitives/tokens, two approved themes/palette and RTL/focus/reduced-motion/mobile contracts; no parallel design system, removed capability or giant-image Hero.",
};
