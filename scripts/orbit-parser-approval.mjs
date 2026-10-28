import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { inverseSecurityInput } from './orbit-security-approval.mjs';

// Owner approval 2026-10-25: exactly body-parser 2.4.0 and its own
// content-type 2.1.0 / qs 6.16.1. Fixed Orbit baseline is NOT moved.
export const parserPins = {
  "apps/api/package.json": {
    before: "09c73d8559eba358488665800627b5f21d4c171d4a4681bcb58e3cc60dfc5861",
    after: "7e0f7f7ce369dbb8f9b05b56d6ca70310d2f77faa8e7fd8b94f25b77f67181be",
  },
  "apps/api/package-lock.json": {
    before: "109a27e51f95c5c1f304c33318b3dd010f16e0ad9c3b5ef08fc82bc3f50530f8",
    after: "0b6d3cc527a3aae207c3298ed9e9adb5d745a76e355fd5c6ce763330c8fb0f0d",
  },
};
const previousEntries = {
  "node_modules/body-parser": {
    version: "2.3.0",
    resolved: "https://registry.npmjs.org/body-parser/-/body-parser-2.3.0.tgz",
    integrity:
      "sha512-2cGmJupaNgg+QUwVLAucDuWuoMZ6EX9iHDRswZ5lsNYEmwPaRknMPCLZz07yTzVq/83p4o/wzbDZbBrTvGGTIw==",
    license: "MIT",
    dependencies: {
      bytes: "^3.1.2",
      "content-type": "^2.0.0",
      debug: "^4.4.3",
      "http-errors": "^2.0.1",
      "iconv-lite": "^0.7.2",
      "on-finished": "^2.4.1",
      qs: "^6.15.2",
      "raw-body": "^3.0.2",
      "type-is": "^2.1.0",
    },
    engines: {
      node: ">=18",
    },
    funding: {
      type: "opencollective",
      url: "https://opencollective.com/express",
    },
  },
  "node_modules/body-parser/node_modules/content-type": {
    version: "2.0.0",
    resolved:
      "https://registry.npmjs.org/content-type/-/content-type-2.0.0.tgz",
    integrity:
      "sha512-j/O/d7GcZCyNl7/hwZAb606rzqkyvaDctLmckbxLzHvFBzTJHuGEdodATcP3yIRoDrLHkIATJuvzbFlp/ki2cQ==",
    license: "MIT",
    engines: {
      node: ">=18",
    },
    funding: {
      type: "opencollective",
      url: "https://opencollective.com/express",
    },
  },
};
const hash = (value) => createHash("sha256").update(value).digest("hex");
const text = (bytes) => bytes.toString("utf8").replaceAll("\r\n", "\n");

export function matchesParserApproval(path, bytes) {
  bytes = inverseSecurityInput(path, bytes);
  return (
    Boolean(parserPins[path]) && hash(text(bytes)) === parserPins[path].after
  );
}

// Reconstruct only the two previously accepted dependency inputs. All invoice
// domain/assertion/manifest/inherited-lock checks still run on this inverse.
// Unknown bytes are NEVER normalized into approved bytes.
export function inverseParserInput(path, bytes) {
  bytes = inverseSecurityInput(path, bytes);
  const source = text(bytes);
  if (!matchesParserApproval(path, bytes)) return source;
  const data = JSON.parse(source);
  if (path.endsWith("/package.json")) {
    assert.deepEqual(data.overrides["body-parser"], {
      ".": "2.4.0",
      qs: "6.16.1",
    });
    assert.equal(
      data.overrides.qs,
      "6.16.0",
      "Shared qs must remain unchanged.",
    );
    delete data.overrides["body-parser"];
  } else {
    const packages = data.packages;
    assert.equal(packages["node_modules/body-parser"].version, "2.4.0");
    assert.equal(
      packages["node_modules/body-parser/node_modules/content-type"].version,
      "2.1.0",
    );
    assert.equal(
      packages["node_modules/body-parser/node_modules/qs"].version,
      "6.16.1",
    );
    assert.equal(packages["node_modules/qs"].version, "6.16.0");
    for (const [key, value] of Object.entries(previousEntries))
      packages[key] = structuredClone(value);
    delete packages["node_modules/body-parser/node_modules/qs"];
  }
  const inverse = JSON.stringify(data, null, 2) + "\n";
  assert.equal(
    hash(inverse),
    parserPins[path].before,
    "Unrelated manifest/dependency or metadata change.",
  );
  return inverse;
}

export function verifyParserApproval(current) {
  for (const [path, pin] of Object.entries(parserPins)) {
    const bytes = current(path);
    assert.equal(
      matchesParserApproval(path, bytes),
      true,
      "Parser approval drift: " + path,
    );
    assert.equal(hash(inverseParserInput(path, bytes)), pin.before);
  }
}
