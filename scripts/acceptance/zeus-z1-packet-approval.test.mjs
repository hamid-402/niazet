import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import test from "node:test";
import {
  z1DomainPins,
  matchesZ1DomainApproval,
  verifyZ1DomainApproval,
} from "../orbit-z1-domain-approval.mjs";
import {
  securityPins,
  matchesSecurityApproval,
  verifySecurityApproval,
} from "../orbit-security-approval.mjs";
const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root));
const baseline = (path) =>
  execFileSync("git", ["show", "2c701d7:" + path], {
    cwd: root,
    windowsHide: true,
  });
const requireApi = createRequire(new URL("apps/api/package.json", root));
const requireWeb = createRequire(new URL("apps/web/package.json", root));
const installedVersion = (loader, name) => {
  let folder = dirname(loader.resolve(name));
  for (;;) {
    try {
      const pkg = JSON.parse(readFileSync(join(folder, "package.json")));
      if (pkg.name === name) return pkg.version;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const parent = dirname(folder);
    assert.notEqual(parent, folder);
    folder = parent;
  }
};

test("all 15 exact Z1 files match while original baseline stays fixed", () => {
  assert.equal(Object.keys(z1DomainPins).length, 15);
  verifyZ1DomainApproval(baseline, read);
});
test("every domain file rejects changed bytes and a missing file", () => {
  for (const path of Object.keys(z1DomainPins)) {
    assert.equal(
      matchesZ1DomainApproval(
        path,
        Buffer.concat([read(path), Buffer.from(" ")]),
      ),
      false,
    );
    assert.throws(() =>
      verifyZ1DomainApproval(baseline, (p) =>
        p === path ? Buffer.from("missing") : read(p),
      ),
    );
    assert.equal(
      matchesZ1DomainApproval(
        path,
        Buffer.from(
          read(path)
            .toString()
            .replaceAll("\r\n", "\n")
            .replaceAll("\n", "\r\n"),
        ),
      ),
      true,
    );
  }
});
test("no folder or unapproved financial/auth command is exempted", () => {
  for (const path of [
    "apps/api/src/auth/auth.service.ts",
    "apps/api/src/finance/escrow.service.ts",
    "apps/api/src/finance/unapproved.ts",
    "apps/api/src/orders/domain/other.ts",
    "__proto__",
    "apps/api/prisma/../schema.prisma",
  ])
    assert.equal(matchesZ1DomainApproval(path, Buffer.from("{}")), false);
});
test("four security inputs reconstruct exact previous checkpoints", () => {
  assert.equal(Object.keys(securityPins).length, 4);
  verifySecurityApproval(read);
  for (const path of Object.keys(securityPins)) {
    assert.equal(
      matchesSecurityApproval(
        path,
        Buffer.concat([read(path), Buffer.from(" ")]),
      ),
      false,
    );
    assert.throws(() =>
      verifySecurityApproval((p) =>
        p === path ? Buffer.from("missing") : read(p),
      ),
    );
  }
});
test("actual installed security-critical versions match approved source locks", () => {
  for (const [loader, packages] of [
    [
      requireApi,
      { "proxy-addr": "2.0.8", multer: "2.5.0", nodemailer: "10.2.1" },
    ],
    [
      requireWeb,
      { next: "16.4.3", sharp: "0.35.5", "eslint-config-next": "16.4.3" },
    ],
  ]) {
    for (const [name, version] of Object.entries(packages))
      assert.equal(installedVersion(loader, name), version);
    if (loader === requireWeb)
      assert.equal(loader("sharp").versions.sharp, packages.sharp);
  }
});
test("upgraded proxy compiler never trusts an outside address for malformed mapped prefix", () => {
  const proxyaddr = requireApi("proxy-addr");
  const request = {
    socket: { remoteAddress: "198.51.100.10" },
    headers: { "x-forwarded-for": "203.0.113.7" },
  };
  for (const range of [
    "::ffff:10.0.0.0/8",
    "10.0.0.0/8",
    "::ffff:10.0.0.0/104",
  ])
    assert.equal(proxyaddr(request, proxyaddr.compile(range)), "198.51.100.10");
});
test("upgraded mailer constructs MIME offline with Unicode/RTL without SMTP", async () => {
  const mailer = requireApi("nodemailer");
  const transport = mailer.createTransport({
    streamTransport: true,
    buffer: true,
  });
  const result = await transport.sendMail({
    from: "local@example.invalid",
    to: "recipient@example.invalid",
    subject: "نیازت — آزمون محلی",
    text: "پیام آزمایشی بدون ارسال واقعی",
    messageId: "<isolated@example.invalid>",
  });
  assert(Buffer.isBuffer(result.message));
  assert.match(
    result.message.toString(),
    /Content-Type: text\/plain; charset=utf-8/i,
  );
  assert.match(
    result.message.toString(),
    /Message-ID: <isolated@example.invalid>/i,
  );
});
test("upgraded multer enforces bounded upload and recovers after malformed multipart", async () => {
  const express = requireApi("express"),
    multer = requireApi("multer");
  const app = express();
  app.post(
    "/upload",
    multer({ limits: { fileSize: 4, files: 1, fields: 1 } }).single("file"),
    (req, res) => res.json({ size: req.file.size }),
  );
  app.use((error, req, res, next) =>
    res
      .status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400)
      .json({ code: error.code ?? "malformed" }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const url = `http://127.0.0.1:${server.address().port}/upload`;
  const upload = async (value) => {
    const body = new FormData();
    body.append("file", new Blob([value]), "file.txt");
    return fetch(url, { method: "POST", body });
  };
  try {
    assert.equal((await upload("12345")).status, 413);
    assert.equal(
      (
        await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "multipart/form-data; boundary=fixture" },
          body: "--fixture\r\nINVALID",
        })
      ).status,
      400,
    );
    const response = await upload("123");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { size: 3 });
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
