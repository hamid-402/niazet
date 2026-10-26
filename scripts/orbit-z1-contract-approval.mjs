import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
// ZEUS-EXEC-009: owner-approved Z1 contracts only; no baseline rebase,
// folder waiver, live provider authorization or claim of whole-phase acceptance.
export const z1ContractPins = {
  "apps/api/src/orders/orders.service.ts": {
    "before": "16130dd85df5a3fc8cf6dab8662ecbcf47a1592a68f5b9d5e01426ecb10575aa",
    "after": "76ad7d490602e4e2f75e4fa86495252224a4e8327979157fc0c2ee7b626184c8",
    "originalRef": "2c701d7"
  },
  "apps/api/src/orders/orders.module.ts": {
    "before": "1e898ddb082ca8e2c83d05af4681bc1f9997f126bc80ba57b5b031be3ea15a60",
    "after": "71710acdd6fbf03fa66eaedd84cb161b8ac83a5bd55d63c8687cab059b662f41",
    "originalRef": "2c701d7"
  },
  "apps/api/src/orders/domain/order-workflow.module.ts": {
    "before": null,
    "after": "99caad77b17974abea64245e26a160f5f803f928443cd1ebcb6e6bb09f147fba",
    "originalRef": null
  },
  "apps/api/src/orders/domain/order-workflow.service.spec.ts": {
    "before": null,
    "after": "80b6b877700014731616dd54c11742e1f4235add9782d4b39fb31e4820f38677",
    "originalRef": null
  },
  "apps/api/src/finance/escrow.service.ts": {
    "before": "53e431026d1d55b5bcc53e35937cc8e8892530abc76a8882af0cfce3fd577502",
    "after": "bb695a6cd6b50672a41096080eda84ab1ed1530ee00a16e7ed31278743d93017",
    "originalRef": "2c701d7"
  },
  "apps/api/src/jobs/jobs.service.ts": {
    "before": "624b618a82f0a84894d7e58c3fafb15b871702ea751b0d43274a79d77e4c7cc3",
    "after": "315dc0b2a34a0235323a594b73b96dae50675b975a9767b6259bb23c24bd4750",
    "originalRef": "2c701d7"
  },
  "apps/api/src/auth/auth.service.ts": {
    "before": "a11e2166cf30571d8f03be823558315bdd227a0088f2dda95f866b3876f74dd7",
    "after": "afce9e352c38c83857bf7cda1e8f8dd87abc8d02c8af622712c41151de2ccf4f",
    "originalRef": "2c701d7"
  },
  "apps/api/src/auth/dto/otp.dto.ts": {
    "before": "57279f262e9fddbe0c81f31cbfce1422e35ed4a7807e47254cdf2618bd6c6b6e",
    "after": "c96f3b935f46edf2c12cd48dea4dd55dca81100b5e127de643f47b3b63401935",
    "originalRef": "2c701d7"
  },
  "apps/api/src/auth/registration-proof.ts": {
    "before": null,
    "after": "ea852ca4dbc1c5fee5c28c039e47fa80ec98dec9e90fab921a55ddeb3ab37323",
    "originalRef": null
  },
  "apps/api/src/auth/registration-proof.spec.ts": {
    "before": null,
    "after": "cb333b2822b81018ae721c5feb327401d27cb548d1f5bbbdcc6f9b30116713be",
    "originalRef": null
  },
  "apps/web/src/lib/auth-context.tsx": {
    "before": "6cb0718d8c2a31239cae451b66e3884babeb4cfc9bf66709093b000de1c5dbe4",
    "after": "4b8d2ba9194e8c3050f1824d73819b676356576f615877263908e5a06ee3a6d8",
    "originalRef": "30555d2a26bb5f9a4e1649160751929b5354d1bc"
  },
  "apps/web/src/app/register/page.tsx": {
    "before": "5a52be0da3721c4f79038da974f6bfd5644bbb7c40a63be95656218587c8527b",
    "after": "9bbe597ca17620cfab99201a21dc6bb4c9afdf652e06536d843cae7580143e5d",
    "originalRef": "30555d2a26bb5f9a4e1649160751929b5354d1bc"
  },
  "apps/web/scripts/zeus-registration-runtime.mjs": {
    "before": null,
    "after": "42edd62b30dbcddd54ba0031755185afacf7dcb415e5654b0f2ef6ceb04c2718",
    "originalRef": null
  }
};
const hash = value => createHash('sha256').update(value.toString('utf8').replaceAll('\r\n', '\n')).digest('hex');
export function matchesZ1ContractApproval(path, bytes) {
  return Object.hasOwn(z1ContractPins, path) && hash(bytes) === z1ContractPins[path].after;
}
export function verifyZ1ContractApproval(originalRead, currentRead) {
  for (const [path, pin] of Object.entries(z1ContractPins)) {
    assert(matchesZ1ContractApproval(path, currentRead(path)), 'Z1 contract approval drift: ' + path);
    if (pin.before !== null) assert.equal(hash(originalRead(pin.originalRef, path)), pin.before, 'Z1 original contract drift: ' + path);
  }
}
