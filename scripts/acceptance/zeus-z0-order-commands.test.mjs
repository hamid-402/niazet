import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  scanCalls,
  scanOrderStatusWrites,
  classContract,
  jobRegistrations,
  delegationArguments,
  inspectOrderCommands,
  checkCommandReview,
} from "./zeus-z0-order-commands.mjs";

const root = new URL("../../", import.meta.url);
const apiRequire = createRequire(new URL("apps/api/package.json", root));
const read = (path) => readFileSync(new URL(path, root), "utf8");
const record = JSON.parse(read("docs/zeus/z0-order-command-review.json"));
const facts = inspectOrderCommands();

test("thirty-one reviewed commands match real route, delegate, decorators, DTO and source hashes", () => {
  assert.equal(facts.commands.length, 31);
  checkCommandReview(record, facts);
});
test("every write route of the five scoped controllers has a contract", () => {
  assert.equal(facts.scopedWriteRouteCoverage.controllers.length, 5);
  assert.equal(facts.scopedWriteRouteCoverage.writeRoutes.length, 31);
  assert.deepEqual(facts.scopedWriteRouteCoverage.missingRoutes, []);
});

test("executor, QC and manual jobs retain distinct delegates, DTOs and scopes", () => {
  const checklist = facts.commands.find((item) => item.id === "Z0-CMD-24");
  assert(
    checklist.serviceMethod.file.endsWith("/executor/executor.service.ts"),
  );
  assert.equal(checklist.dtoContract.name, "UpdateExecutionChecklistDto");
  const qc = facts.commands.find((item) => item.id === "Z0-CMD-28");
  assert(
    qc.route.classDecorators.includes("@AdminScopes(AdminScope.ops_admin)"),
  );
  assert.equal(qc.nestedDtoContracts[0].name, "QcReviewItemDto");
  const manual = facts.commands.find((item) => item.id === "Z0-CMD-31");
  assert(
    manual.route.classDecorators.includes(
      "@AdminScopes(AdminScope.super_admin)",
    ),
  );
  assert.equal(manual.dtoContract, null);
  assert.deepEqual(manual.controllerMethod.delegatedArguments, [
    "name as JobName",
  ]);
  assert.deepEqual(qc.controllerMethod.delegatedArguments, [
    "id",
    "user.id",
    "dto",
  ]);
});

test("delegation evidence ignores comments and strings and rejects missing/ambiguous calls", () => {
  assert.deepEqual(
    delegationArguments(
      "run(){return this.qc.approve(id,user.id,dto);}",
      "this.qc.approve",
    ),
    ["id", "user.id", "dto"],
  );
  assert.throws(
    () =>
      delegationArguments(
        'run(){/* this.qc.approve(id) */ return "this.qc.approve(id)";}',
        "this.qc.approve",
      ),
    /Missing\/ambiguous/,
  );
  assert.throws(
    () =>
      delegationArguments(
        "run(){this.qc.approve(id);this.qc.approve(id);}",
        "this.qc.approve",
      ),
    /Missing\/ambiguous/,
  );
});

test("twelve literal registrations match the manual allowlist and retain interval/run evidence", () => {
  assert.equal(facts.scheduledJobs.length, 12);
  assert(
    facts.scheduledJobs.every(
      (item) =>
        item.hash.length === 64 &&
        item.intervalExpression &&
        item.runExpression,
    ),
  );
  assert.deepEqual(
    facts.scheduledJobs.map((item) => item.name).sort(),
    facts.allowedJobNames.slice().sort(),
  );
  const one =
    "class X { run(){this.runner.register({name:'one',intervalMs:5 * MINUTE,run:(now)=>this.work(now)});} }";
  assert.equal(jobRegistrations(one)[0].intervalExpression, "5 * MINUTE");
  assert.throws(
    () => jobRegistrations(one.replace("name:'one'", "name:dynamic")),
    /literal/,
  );
  assert.throws(
    () =>
      jobRegistrations(
        one.replace(
          "{name:'one',intervalMs:5 * MINUTE,run:(now)=>this.work(now)}",
          "dynamic",
        ),
      ),
    /Dynamic/,
  );
  assert.throws(
    () =>
      jobRegistrations(
        one.replace(
          "this.runner.register",
          "this.runner.register({name:'one',intervalMs:1,run:fn});this.runner.register",
        ),
      ),
    /Duplicate/,
  );
});

test("missing/duplicated jobs, fabricated acceptance and stale downstream evidence fail closed", () => {
  const missing = structuredClone(record);
  missing.scheduledJobs.pop();
  assert.throws(() => checkCommandReview(missing, facts), /scheduled job/);
  const duplicate = structuredClone(record);
  duplicate.scheduledJobs[1].name = duplicate.scheduledJobs[0].name;
  assert.throws(() => checkCommandReview(duplicate, facts), /scheduled job/);
  const accepted = structuredClone(record);
  accepted.scheduledJobs[0].runtimeAccepted = true;
  assert.throws(
    () => checkCommandReview(accepted, facts),
    /fabricated acceptance/,
  );
  const changed = structuredClone(record);
  changed.facts.downstreamMethods.find((item) => item.name === "decide").hash =
    "stale";
  assert.throws(() => checkCommandReview(changed, facts), /evidence drift/);
});
test("syntactic scan separates explicit true, dynamic forwarding, omitted flag and helper use", () => {
  const calls = scanCalls(
    "class X { async run() { const f=()=>this.transition(id,to,source,actor,note,extra,tx,effect,true); this.workflow.transition(id,to,source,actor,note,extra,tx,effect,allow); this.transition(id,to,source,actor); isCancellable(status); } }",
  );
  assert.deepEqual(
    calls.map((call) => call.disputeFlag),
    ["true", "allow", "omitted", "omitted"],
  );
  assert(calls.every((call) => call.owner === "run"));
});
test("all five explicit resolution flags are confined to the reviewed service method", () => {
  const enabled = facts.scan.explicitDisputeFlagCalls.filter(
    (call) => call.disputeFlag === "true",
  );
  assert.equal(enabled.length, 5);
  assert(
    enabled.every(
      (call) =>
        call.owner === "resolveDispute" &&
        call.file === "apps/api/src/orders/orders.service.ts",
    ),
  );
  assert.equal(facts.scan.helperCallSites.length, 0);
});
test("current extra close action remains visible, not silently treated as D4-approved", () => {
  assert.deepEqual(facts.resolveCaseLabels, [
    "rework",
    "refund_full",
    "refund_partial",
    "release_to_executor",
    "close",
  ]);
  assert(
    record.findings.some(
      (finding) => finding.id === "Z0-CMD-GAP-01" && finding.accepted === false,
    ),
  );
});
test("admin finance scope is allowed for resolve, not automatically for cancel", () => {
  const cancel = facts.commands.find((item) => item.id === "Z0-CMD-02");
  const resolve = facts.commands.find((item) => item.id === "Z0-CMD-04");
  assert(
    cancel.route.methodDecorators.some(
      (value) => value === "@AdminScopes(AdminScope.ops_admin)",
    ),
  );
  assert(
    resolve.route.methodDecorators.some((value) =>
      value.includes("AdminScope.finance_admin"),
    ),
  );
});
test("missing/duplicated contracts and empty acceptance scenarios fail closed", () => {
  assert.throws(() =>
    checkCommandReview(
      { ...record, contracts: record.contracts.slice(1) },
      facts,
    ),
  );
  const duplicate = structuredClone(record);
  duplicate.contracts[1].id = duplicate.contracts[0].id;
  assert.throws(
    () => checkCommandReview(duplicate, facts),
    /Missing\/duplicated/,
  );
  const empty = structuredClone(record);
  empty.contracts[0].testsNeeded = [];
  assert.throws(() => checkCommandReview(empty, facts), /Incomplete/);
});
test("changed evidence or invented phase/runtime acceptance cannot pass", () => {
  const changed = structuredClone(record);
  changed.facts.commands[0].route.methodDecorators = [];
  assert.throws(() => checkCommandReview(changed, facts), /evidence drift/);
  assert.throws(
    () => checkCommandReview({ ...record, phaseAccepted: true }, facts),
    /Cannot accept Z0/,
  );
  const accepted = structuredClone(record);
  accepted.contracts[0].status = "accepted";
  assert.throws(
    () => checkCommandReview(accepted, facts),
    /fabricated acceptance/,
  );
});
test("missing DTO classes and invalid syntax are rejected", () => {
  assert.throws(() => classContract("export class X {}", "Y"), /DTO class/);
  assert.throws(() => scanCalls("class { ????"), /Invalid TypeScript/);
});
test("payment routes retain real rate limits and downstream financial evidence", () => {
  const initiate = facts.commands.find((item) => item.id === "Z0-CMD-13");
  const verify = facts.commands.find((item) => item.id === "Z0-CMD-14");
  assert(
    initiate.route.methodDecorators.some((value) =>
      value.includes("limit: 10"),
    ),
  );
  assert(
    verify.route.methodDecorators.some((value) => value.includes("limit: 15")),
  );
  assert(verify.sourceDocRefs.includes("D3 §12.2/14.2"));
  assert(
    facts.downstreamMethods.some(
      (item) => item.name === "verifyAndSettleInTransaction",
    ),
  );
});
test("direct financial status write is recorded separately from workflow, not hidden", () => {
  assert(
    facts.scan.directOrderStatusWrites.some(
      (item) =>
        item.file === "apps/api/src/finance/payments.service.ts" &&
        item.status === "'paid'",
    ),
  );
  assert(
    facts.scan.directOrderStatusWrites.some(
      (item) =>
        item.file.endsWith("/order-workflow.service.ts") &&
        item.status === "toStatus",
    ),
  );
  const writes = scanOrderStatusWrites(
    "class X { run(){tx.order.updateMany({data:{status:'paid'}});tx.order.update({data:{title:'not status'}});tx.order.update({data:unknown});} }",
  );
  assert.equal(writes.length, 1);
  assert.equal(writes[0].status, "'paid'");
});
test("triage accepted DTO intent and missing case remain an explicit open finding", () => {
  const triage = facts.commands.find((item) => item.id === "Z0-CMD-08");
  assert(
    triage.dtoContract.fields
      .find((item) => item.name === "decision")
      .decorators.some((value) => value.includes("assign_direct")),
  );
  assert(
    record.findings.some(
      (item) => item.id === "Z0-CMD-GAP-04" && item.accepted === false,
    ),
  );
  assert(
    record.findings.some(
      (item) => item.id === "Z0-CMD-GAP-05" && item.accepted === false,
    ),
  );
});

// Execute ONLY the exact four DTO declarations in memory with whitelisted
// validator imports. No service/controller/Prisma/env/DB is loaded or called.
// Characterization of a known gap is not desired-behavior/security acceptance.
apiRequire("reflect-metadata");
const ts = apiRequire("typescript");
const validators = apiRequire("class-validator");
const { plainToInstance } = apiRequire("class-transformer");
const dtoText = read("apps/api/src/orders/dto/order.dto.ts");
const parsed = ts.createSourceFile(
  "dto.ts",
  dtoText,
  ts.ScriptTarget.Latest,
  true,
);
const names = [
  "CancelOrderDto",
  "DisputeOrderDto",
  "ResolveDisputeDto",
  "RevisionRequestDto",
];
const classes = names.map((name) => {
  const found = parsed.statements.find(
    (node) => ts.isClassDeclaration(node) && node.name?.text === name,
  );
  assert(
    found && !found.heritageClauses,
    "Only standalone DTO declarations permitted",
  );
  assert(
    found.members.every(
      (member) => ts.isPropertyDeclaration(member) && !member.initializer,
    ),
    "No executable member/initializer permitted",
  );
  return found.getText(parsed);
});
const imports =
  'import { IsString, IsIn, IsOptional, IsInt, Min, MinLength, IsArray, ArrayMinSize, ArrayUnique } from "class-validator";';
const javascript = ts.transpileModule(imports + "\n" + classes.join("\n"), {
  compilerOptions: {
    target: ts.ScriptTarget.ES2023,
    module: ts.ModuleKind.CommonJS,
    experimentalDecorators: true,
    emitDecoratorMetadata: true,
  },
}).outputText;
const dto = {};
new Function("require", "exports", javascript)((name) => {
  assert.equal(name, "class-validator", "No other dependency may load");
  return validators;
}, dto);
const errors = (name, body) =>
  validators.validateSync(plainToInstance(dto[name], body), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
test("characterization GAP: cancellation currently accepts whitespace-only reason", () =>
  assert.equal(errors("CancelOrderDto", { reason: "   " }).length, 0));
test("characterization GAP: dispute currently accepts blank reason/note", () =>
  assert.equal(
    errors("DisputeOrderDto", { reason: "", note: "   " }).length,
    0,
  ));
test("characterization GAP: rework resolution currently accepts blank note", () =>
  assert.equal(
    errors("ResolveDisputeDto", { resolutionType: "rework", note: "" }).length,
    0,
  ));
test("characterization GAP: revision MinLength(3) does not trim three spaces", () =>
  assert.equal(errors("RevisionRequestDto", { reason: "   " }).length, 0));
test("unknown resolutions, non-string reasons and extra input are still rejected", () => {
  assert(
    errors("ResolveDisputeDto", { resolutionType: "unknown", note: "valid" })
      .length > 0,
  );
  assert(errors("CancelOrderDto", { reason: 123 }).length > 0);
  assert(
    errors("CancelOrderDto", { reason: "valid reason", forceRefund: true })
      .length > 0,
  );
});
