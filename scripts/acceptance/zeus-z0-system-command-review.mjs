import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  remainingCommandSurface,
  readSideEffectSurface,
} from "./zeus-z0-command-surface.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (file) =>
  readFileSync(resolve(root, file), "utf8").replaceAll("\r\n", "\n");
const hash = (text) => createHash("sha256").update(text).digest("hex");
const contracts = new Map();
function family(name, actor, rows) {
  for (const [
    signature,
    ownershipPreconditions,
    effects,
    replayAudit,
  ] of rows) {
    assert(!contracts.has(signature), `Duplicate manual contract ${signature}`);
    contracts.set(signature, {
      family: name,
      actor,
      ownershipPreconditions,
      effects,
      replayAudit,
      runtimeAccepted: false,
    });
  }
}

family(
  "account",
  "JWT + customer RolesGuard/capability; server binds current user and IP.",
  [
    [
      "PUT /v1/customer/account/profile",
      "Own user only; normalized optional fields, company name/national id mandatory for company; email currently unverified contact, NOT login identifier (DEC15).",
      "User/profile and sensitive audit in one tx; nullable email can clear existing field, duplicate unique error translated. No role/phone or financial write.",
      "No version CAS; concurrent full-profile updates last-writer-wins. Audit masks neither full profile in source nor policy acceptance inferred on initial create; privacy minimization/version needs review.",
    ],
    [
      "POST /v1/customer/account/privacy/export",
      "Queries pinned to actor id/customerId; explicit account select excludes hashes/tokens; ticket notes and private reports excluded.",
      "Returns JSON snapshot, creates completed export request then critical Audit separately; nested order files select all metadata without a per-kind/customer visibility filter. Not a full archive of file bytes.",
      "Parallel reads are not a consistent DB snapshot; failure after request creation may leave completed status/audit gap. Replays create requests; consent/export limits and authorized projection tests needed.",
    ],
    [
      "POST /v1/customer/account/privacy/deletion-request",
      "Own account; optional reason trimmed/null. Only creates pending request, never deletes or disables account.",
      "Find existing pending request else create then critical Audit separately; no financial/history deletion.",
      "Check/create not unique pending CAS; concurrent duplicates possible; audit failure leaves request. Retention and human adjudication remain future workflow, not deletion implemented.",
    ],
  ],
);
family(
  "auth",
  "Seven Public routes use IP/identifier rate policy; logout/revoke require global session-backed JWT. No email identifier yet; DEC15 preserves mobile flow.",
  [
    [
      "POST /v1/auth/register",
      "Exact mobile key; existing non-pending user conflicts. Creates customer/pending, never executor; optional strong password DTO and display name bounds.",
      "Create/update pending credentials then request register OTP, not one tx. OTP + financial provisioning only later on verification; no live SMS activated by this review.",
      "Repeated pending registration overwrites password/name before ownership proof; OTP-send failure leaves pending state. Ownership-bound staged credentials and no automatic legacy merge required.",
    ],
    [
      "POST /v1/auth/login",
      "Mobile + bcrypt; missing/no password generic Unauthorized; five recent failures block known user; blocked/suspended/pending rejected.",
      "Records attempt then issues DB session/access token; refresh secret in HttpOnly sameSite=strict cookie, access/user body only.",
      "Attempt count and issue are separate; key/IP rate guard local-memory not distributed. Exact error/timing enumeration and concurrent attempts need acceptance; sign/load failure can leave orphan session.",
    ],
    [
      "POST /v1/auth/otp/request",
      "DTO only register/login, not password_reset. Latest code SHA/bcrypt; expiry and max-five attempts at verify. Missing/pending login account returns generic branch.",
      "Consumes old unused codes then creates new code and calls SMS in separate steps. devOtp only development+mock, never production response by that branch.",
      "No transaction/identifier lock across replace/send; concurrency may create multiple unused codes. Visible success text differs between existing and absent accounts; no production-enumeration resistance claim.",
    ],
    [
      "POST /v1/auth/otp/verify",
      "DTO purpose register/login; server verifies identifier/purpose/latest unconsumed code/expiry/attempts; CAS consume count exactly one; status guard before session.",
      "Register activates pending user then provisions ledger account/wallet then issues session; not one tx. Register on existing active account does not grant new role.",
      "Consumption/activation/provision/session steps can partially persist; retries may fail consumed OTP and leave active-without-finance. Stronger atomic staged ownership/password binding required in Z1.",
    ],
    [
      "POST /v1/auth/refresh",
      "Opaque refresh cookie must parse and timing-safe hash match existing session; expiry/current user status checked, JWT not required for refresh route.",
      "Serializable rotate: revoke old, link replacement, create same-family session; reuse revokes active family. P2034 path revokes conflicted family and returns Unauthorized.",
      "CAS rotated count and tx protect replay; concurrent benign refresh can revoke family intentionally. Access signing after commit can fail after old token consumed. Not the old broken refresh-token implementation.",
    ],
    [
      "POST /v1/auth/password/forgot",
      "Mobile request; service internally purpose=password_reset despite public OTP DTO prohibiting that purpose; generic response text and rate3/hour.",
      "Delegates hashed one-time OTP issuance; no password/session change until verified reset. development+mock may expose devOtp for local testing only.",
      "Same issuance partial/race limits as OTP request; no send/delivered claim for live provider. Do not enable SMS credentials or legacy-account linking.",
    ],
    [
      "POST /v1/auth/password/reset",
      "Valid password_reset OTP must belong to user whose stored phone matches; strong password; consume count one in tx.",
      "In one transaction consumes code, changes password, revokes all user sessions and other codes, critical Audit with real actor; clears refresh cookie afterwards; no auto login.",
      "Hash before tx; expire/attempt check read before transaction, only consumed flag CAS inside. Session issuance/reset concurrent scenarios and equality-at-expiry need isolated DB/HTTP tests.",
    ],
    [
      "POST /v1/auth/logout",
      "JWT actor id; only matching refresh cookie/session user/hash leads to family revocation.",
      "Clears refresh cookie first; missing/mismatched cookie returns success with no session revocation. Access token remains valid while session active.",
      "Cookie-loss logout gap vs user expectation must be explicitly resolved; should revoke authenticated session id without trusting somebody else's cookie, scoped auth change. Wrong-user family protected.",
    ],
    [
      "DELETE /v1/auth/sessions/others",
      "JWT user id and current session id; absent session id Unauthorized.",
      "updateMany own user, id != current, not already revoked; no user/status or money write.",
      "Repeat safely revokes zero; result count returned. Fresh session created concurrently needs defined 'others' semantics and Audit target; method currently no explicit revocation audit.",
    ],
    [
      "DELETE /v1/auth/sessions/:id",
      "updateMany constrained by requested id + authenticated user id + revokedAt null; foreign/missing becomes NotFound.",
      "Revokes requested own session, including current if selected; future JWT loads reject revoked session.",
      "Repeated revoke returns NotFound, not replay success; no explicit revocation Audit here. Never accepts arbitrary subject/user id from body.",
    ],
  ],
);
family(
  "catalog",
  "Global JWT; AdminScopeGuard ops/super. @Roles(admin) metadata exists but no separate RolesGuard on catalog controller; scope is loaded from DB, not client claims.",
  [
    [
      "POST /v1/admin/services",
      "CreateServiceDto pricing enum, nonnegative optional base price/positive SLA; string labels/slugs lack trim/nonblank/max. Unique slug at DB.",
      "Creates serviceLine; no actor passed or explicit Audit in this service. Catalog base not a binding order quote/snapshot.",
      "No replay key; unique slug collision rejected by DB, not duplicate-return contract. Versions of pricing/order snapshots and old order preservation tested separately.",
    ],
    [
      "PATCH /v1/admin/services/:id",
      "Existing service required; optional allowed DTO fields only. Null/empty and model cross-field combinations need domain constraints.",
      "Updates current catalog, not existing order finalPrice directly. No explicit catalog audit/version in method.",
      "No expected-version CAS; concurrent changes overwrite fields. Historic order/specification snapshots must not read mutable new catalog as prior promise.",
    ],
    [
      "PATCH /v1/admin/services/:id/active",
      "Existing service; primitive Body(isActive) boolean annotation is not class-validator DTO enforcement.",
      "Toggles current catalog active flag, does not delete service/orders.",
      "Idempotent assignment of value but missing/wrong primitive body and admin capability need negative HTTP tests; no explicit Audit/version.",
    ],
    [
      "POST /v1/admin/services/:id/packages",
      "Existing parent service; allowed DTO with nonnegative price, SLA positive; package selection source remains server.",
      "Adds child package under route parent, not client serviceId. No existing package/order deletion.",
      "No replay key or explicit Audit; retry can add duplicate names/packages. Snapshot/version contract required before catalog evolution.",
    ],
    [
      "POST /v1/admin/services/:id/form-fields",
      "Existing parent; fieldKey regex, supported type enum/options array/unique strings, sortOrder nonnegative. Conditional select options coherence not enforced here.",
      "Adds service form field; empty options omitted. Existing versioned order form preservation is separate source contract.",
      "DB parent+fieldKey uniqueness; replay/error without friendly duplicate contract. No Audit/version CAS in method.",
    ],
    [
      "POST /v1/admin/services/:id/acceptance-criteria",
      "Existing parent, description min3 but whitespace passes length-only validation.",
      "Adds acceptance criterion under route parent. No order/checklist migration or financial effect.",
      "No replay key/dedup/Audit; changed live criteria versus saved order/checklist must remain explicitly versioned.",
    ],
    [
      "POST /v1/admin/services/:id/qc-templates",
      "Existing parent, name min2; no trimmed nonblank policy here.",
      "Creates QC template with items include; no role/QC result or order transition effect.",
      "No replay key/Audit; repeated request makes another template. Historic QC templates/checklists must be immutable snapshots before new edits.",
    ],
    [
      "POST /v1/admin/services/:id/qc-templates/:templateId/items",
      "Template id AND serviceId match required; wrong-parent template NotFound. Label min2, order nonnegative default0.",
      "Creates item only within validated template; no result acceptance or financial mutation.",
      "No replay key/Audit; duplicate concurrent items possible. Existing QC results must not be invalidated by current-template append.",
    ],
  ],
);
family(
  "staff",
  "JWT + RolesGuard admin + AdminScopeGuard ops/super. Real actor/IP passed; human commands, no AI access grant.",
  [
    [
      "POST /v1/admin/staff",
      "Unique phone precheck, optional team exists; type internal/external. Phone/display strings weaker than auth DTO. Internal auto-approved; external pending onboarding.",
      "Creates user, provisions financial accounts, then profile + critical Audit in separate tx. No initial money deposit; safe user projection.",
      "No idempotency key/full creation tx; profile failure can leave user/accounts. Verification gates external assignments; staged repair must not delete historic data.",
    ],
    [
      "POST /v1/admin/staff/:id/performance/recalculate",
      "Existing profile; rolling period computes assignment/QC/feedback samples. Missing samples currently produce numeric zero rates/ratings/risk.",
      "Updates metrics + snapshot transaction, then risk alerts/notifications and actor Audit separately; no direct status write in this path.",
      "Per-day snapshot upsert not per-command replay; audit/alert failures can follow metric commit. Unknown zero and automated under_review job conflict DEC16, tracked for independent change.",
    ],
    [
      "PATCH /v1/admin/staff/:id/status",
      "Profile row lock and existence; enum status, note min3 not server trimmed. Super/ops cannot bypass onboarding/QC/finance via this command.",
      "Sets profile status; blocked revokes sessions, critical actor before/after Audit in same tx. Does not change user.status.",
      "No expected version/replay key; note is consumed in Audit but whitespace accepted. Blocked profile alone is not AuthSessionService user-status prohibition, so new-session/executor route policy needs coverage.",
    ],
    [
      "PATCH /v1/admin/staff/:id/capacity",
      "Profile exists; 0..100 integer note length-only. For active/over_capacity, derived status over_capacity iff >=100; other status preserved.",
      "Profile + capacity snapshot + actor Audit in tx; refresh alerts after commit. No assignment slot/booking itself.",
      "No explicit profile row lock/CAS here; response failure after alert refresh may leave capacity committed. Distinguish capacity percentage from atomic same-day slot reservation.",
    ],
    [
      "PATCH /v1/admin/staff/:id/profile",
      "At least one change, optional team exists; locks profile; cannot change collaboration type or directly verify external profile.",
      "Updates permitted profile fields plus critical Audit with consumed note; no role/grant or financial command.",
      "Row lock serializes writers but no client expected version; historic overwritten fields preserved in Audit. Notes require trim/nonblank consistency.",
    ],
    [
      "PATCH /v1/admin/staff/:id/skills",
      "Profile exists; max30 nested skills level1..5; duplicate ids and absent skills rejected before tx.",
      "Replaces profile skill rows in tx with before/after Audit; this is authorized editing current skills, not removal of subsystem/history.",
      "No profile lock/version CAS; concurrent replacements last-writer-wins with stale before snapshot. Retry audit repeats; stored note must become trimmed meaningful.",
    ],
    [
      "PATCH /v1/admin/staff/:id/attendance",
      "Profile exists; date validated/roundtripped to UTC midnight; enum attendance, note bound; reason length-only.",
      "Upsert per profile/date, recorder id and reason consumed in Audit in same tx; no payroll or role side effect.",
      "DB composite key avoids duplicate dates; no version on edits. Tehran business date vs submitted ISO slice must be documented rather than assume hour conversion.",
    ],
    [
      "PATCH /v1/admin/staff/:id/access",
      "Profile maps to user; enum user status and customerCapability boolean, note length-only.",
      "Tx sets user status, grants/removes customer capability only, revokes sessions, critical Audit. Does not grant admin/executor role or money rights.",
      "Profile read before tx/no CAS; self-target and privilege boundaries need negative tests. Real note consumed but not trimmed; newly issued sessions race needs DB acceptance.",
    ],
    [
      "PATCH /v1/admin/staff/:id/alerts/:alertId/acknowledge",
      "Alert must match profile, cleared rejected, already acknowledged returns existing; note3..500 length-only.",
      "Marks acknowledgment with real actor/time/note + sensitive Audit in tx; no block/status/financial decision.",
      "Repeat on acknowledged id returns prior state but concurrent acks not CAS. Unknown signals remain proposals; acknowledgment never equals acceptance of punishment.",
    ],
    [
      "POST /v1/admin/teams",
      "Name/code unique precheck; DTO strings only; not organization team API.",
      "Creates internal staff team + actor Audit tx; no member reassignment or deletion.",
      "DB uniqueness handles race; no replay key, bounded meaningful names required. Preserve separate staff-team/org-team semantics.",
    ],
    [
      "POST /v1/admin/skills",
      "Name min2 unique precheck; optional category.",
      "Creates skill + actor Audit tx; no employee automatic grant or financial effect.",
      "Unique name constrains duplicate; no replay key/normalization. Idempotent user-facing retry still future contract.",
    ],
  ],
);
family(
  "onboarding",
  "JWT + admin RolesGuard + ops/super AdminScopeGuard; explicit human reviewer and rate policy.",
  [
    [
      "POST /v1/admin/staff/:id/onboarding/start",
      "Locks profile; external only; existing dossier returned; new dossier denied while active assignments exist.",
      "Tx creates dossier, sets verification pending, critical actor Audit. No user role or payment; does not instantiate AI.",
      "Same profile row lock and existing dossier make retries nonduplicating at source level; isolated DB proof still required.",
    ],
    [
      "POST /v1/admin/staff/:id/onboarding/review",
      "Locked external profile with dossier; no self-review, matching client version; approve/reject/reopen stage policy + evidence. Reject denied with active assignments.",
      "CAS increments version; records trimmed note/evidence reviewer row, verification status and critical Audit in one tx.",
      "Stale versions conflict; resolved stage rules prevent arbitrary leap; repeated old command fails not replay success. Evidence is reference, not raw private attachment leak.",
    ],
  ],
);
family(
  "feedback",
  "JWT customer role/capability for create; admin + ops/super guards for status; internal targets must remain private under DEC03.",
  [
    [
      "POST /v1/customer/orders/:orderId/feedback",
      "Owned order in allowed delivered/confirmed/closed states; rating1..5 or complaint/thanks meaningful comment; public handler/ticket/reviewer determines internal target.",
      "Tx creates feedback, count on executor, actor Audit + target Outbox; current raw returned row contains targetInternalId. Public opt-in/moderation not yet implemented.",
      "Key required; replay verifies customer/order but not payload fingerprint, concurrent unique create not replay recovery. Internal UUID projection and moderated public review are Z1/Z5 gaps, not new permission to publish.",
    ],
    [
      "PATCH /v1/admin/feedback/:id/status",
      "Existing feedback; enum in_review/resolved/closed; closing requires trimmed resolution note>=5.",
      "Tx updates resolution/status/timestamp + real actor Audit + customer Outbox. No staff status/financial punishment.",
      "No state/version CAS or replay key; notifications repeat and terminal record can reopen. Preserve human reason; target moderation and publication remain separate.",
    ],
  ],
);
family(
  "files",
  "Global JWT, uploader resolved from DB; role/kind and order relation checked in FilesService; no blanket public upload.",
  [
    [
      "POST /v1/files/upload",
      "One file<=25MiB, MIME/extension/signature; owned customer, active assigned executor, admin, or support with any ticket on order. Primary role controls file kinds (dual capability mismatch possible).",
      "Writes quarantine UUID, scans; clean storage then DB, infected DB+critical Audit and rejection. Unavailable scanner throws; mock clean is simulated, not production AV acceptance.",
      "No replay key/checksum dedup; storage/DB not one transaction. Scope/assigned-support bounds, storage-put failure cleanup, no raw storage key exposure and signed download revocation must be accepted separately; no live scanner/storage enabled.",
    ],
  ],
);
family(
  "finance",
  "JWT admin + Finance/Super scope guard for admin routes; withdrawal-request URL is under customer but METHOD role is executor/capability. Money source remains Ledger.",
  [
    [
      "POST /v1/customer/withdrawals",
      "Own executor profile, matching checksum-valid previously marked verified Shaba; min/max settings, wallet less outstanding reserves; positive integer DTO.",
      "Serializable payload-bound idempotency tx creates pending withdrawal + Outbox; reservation is pending rows, not immediate debit.",
      "Key/owner scope and request fingerprint; serializable retries. Later approval must revalidate spendable funds; database/nonnegative wallet and simultaneous spend need explicit acceptance.",
    ],
    [
      "POST /v1/admin/finance/reconciliation/run",
      "Finance/Super invokes force=true, bypasses schedule only; no caller actor passed into service.",
      "Daily Tehran idempotency snapshot of wallet/ledger discrepancies, Audit/Outbox alerts if any; limited missing-account diagnosis already fixed and accepted separately, never auto repair.",
      "Same daily key means force repeats cached daily result, not fresh scan. Manual actor attribution/fresh-run semantics open; independent scheduler preserved.",
    ],
    [
      "POST /v1/admin/finance/escrow/:orderId/release",
      "Held/partially distributed latest hold, active assignment and bounded remaining amount; commission setting0..1. No order-status/QC/freeze predicate in releaseInTransaction itself.",
      "Payload-bound idempotency Serializable tx CAS escrow counters, executor+commission ledger entries/projection, critical actor Audit+Outbox. Pays FIRST active assignment, not multi-executor split.",
      "Balance CAS/ledger/idempotency protect replay but cannot substitute for state/QC authority. Direct Finance release vs workflow preconditions, late funds and multiple holds require scoped Z1/Z7 remediation.",
    ],
    [
      "POST /v1/admin/finance/escrow/:orderId/refund",
      "Order exists; latest eligible hold and bounded amount; string reason and note length-only; no per-hold/milestone selector or direct status gate.",
      "Serializable idempotency tx CAS balances, credit customer wallet through Ledger, Refund row processed, critical Audit and Outbox. Not external bank transfer.",
      "Payload-bound key/remaining balance guard; partial remainder stays explicit Finance action (DEC12). Note/reason whitespace and multi-hold routing require tests; never auto release remainder.",
    ],
    [
      "POST /v1/admin/finance/ledger/:id/correction",
      "Original exists; truthy key; reason string only. Correction reverses original accounts/amount; append-only original untouched.",
      "Serializable tx appends mirrored entry/projections and critical actor Audit with reason; no removal/edit of original.",
      "Replay key not fingerprint-bound to original/reason; same original can be reversed using multiple different keys (correctionOfId not unique). Bound one permitted correction lineage and reason before implementation; do not rewrite historic ledger.",
    ],
    [
      "PATCH /v1/admin/finance/withdrawals/:id/approve",
      "Pending withdrawal only; note length3; actor Finance/Super. Uses stored amount/profile; no amount from request.",
      "Serializable idempotency tx debit executor Ledger to clearing, approved+processedAt, actor critical Audit/Outbox. It is local accounting, not live bank payout proof.",
      "Fingerprint binds approve/note. No current balance/Shaba recheck inside approval branch; postEntry does not itself reject negative projected balance. Needs concurrent spend and insufficiency acceptance, not silent auto retry payout.",
    ],
    [
      "PATCH /v1/admin/finance/withdrawals/:id/reject",
      "Same pending-only state and scoped actor; reason carried as note length-only.",
      "Idempotent tx status rejected/Audit/Outbox; no ledger debit on reject, releases row-based reservation.",
      "Same scope as approve and request fingerprint prevents same key approve/reject swap; separate keys require serialization. No bank reversal claim.",
    ],
    [
      "POST /v1/admin/finance/withdrawals/verify-shaba",
      "Checksum-valid IR Shaba and target profile; scoped human actor.",
      "Tx stores Shaba and verifiedAt plus masked-last4 critical Audit; no bank/identity API.",
      "Current verified label proves local checksum+human command only, not bank ownership. No reason DTO/idempotency; false verification semantics must be explicit and later bank acceptance separately authorized.",
    ],
  ],
);
family(
  "notifications",
  "Session-backed JWT for any current role; user.id bound server-side, no client owner id.",
  [
    [
      "PUT /v1/notifications/preferences",
      "Three booleans via DTO, own user only.",
      "Upserts own channel preferences, no send/dispatch or live provider activation.",
      "Same payload is state-idempotent; no version or explicit Audit; concurrent updates last-writer-wins. Preferences/consent applied by dispatch contract separately.",
    ],
    [
      "PATCH /v1/notifications/read-all",
      "Own in_app unread rows only.",
      "updateMany readAt now; never updates another user/other channels.",
      "Repeated request updates zero already-read rows; no financial/Audit requirement inferred. New notification race uses normal snapshot semantics.",
    ],
    [
      "PATCH /v1/notifications/:id/read",
      "where id AND userId; no cross-user notification write.",
      "Sets readAt even if already read; channel not restricted in this single-id method.",
      "Returns count0 for missing/foreign, not content leak. Repeats move read timestamp; define first-read-only target before metric use.",
    ],
  ],
);
family(
  "organization",
  "Customer role/capability + explicit membership for customer commands; admin Finance/Super for plans/subscription. No arbitrary shared-order ownership transfer.",
  [
    [
      "POST /v1/customer/organizations",
      "Meaningful bounded name; user row lock; max25 active ownership memberships.",
      "Tx creates org+owner membership and actor Audit; no subscription/purchase inferred.",
      "Owner count serialized by row lock; retry can create a second distinct org; no replay key.",
    ],
    [
      "POST /v1/customer/organizations/invitations/:invitationId/respond",
      "Invited row must belong to actor; org lock; active subscription required for accept, not reject.",
      "CAS invited->active/revoked + actor Audit in tx, no forced activation by owner.",
      "Second response/stale invite conflicts/NotFound; acceptance races and revoked invitations fail-closed. No email live invitation assumed.",
    ],
    [
      "POST /v1/customer/organizations/:id/invitations",
      "Org lock; active owner, subscription, valid team; invited active user has customer role/capability; seats count invited+active; no duplicate active/invited.",
      "Tx upserts membership invited, same tx Outbox and actor Audit; external message still deferred.",
      "Org lock serializes seats; response id not real delivery. Re-invite revoked member supported; no arbitrary owner role in DTO.",
    ],
    [
      "POST /v1/customer/organizations/:id/teams",
      "Active owner/manager, active subscription; max100, unique trimmed name in same org under lock.",
      "Creates organizationTeam + Audit in tx, separate from internal staff team.",
      "Org lock/unique index protect duplicates; replay repeated name conflicts rather than prior result.",
    ],
    [
      "PATCH /v1/customer/organizations/:id/members/:memberId",
      "Owner only, org lock, target/team within same org; cannot edit owner or activate nonactive member without their accepted invite.",
      "Tx changes manager/member status/team and actor Audit with note; no platform role/capability.",
      "Serialized by org lock; no client version. DTO permits revoked/member only; notes need consistent trim/nonblank.",
    ],
    [
      "POST /v1/customer/organizations/:id/transfer-owner",
      "Current active owner, same-org other active target, not self; org lock.",
      "Tx demotes owner to manager and promotes target owner, actor Audit with real note; no impersonation/user status change.",
      "Serialized ownership operation; no replay key, repeated old-owner request denied. Last owner cannot be removed by member edit.",
    ],
    [
      "POST /v1/customer/organizations/:id/plan-request",
      "Locked org; owner; active plan exists.",
      "Stores requested plan and Audit only; no billing/charge or active subscription.",
      "Repeat same plan state-idempotent but duplicate Audit; actual activation is separate Finance command.",
    ],
    [
      "POST /v1/customer/organizations/:id/orders",
      "Org lock+active membership/subscription/team scope; locks OWN personal draft with matching version/no org; quota counts current period.",
      "Tx attaches draft/org/team and increments version, Audit note; no submit/payment/shared edit of somebody else's order.",
      "Locks prevent quota/order races at source; old version conflicts. Customer draft ownership still independent from organization role; DB acceptance needed.",
    ],
    [
      "POST /v1/admin/organizations/plans",
      "Finance/Super; bounded seats/order quota/fee/duration and meaningful name via inherited DTO validators.",
      "Tx creates plan+Audit, no automatic subscription or wallet debit.",
      "No replay key/name uniqueness contract; amount integer bounds, currency Toman. Existing subscriptions keep snapshot values.",
    ],
    [
      "PATCH /v1/admin/organizations/plans/:id",
      "Existing plan, boolean active DTO, Finance/Super.",
      "Tx toggles availability and actor Audit; no retroactive cancellation/change to active subscription snapshots.",
      "Same value safe state repeat; Audit repeats; no client version.",
    ],
    [
      "POST /v1/admin/organizations/:id/subscription",
      "Org lock/existence, expected version, no currently active subscription; active plan and seat capacity fit; contract reference+note required.",
      "Tx snapshots price/quota/name/dates, increments version, clears request and Audit. Contract activation, NOT proof of online payment/ledger charge.",
      "Locked org+version; active period cannot silently be replaced. Later Finance billing must remain explicit/deferred, not falsely mark live accepted.",
    ],
    [
      "POST /v1/admin/organizations/:id/subscription/cancel",
      "Org lock; active status and expected version match; real note in Audit.",
      "CAS cancelled/version+1 + Audit in tx; no refund or historic order/ledger deletion.",
      "Repeat old version conflicts; old snapshot retained. Note trim and prorated cancellation billing not invented.",
    ],
  ],
);
family(
  "pricing",
  "Public, no-store, rate60/min, active public catalog; already owner-approved exact pricing exception.",
  [
    [
      "POST /v1/pricing/calculate",
      "Validated serviceSlug/packageId/priority; no quantity input in this estimate DTO; only current active public catalog; high/low not guessed into urgency.",
      "Read-only estimate with normal/urgent/same-day rates; not binding quote, capacity reservation, deadline or payment.",
      "No mutation/replay key needed; live integrations remain off, numeric bounds/54 existing tests remain evidence; current catalog estimate never rewrites accepted order.",
    ],
  ],
);
family(
  "governance",
  "JWT + admin RolesGuard + Super AdminScopeGuard. No AI-created actor or bypass token.",
  [
    [
      "PUT /v1/admin/settings",
      "Allowlisted keys/types/ranges only; human_approval_required cannot become false. Dates regex only; withdrawal min/max each valid independently.",
      "Tx setting upsert + critical actor before/after Audit; no env secret update or live service activation by this review.",
      "No version/reason field; concurrent last writer wins; impossible dates/min>max and versioned financial/calendar rules need domain guard. AI engine still unconnected.",
    ],
    [
      "PATCH /v1/admin/users/:id/status",
      "Existing user; enum, note min3; caller cannot deactivate self. Super scope required at method.",
      "Tx user status change, revoke sessions when not active, critical actor Audit; safe user projection, no Ledger/payment change.",
      "No client version/global last-super lock; concurrent admin lockout/other-super deactivation and blank notes need tests. Reactivation does not revive revoked sessions.",
    ],
    [
      "POST /v1/admin/admins",
      "Unique mobile, strong optional password, permitted scope; caller Super. No automatic role conversion of existing user.",
      "Tx creates active admin + critical actor Audit, safe projection excludes password; no capability grant to arbitrary customer.",
      "Precheck race DB uniqueness; no replay key. Optional password implies approved OTP flow only, not leaked generated credential; no live SMS enabled.",
    ],
    [
      "PATCH /v1/admin/admins/:id/scope",
      "Existing admin target only; self scope change denied; note min3; Super actor.",
      "Tx changes scope + revokes user sessions + critical real actor Audit, safe projection; no permission bypass through old JWT because session reload.",
      "No expected version/last-super serialization; whitespace note and simultaneous scope/status lockout need acceptance. Existing role/capability count preserved.",
    ],
  ],
);

const findingRows = [
  [
    "AUTH01",
    "OTP ownership and activation atomicity",
    ["Z1"],
    "Pending credential overwrite before phone proof; activate/provision/session split; OTP replace/send not atomic; generic response branch differs and local rate buckets not multi-instance.",
    "Stage credentials bound to owner verification, atomic activation/accounts, purpose/expiry/attempt/rate and replay tests; preserve exact legacy users and no automatic email merge.",
  ],
  [
    "AUTH02",
    "Logout without refresh cookie",
    ["Z1"],
    "Successful authenticated logout without a matching cookie clears cookie but does not revoke authenticated session; access token can still load active session.",
    "Revoke current authenticated sid safely plus matching family policy, wrong-owner denial and browser tests. Do not weaken refresh rotation/reuse protections.",
  ],
  [
    "PRIV01",
    "Export projection and request atomicity",
    ["Z1", "Z3"],
    "Account export nested file metadata lacks customer-kind visibility filter; JSON export/private-request/audit separate, pending deletion request not unique under concurrency; email unverified contact.",
    "Minimized explicit export projection, bounded/snapshot export with audit; unique pending deletion/human retention workflow. Email optional until separately verified unique identifier; no deletion of real data.",
  ],
  [
    "CAT01",
    "Catalog input/version/Audit contract",
    ["Z1", "Z2", "Z5"],
    "Primitive active flag has no validated DTO; multiple strings only length/type; catalog mutation lacks per-actor audit/version. Historical checklists/quotes must not inherit later catalog edits.",
    "Explicit command validation/trim/limits, immutable order specification/QC/rate snapshots, actor audit and conflict/version tests. Scope metadata is not standalone role enforcement.",
  ],
  [
    "STAFF01",
    "Staff provisioning/unknown metrics/governance",
    ["Z1", "Z5"],
    "User/accounts/profile creation split; missing metric samples persisted as zeros; older job may set under_review autonomously; profile blocked vs user status separate, permission changes need real notes.",
    "Atomic or recoverable provisioning; unknown/sample counts and human audited status command; shared row locks/CAS/meaningful reasons. Preserve external onboarding's existing version/evidence/self-review safeguards.",
  ],
  [
    "FB01",
    "Feedback private target and replay",
    ["Z1", "Z5"],
    "Raw create/replay returns internal target id; key replay binds owner/order not payload; public moderated opt-in review target still absent; status has no version/replay state contract.",
    "Safe customer projection and fingerprint-bound idempotency, independent optional moderated public review without employee identity; complaint/thanks/private records retained; human review, no automated staffing penalty.",
  ],
  [
    "FILE01",
    "File capability/scope/storage boundary",
    ["Z1", "Z4", "Z7"],
    "Support upload allowed with any order ticket and admin any scope; primary role kind ignores dual capability; storage/DB/scan failure compensation incomplete and mock not AV acceptance.",
    "Command-level file permission + active ticket/assignment/owner, explicit customer projection; quarantine/put/DB cleanup under injected failure, signed URL revocation and decompression/content limits. Live AV/S3 stay owner-deferred.",
  ],
  [
    "FIN01",
    "Direct escrow release lacks workflow preconditions",
    ["Z1", "Z5"],
    "Direct Finance release checks hold/assignment/amount but not order status, QC, dispute freeze. Release chooses first assignment and latest hold, not multi-executor/per-hold routing.",
    "Explicit human command + state/QC/freeze/ownership preconditions; bounded per-hold allocation and balanced shares in Z7; partial remainder never auto released. Existing CAS/idempotency/Audit/Outbox retained.",
  ],
  [
    "FIN02",
    "Correction key/lineage binding",
    ["Z1"],
    "postCorrection replays global key without verifying original/reason; different keys can reverse same original repeatedly because correctionOfId is not unique.",
    "Bind normalized command fingerprint+actor scope; immutable one-valid-correction lineage/contra-entry policy and serializable uniqueness/replay tests. Never edit/delete prior Ledger or silently recorrect history.",
  ],
  [
    "FIN03",
    "Withdrawal decision and Shaba semantics",
    ["Z1", "Z5"],
    "Approval does not re-read available funds/verification, postEntry permits negative projection by itself; local Shaba checksum+admin marker is not bank ownership or real payout.",
    "Serialized spendable/reserve invariant and verified-destination snapshot, insufficiency/racing correction/replay tests, truthful local-vs-bank status. Bank acceptance/live payout remains separately deferred.",
  ],
  [
    "CFG01",
    "Settings calendar/cross-field/version/reasons",
    ["Z1", "Z2", "Z5"],
    "Regex holidays accept nonexistent dates; withdrawal min/max not cross-validated; financial/calendar settings and admin changes have no versioned command reason contract; last-super races not globally locked.",
    "Strict actual dates and cross-field invariants, versioned snapshots for new commitments, trimmed consumed reasons and last-super concurrency protection; do not change historic SLA/payments or AI human guard.",
  ],
];

const findingRequirements = {
  AUTH01: ["ZEUS-V4-019", "ZEUS-V4-081", "ZEUS-V4-082"],
  AUTH02: ["ZEUS-V4-019", "ZEUS-V4-082"],
  PRIV01: ["ZEUS-V4-008", "ZEUS-V4-019", "ZEUS-V4-081"],
  CAT01: ["ZEUS-V4-053", "ZEUS-V4-072", "ZEUS-V4-073", "ZEUS-V4-074"],
  STAFF01: [
    "ZEUS-V4-046",
    "ZEUS-V4-047",
    "ZEUS-V4-048",
    "ZEUS-V4-049",
    "ZEUS-V4-098",
  ],
  FB01: ["ZEUS-V4-007", "ZEUS-V4-008", "ZEUS-V4-050", "ZEUS-V4-081"],
  FILE01: ["ZEUS-V4-056", "ZEUS-V4-075", "ZEUS-V4-076", "ZEUS-V4-077"],
  FIN01: [
    "ZEUS-V4-059",
    "ZEUS-V4-063",
    "ZEUS-V4-097",
    "ZEUS-ADD-S06",
    "ZEUS-ADD-L07",
  ],
  FIN02: ["ZEUS-V4-062", "ZEUS-V4-065", "ZEUS-ADD-L04", "ZEUS-ADD-L05"],
  FIN03: ["ZEUS-V4-066", "ZEUS-V4-081", "ZEUS-ADD-L09"],
  CFG01: ["ZEUS-V4-038", "ZEUS-V4-074", "ZEUS-V4-081", "ZEUS-UI-049"],
};

function filesIn(directory) {
  return readdirSync(resolve(root, directory), { withFileTypes: true }).flatMap(
    (entry) =>
      entry.isDirectory()
        ? filesIn(`${directory}/${entry.name}`)
        : [`${directory}/${entry.name}`],
  );
}
const readContracts = {
  "GET /v1/customer/account/profile":
    "JWT customer/capability, own profile only; missing customerProfile lazily upserted, no role/financial grant. Not a pure read; concurrency/key and consent timestamp semantics need tests.",
  "GET /v1/status":
    "Public minimized status projection; shares cached readiness Promise, DB/queue checks and temporary storage write/read/delete. Provider readiness is configuration-only/mock, not SMS/email/payment delivery; never expose secrets or enable drivers.",
  "GET /v1/files/:id/signed-url":
    "JWT owner/eligible customer/assigned executor/Ops/Super/Finance-invoice/related support; clean scan required. Creates five-minute signed grant and Audit separately, hashed jti. GET produces state; URL is bearer capability, not general public file.",
  "GET /v1/files/download":
    "Public endpoint requires signed typ/audience/issuer/algorithm and matching unexpired/unrevoked/unused grant; file clean and object exists; Audit then CAS usedAt then reads/sends bytes. Grant currently not rechecked against active user/current assignment; failed final object read can consume grant. Do not call live provider during Z0.",
  "GET /v1/customer/finance/overview":
    "Current customer user; wallet.getSummary may create zero cache wallet, never invent ledger credit/payment. Overview projections and scopes unchanged, no real financial acceptance inferred.",
  "GET /v1/customer/wallet":
    "Method role customer/executor guard; own zero wallet upsert and latest50 own transactions. Wallet is projection not source of truth; no funding from read.",
  "GET /v1/admin/finance/ledger/export":
    "Finance/Super plus query constraints; records sensitive export actor/IP Audit before CSV response. No Ledger write; CSV encoding/formula injection/PII limits and bounded query remain output acceptance.",
  "GET /v1/admin/finance/ledger":
    "Finance/Super read with critical/sensitive actor Audit in controller; pagination/filters, no financial mutation. Repeated reads create audit entries intentionally.",
  "GET /v1/admin/finance/invoices/:id/pdf":
    "Finance/Super download existing invoice, explicit Audit. Owner/customer endpoint separately enforces ownership; rendering bytes is not invoice creation/payment. Invoice exception preserved; render/provider never triggered by inventory tool.",
  "GET /ready":
    "Public summary only, 200/503; cache-coalesced readiness performs bounded temporary storage probe and metrics/alerts. It may cause storage work; no blanket production or provider-delivery acceptance.",
  "GET /v1/admin/health/readiness":
    "JWT admin Ops/Finance/Super detailed readiness; same cached probes as public summary, no secret output and no role/financial change. External credentials/driver remain deferred.",
  "GET /v1/notifications/preferences":
    "JWT own preference lazy upsert defaults; no dispatch/send. State-producing GET, default consent/notification policy separate from live provider acceptance.",
  "GET /v1/admin/orders/:id/suggestions":
    "JWT Ops/Super via orders controller; RepeatableRead reads eligible approved/capacity-limited candidates + past prices, writes actor audit only. Rules_v1 suggestions require human review; no automatic assign/quote/state; unknown-history scores still a target gap, not AI connection.",
  "GET /v1/admin/reports/bi":
    "JWT admin Ops/Finance/Super; rate10/min, BI result and sensitive actor Audit. Small cohort/privacy/sample definitions are read-model acceptance, no change to staffing/money.",
  "GET /v1/admin/reports/operations/export":
    "JWT Ops/Super; rate5/min; operations CSV+actor/IP/rowCount/period Audit; no order mutation. Output authorization/formula-injection/bounds/RTL acceptance separate.",
  "GET /v1/admin/reports/finance/export":
    "JWT Finance/Super; rate5/min; finance CSV+actor/IP/rowCount/period Audit; no Ledger mutation. Unknown/failed/export truncation never means zero or success.",
};
export function buildSystemCommandReview() {
  const surface = remainingCommandSurface();
  const readSurface = readSideEffectSurface();
  assert.deepEqual(
    readSurface.map((item) => item.signature).sort(),
    Object.keys(readContracts).sort(),
    "Unreviewed/new GET-side-effect candidate",
  );
  assert.equal(
    contracts.size,
    65,
    "Expected complete independent manual contracts",
  );
  assert.equal(
    surface.length,
    contracts.size,
    "Unreviewed route or stale contract",
  );
  assert.deepEqual(
    [...contracts.keys()].sort(),
    surface.map((item) => item.signature).sort(),
  );
  const methods = [
    ...new Map(
      surface
        .flatMap((route) => route.surface)
        .map((entry) => [entry.key, entry]),
    ).values(),
  ];
  const readMethods = [
    ...new Map(
      readSurface
        .flatMap((route) => route.surface)
        .map((entry) => [entry.key, entry]),
    ).values(),
  ];
  const sources = [
    ...new Set([
      ...methods.map((entry) => entry.file),
      ...readMethods.map((entry) => entry.file),
      ...methods.flatMap((entry) => entry.dtos.map((dto) => dto.file)),
      ...readMethods.flatMap((entry) => entry.dtos.map((dto) => dto.file)),
      "apps/api/src/auth/refresh-token.ts",
      "apps/api/src/auth/auth-token.service.ts",
      "apps/api/src/common/guards/roles.guard.ts",
      "apps/api/src/common/guards/admin-scope.guard.ts",
      "apps/api/src/common/guards/jwt-auth.guard.ts",
      "apps/api/src/common/guards/rate-limit.guard.ts",
      "apps/api/src/auth/strategies/jwt.strategy.ts",
      "apps/api/src/main.ts",
      "apps/api/src/app.module.ts",
      "apps/api/src/executor/onboarding-policy.ts",
      "apps/api/src/executor/performance-metrics.ts",
      "apps/api/src/executor/staff-risk.ts",
      "apps/api/src/organizations/organization-policy.ts",
      "apps/api/src/files/file-signature.ts",
      "apps/api/src/finance/escrow.service.ts",
      "apps/api/prisma/schema.prisma",
      ...filesIn("apps/api/prisma/migrations").filter((file) =>
        file.endsWith(".sql"),
      ),
      "docs/zeus/z0-decisions.json",
    ]),
  ].sort();
  return {
    schemaVersion: 1,
    date: "2026-10-25",
    kind: "remaining-65-current-command-contracts",
    phaseAccepted: false,
    runtimeAccepted: false,
    databaseQueried: false,
    sourceHashes: Object.fromEntries(
      sources.map((file) => [file, hash(read(file))]),
    ),
    methods,
    readMethods,
    readSideEffects: readSurface.map(({ surface: refs, ...entry }) => ({
      ...entry,
      currentContract: readContracts[entry.signature],
      methodRefs: refs.map((item) => item.key),
      runtimeAccepted: false,
      testsRequired: [
        "Actor/scope/ownership and minimized projection",
        "No real provider from inventory; state effects and failure/replay explicitly accepted later",
      ],
    })),
    contracts: surface.map(({ surface: references, ...route }) => ({
      id: `Z0-SYS-${hash(route.signature).slice(0, 10)}`,
      ...route,
      ...contracts.get(route.signature),
      methodRefs: references.map((entry) => entry.key),
      testsRequired: [
        "Exact actor/scope/ownership/DTO negative cases without side effects",
        "Defined replay/mismatch, concurrent change and failure rollback for this command",
        "Historic data/API/UI preservation; no fake live delivery/charge/acceptance",
      ],
      status: "reviewed-current-contract-runtime-acceptance-pending",
    })),
    findings: findingRows.map(([id, title, phases, evidence, target]) => ({
      id: `Z0-SYS-${id}`,
      requirements: findingRequirements[id],
      title,
      phases,
      evidence,
      target,
      status: "open-implementation-and-acceptance",
      runtimeFixed: false,
      authority:
        "Planning/isolated characterization only; protected runtime/DB/auth/finance/live scope requires separate exact authorization. Preserve three existing byte-pinned exceptions.",
    })),
    limits:
      "These 65 contracts plus prior31+8 classify all104 non-read routes, not all business acceptance. Local syntactic method references include helper calls; external/free functions and inherited DTO semantics have explicit source hashes and require their own contracts. GET-side-effect, jobs, migrations and source-atomic review are separate gates, never inferred from HTTP verb or AST extraction. No source mutation or live execution occurred.",
  };
}
export function checkSystemCommandReview(
  record,
  expected = buildSystemCommandReview(),
) {
  assert.equal(record.phaseAccepted, false);
  assert.equal(record.runtimeAccepted, false);
  assert.equal(record.databaseQueried, false);
  assert.deepEqual(record, expected, "System command/source contract drift");
  assert.equal(record.contracts.length, 65);
  assert.equal(record.readSideEffects.length, 16);
  assert(
    record.contracts.every(
      (item) =>
        item.actor &&
        item.ownershipPreconditions &&
        item.effects &&
        item.replayAudit &&
        item.methodRefs.length &&
        item.testsRequired.length &&
        item.runtimeAccepted === false,
    ),
  );
  assert(
    record.findings.every(
      (item) => item.runtimeFixed === false && item.target && item.authority,
    ),
  );
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const review = buildSystemCommandReview();
  if (process.argv.includes("--json")) console.log(JSON.stringify(review));
  else {
    if (process.argv.includes("--check"))
      checkSystemCommandReview(
        JSON.parse(read("docs/zeus/z0-system-command-review.json")),
        review,
      );
    console.log(
      JSON.stringify({
        contracts: review.contracts.length,
        localMethodReferences: review.methods.length,
        findings: review.findings.length,
        allNonReadRoutesClassified: 104,
        phaseAccepted: false,
        runtimeAccepted: false,
      }),
    );
  }
}
