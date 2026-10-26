import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (file) => readFileSync(resolve(root, file), "utf8");
const json = (file) => JSON.parse(read(file));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const meanings = {
  "D2-R01":
    "Customer uses own orders/files/wallet/tickets; can dispute, review and receive output, not browse internal staff profiles. Every action rechecks owner; opt-in public review separate from private feedback.",
  "D2-R02":
    "Executor sees assignments, accepts OR declines with reason/reassignment history, works checklist/messages/output and sees own ledger-derived income/withdrawal. Decline is a separate target gap; not inferred from existing accept endpoint. No public project marketplace.",
  "D2-R03":
    "Support operates ticket queue, meaningful public response, prepared replies/internal notes and versioned first-response SLA; no money/settlement privilege. Operator alias does not add role or impersonation.",
  "D2-R04":
    "Admin conceptual aggregate of Ops/Finance/Super, never all scopes for every admin. User/staff/order/catalog/report/settings/AI control each has explicit command capability, true actor/subject Audit.",
  "D2-P01":
    "Public landing with service entry and preserved content/SEO/CTA; no giant image Hero. Current two-theme design/tokens/motion controls remain shared across new pages.",
  "D2-P02":
    "Mobile login/password+OTP/session flow remains; verified unique email is future identifier, not automatic merging. Standard empty/error/pending and logout/session semantics required.",
  "D2-P03":
    "Registration proves mobile ownership before activation/credential binding; optional email/nonblocking onboarding/collaboration interest never grants executor automatically.",
  "D2-P04":
    "Request and verify OTP are distinct commands; embedded step can satisfy capability without inventing a separate canonical page. Mock/local code is not real SMS acceptance.",
  "D2-P05":
    "Active service list + detail, package/form/outputs and server-controlled price; preserve every current category and all real service links, not a smaller mock catalog.",
  "D2-P06":
    "Target three logical stages information -> requirements -> confirmation/payment; preserve current dynamic form/autosave/files. Fixed-price only can pay at registration; negotiated/formula requires approved quote first (DEC02). Current two-step form not accepted as all target stages implemented.",
  "D2-N01":
    "Customer dashboard/detail/wallet/delivery may share canonical order page/tabs; maintain all actions and customer projection, not duplicate empty pages for file-name parity.",
  "D2-N02":
    "Newly assigned and active work queues, checklist, deliverables, own earnings/withdrawals all preserved. Drawer can deepen view but must not replace canonical navigation or backend assignment checks.",
  "D2-N03":
    "Support dashboard/queue/detail/performance need first public-response vs resolution metrics, prepared replies and private-note exclusion in payload as well as UI.",
  "D2-N04":
    "All admin capabilities retained in scope-specific dashboards/pages/drawers; Super aggregate is not identical to Ops, Finance revenue is not order count, no new role needed.",
  "D2-C01":
    "Session-backed auth, purpose-bound one-time code, rate limits/recovery and cookie security; OTP is identity proof, never admin permission. Preserve existing rotation/reuse protections.",
  "D2-C02":
    "Four primary roles plus existing customer/executor capabilities and three admin scopes, typed commands and safe projections; no generic unguarded role/status setter.",
  "D2-C03":
    "Service/package/form/acceptance/QC definitions managed with versioning and old-order snapshots; parent-scoped mutations, actor Audit and validation. Catalog existence alone not lifecycle parity.",
  "D2-C04":
    "Normal0/urgent30/same-day80 percent from server rules; current estimate nonbinding. Binding quote/version/rounding and DEC05 atomic capacity+hold+payment+deadline remain Z2 target; no promise from a surcharge.",
  "D2-C05":
    "Preserve twenty-state order workflow including quote/QC/revision/dispute; commands enforce actor/owner/version/QC/money and history. No collapse to seven diagram stages or mutable front-end status.",
  "D2-C06":
    "Owned input/output and attachments, MIME/signature/size, quarantine/scan, independent QC/visibility and revocable signed download. Mock scanner/S3 adapter not live acceptance; never public raw storage path.",
  "D2-C07":
    "Append to scoped order conversation, public/internal visibility and owned clean attachment; system-facing context can read order but message may not execute status/payment command.",
  "D2-C08":
    "Ticket may reference owned order/public handler, assignee and private/public messages; explicit transition/reopen/first-response policy, not money powers from ticket claim.",
  "D2-C09":
    "Ledger source of truth, wallet cache, payload-bound idempotent payment/escrow/refund/release/withdrawal. Top-up/spend target DEC06; no balance mutation outside balanced journal, partial remainder explicit Finance.",
  "D2-C10":
    "Transactional Outbox, consent/channel preferences and deduplicated retry/failure evidence; enqueue/sent/displayed distinct. Unknown delivery never success; do not activate real channels.",
  "D2-C11":
    "Role-scoped read-model metrics with denominator/period/unknown, real authorized PDF/XLSX/CSV/RTL export. Audit read/export, minimize PII; no reporting-derived write authority or automatic staff punishment.",
  "D2-C12":
    "Optional future AI-readiness adapter only. Minimized allowlisted context -> proposal -> authorized human; kill switch, no autonomous access/money/status/dispute decision, no live engine/cost until approval.",
  "D2-D01":
    "User identity/verified contact/status with safe projection and historic identifiers; no credentials/password hashes exposed in customer API/export.",
  "D2-D02":
    "Roles box is conceptual authorization data, currently Prisma UserRole enum plus scopes/capabilities, not proof of a separate Roles SQL table. Approved stack preserved; literal consolidation disclosed in Z8.",
  "D2-D03":
    "ServiceLine plus packages/versioned form fields/acceptance/QC; current active catalog separate from immutable order specification/rate snapshot.",
  "D2-D04":
    "Order aggregate with customer/version/financial state/history, twenty states, assignments/milestones; no direct table CRUD from UI.",
  "D2-D05":
    "Requirements are current formResponses + formSnapshot/acceptance snapshot/milestones, not proof of generic cart OrderItems table. Preserve every submitted requirement/attachment, compare semantics and disclose consolidated storage.",
  "D2-D06":
    "OrderFile + owned attachment relationships/checksum/scan/grant lifecycle; per-kind visibility and cleanup retention, not arbitrary shared file table access.",
  "D2-D07":
    "OrderMessage/TicketMessage are separate contexts with sender/time/visibility/attachment; internal notes never customer-visible by payload or export.",
  "D2-D08":
    "Ticket/message/escalation/SLA events, versioned policies for new tickets; historic unknown clock/rating not fabricated or overwritten.",
  "D2-D09":
    "Wallet projection/WalletTransaction + immutable double-entry LedgerAccount/LedgerEntry + idempotency/payment/holds/refunds/withdrawals; conceptual paired box not a one-table requirement.",
  "D2-D10":
    "Private Feedback supports order/team/executor/support/QC rating/complaint/thanks; public review optional, moderated and no internal staff identity. Consolidation is not three literal table acceptance.",
  "D2-D11":
    "ExecutorProfile with internal/vetted_external, onboarding evidence, skills/team/capacity/performance; customer sees public alias/code only, not HR/payroll/risk details.",
  "D2-D12":
    "Typed allowlisted SystemSetting with versions/audit for effective policy; never arbitrary env secrets or runtime live-provider credentials through admin form.",
  "D2-X01":
    "Payment gateway adapter callback/amount/authority/idempotency/reconciliation; real gateway acceptance deferred DEC10. Late successful money explicitly handled, not silent lost funds/commitment/refund.",
  "D2-X02":
    "SMS/OTP adapter with rate/retry/failure boundaries; mock provides local infrastructure only, live recipient/delivery/security acceptance separately deferred.",
  "D2-X03":
    "In-app plus opt-in device Push with revocation/preferences/minimized content; neither missing Push nor live delivery counted complete from existing Outbox.",
  "D2-X04":
    "Email optional contact/channel, verified unique email login separate DEC15; local/mock infrastructure and unsubscribe/consent; no SMTP activated.",
  "D2-X05":
    "Authorized customer receives safe QC-approved deliverable through canonical order detail and revocable download, with correct version/MIME and retry; no public object path or unused token as delivered proof.",
  "D2-X06":
    "Management dashboard + actual PDF and Excel/XLSX targets retained (CSV is not XLSX). Scope/RTL/period/source/PII and authentic export acceptance, not renamed extension.",
  "D2-F01":
    "Customer enters from public pages and authenticates; anonymous catalog read not permission for orders/files/wallet.",
  "D2-F02":
    "Registers needs and can pay fixed definitive service at registration; negotiated service must complete quote acceptance before payment, per DEC02.",
  "D2-F03":
    "System records/processes valid command, idempotency and status history; UI submission is not payment confirmation or transition bypass.",
  "D2-F04":
    "Ops explicitly assigns eligible vetted/internal capacity under lock/version and audits real actor; reassign/decline preserve all prior history and privacy.",
  "D2-F05":
    "Assigned executor accepts/works/checklists/reports/uploads clean file; independent QC before customer delivery. No parallel path directly releases money.",
  "D2-F06":
    "Customer receives/reviews/accepts OR requests bounded revision OR disputes and optional rating; each branch state/owner/QC checked, confirmation modal preserves approved no-unused-note contract.",
  "D2-F07":
    "Support handles tickets before/during/after delivery as needed; diagram sequence does not restrict support to the end or confer refund/settlement authority.",
};

export function buildDiagramReview() {
  const mapping = json("docs/zeus/z0-mappings.json"),
    handoff = json("docs/zeus/z0-execution-contract.json");
  assert.deepEqual(
    Object.keys(meanings).sort(),
    mapping.diagram.elements.map((node) => node.id).sort(),
    "Unreviewed/missing diagram node",
  );
  const imagePath =
    "C:/Users/hamid.kazemi/Desktop/project/نیازت/دیاگرام نیازت.png";
  assert.equal(
    hash(readFileSync(imagePath)),
    mapping.diagram.sha256,
    "Owner diagram changed",
  );
  const explicitRequirementLinks = {
    "D2-D02": ["A09", "ZEUS-V4-001"],
    "D2-X03": ["H04", "H05"],
    "D2-X04": ["H03", "ZEUS-V4-086", "ZEUS-OPS-013"],
  };
  const nodes = mapping.diagram.elements.map((node) => ({
    id: node.id,
    sourceLabel: node.label,
    indexedSubItems: node.subItems,
    meaning: meanings[node.id],
    phases: node.phases,
    codeReferences: node.codeFiles,
    modelReferences: node.modelRefs,
    requirements: [
      ...new Set([
        ...node.requirementRefs,
        ...(explicitRequirementLinks[node.id] ?? []),
      ]),
    ],
    productAccepted: false,
    review: "target-meaning-reviewed",
    subItemLiteralClaim:
      "Indexed subitems include reviewer decompositions, not a claim that every term was literally printed in the image.",
  }));
  const requirementIds = new Set(handoff.packages.map((card) => card.id));
  for (const node of nodes)
    assert(
      node.requirements.length &&
        node.requirements.every((id) => requirementIds.has(id)),
      `Unowned/unknown diagram requirement ${node.id}`,
    );
  const edges = mapping.diagramRelations.edges.map((edge) => {
    const disposition = handoff.diagramDispositions.find(
      (item) => item.id === edge.id,
    );
    assert(disposition, `Missing edge disposition ${edge.id}`);
    return {
      ...edge,
      review: "target-meaning-reviewed-runtime-tests-pending",
      visualDirectionClaim: edge.direction !== "relation-direction-pending",
      meaning: disposition.targetContract,
      authority:
        "Conceptual flow only; individual command guard/owner/state/QC/transaction/Audit needed. No grouped data/output or AI arrow is a permission grant.",
      productAccepted: false,
    };
  });
  return {
    schemaVersion: 1,
    date: "2026-10-25",
    kind: "D2 target-semantic-review",
    diagramPath: imagePath,
    diagramSha256: mapping.diagram.sha256,
    phaseAccepted: false,
    productAccepted: false,
    nodes,
    edges,
    roleActions: mapping.diagramRelations.roleActions.map((action) => ({
      ...action,
      review: "meaning-preserved-test-contract-retained",
      productAccepted: false,
    })),
    literalDeviations: [
      "Roles enum/scope/capability consolidation is not a separate Roles table",
      "Order requirements JSON/snapshots/milestones not a generic cart OrderItems claim",
      "Embedded OTP/delivery do not require duplicate empty canonical pages",
      "Seven conceptual workflow stages preserve all twenty domain states",
      "Three ambiguous arrowheads E15/E16/E20 receive target flow interpretations, no fabricated pixel direction",
      "Diagram color legend identifies concepts, does not replace approved unified site palette/two themes",
    ],
    control:
      "All 51 indexed nodes,135 indexed subitems,30 role actions and28 connector groups have target dispositions; image layout/title/legend are explanatory, not extra product permissions. This accepts semantic planning review only, not feature/runtime/visual parity or live integration.",
  };
}
export function checkDiagramReview(record, expected = buildDiagramReview()) {
  assert.equal(record.phaseAccepted, false);
  assert.equal(record.productAccepted, false);
  assert.deepEqual(record, expected, "Diagram semantic review/source drift");
  assert.equal(record.nodes.length, 51);
  assert.equal(
    record.nodes.reduce(
      (count, node) => count + node.indexedSubItems.length,
      0,
    ),
    135,
  );
  assert.equal(record.edges.length, 28);
  assert.equal(record.roleActions.length, 30);
  for (const id of ["D2-E15", "D2-E16", "D2-E20"])
    assert.equal(
      record.edges.find((edge) => edge.id === id).visualDirectionClaim,
      false,
    );
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const review = buildDiagramReview();
  if (process.argv.includes("--json")) console.log(JSON.stringify(review));
  else {
    if (process.argv.includes("--check"))
      checkDiagramReview(json("docs/zeus/z0-diagram-review.json"), review);
    console.log(
      JSON.stringify({
        nodes: review.nodes.length,
        edges: review.edges.length,
        productAccepted: false,
        phaseAccepted: false,
      }),
    );
  }
}
