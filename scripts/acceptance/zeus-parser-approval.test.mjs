import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  parserPins,
  matchesParserApproval,
  inverseParserInput,
  verifyParserApproval,
} from "../orbit-parser-approval.mjs";
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url));
const hash = (value) => createHash("sha256").update(value).digest("hex");

test("only two exact inputs accepted and inverse reconstructs prior approved bytes", () => {
  assert.equal(Object.keys(parserPins).length, 2);
  verifyParserApproval(read);
  for (const [path, pin] of Object.entries(parserPins))
    assert.equal(hash(inverseParserInput(path, read(path))), pin.before);
});
test("every changed byte and CRLF text normalization is checked", () => {
  for (const path of Object.keys(parserPins)) {
    const bytes = read(path);
    assert.equal(
      matchesParserApproval(path, Buffer.concat([bytes, Buffer.from(" ")])),
      false,
    );
    assert.equal(
      matchesParserApproval(
        path,
        Buffer.from(
          bytes.toString().replaceAll("\r\n", "\n").replaceAll("\n", "\r\n"),
        ),
      ),
      true,
    );
  }
});
test("scope does not authorize source, schema, auth, money, Web or path aliases", () => {
  for (const path of [
    "apps/api/src/main.ts",
    "apps/api/src/auth/auth.service.ts",
    "apps/api/src/finance/ledger.service.ts",
    "apps/api/prisma/schema.prisma",
    "apps/web/package-lock.json",
    "apps/api/package.json/../package.json",
    "__proto__",
  ])
    assert.equal(matchesParserApproval(path, Buffer.from("{}")), false);
});
test("unrelated dependency integrity, deletion or addition fails closed", () => {
  for (const mutate of [
    (lock) => {
      lock.packages["node_modules/qs"].version = "6.16.1";
    },
    (lock) => {
      lock.packages["node_modules/express"].integrity = "different";
    },
    (lock) => {
      delete lock.packages["node_modules/nodemailer"];
    },
    (lock) => {
      lock.packages["node_modules/unapproved"] = { version: "1.0.0" };
    },
  ]) {
    const lock = JSON.parse(read("apps/api/package-lock.json"));
    mutate(lock);
    assert.throws(() =>
      verifyParserApproval((path) =>
        path.endsWith("package-lock.json")
          ? Buffer.from(JSON.stringify(lock, null, 2) + "\n")
          : read(path),
      ),
    );
  }
});
test("global override or script changes do not normalize to approved manifest", () => {
  for (const mutate of [
    (manifest) => {
      manifest.overrides.qs = "6.16.1";
    },
    (manifest) => {
      manifest.scripts.test = "echo no tests";
    },
  ]) {
    const manifest = JSON.parse(read("apps/api/package.json"));
    mutate(manifest);
    const bytes = Buffer.from(JSON.stringify(manifest, null, 2) + "\n");
    assert.equal(matchesParserApproval("apps/api/package.json", bytes), false);
    assert.equal(
      inverseParserInput("apps/api/package.json", bytes),
      bytes.toString(),
    );
  }
});
