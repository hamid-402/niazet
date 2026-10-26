import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildTicketReview,
  classMethodEvidence,
} from "./zeus-z0-ticket-commands.mjs";
import { controllerRoutes } from "./zeus-z0-traceability.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const ts = createRequire(resolve(root, "apps/api/package.json"))("typescript");
const read = (file) =>
  readFileSync(resolve(root, file), "utf8").replaceAll("\r\n", "\n");
const hash = (text) => createHash("sha256").update(text).digest("hex");
const portable = (path) => path.replaceAll("\\", "/");
function parse(text, file) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  assert.equal(source.parseDiagnostics.length, 0, `Invalid TS: ${file}`);
  return source;
}
function localFile(file, specifier) {
  if (!specifier.startsWith(".")) return null;
  const base = portable(resolve(root, dirname(file), specifier));
  const match = [base + ".ts", base + "/index.ts"].find(existsSync);
  assert(match, `Missing local import ${file}: ${specifier}`);
  return portable(match.slice(portable(root).replace(/\/$/, "").length + 1));
}
function imports(source, file) {
  const imported = new Map();
  for (const node of source.statements.filter(ts.isImportDeclaration)) {
    const bindings = node.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const binding of bindings.elements)
      imported.set(binding.name.text, {
        file: localFile(file, node.moduleSpecifier.text),
        name: binding.propertyName?.text ?? binding.name.text,
        module: node.moduleSpecifier.text,
      });
  }
  return imported;
}

// Follow syntactically declared local service calls only. This records source
// and unresolved/external calls, never proves runtime reachability or authority.
export function methodSurface(
  file,
  className,
  methodName,
  visited = new Map(),
) {
  const key = `${file}#${className}.${methodName}`;
  if (visited.has(key)) return visited;
  const text = read(file),
    source = parse(text, file);
  const cls = source.statements.find(
    (node) => ts.isClassDeclaration(node) && node.name?.text === className,
  );
  assert(cls, `Missing class ${key}`);
  const method = cls.members.find(
    (node) =>
      ts.isMethodDeclaration(node) && node.name.getText(source) === methodName,
  );
  assert(method, `Missing method ${key}`);
  const evidence = classMethodEvidence(text, className, methodName, file);
  const imported = imports(source, file),
    injections = new Map();
  for (const ctor of cls.members.filter(ts.isConstructorDeclaration))
    for (const parameter of ctor.parameters) {
      if (parameter.type && ts.isTypeReferenceNode(parameter.type)) {
        const target = imported.get(parameter.type.typeName.getText(source));
        if (target) injections.set(parameter.name.getText(source), target);
      }
    }
  const entry = {
    key,
    file,
    className,
    methodName,
    line: evidence.line,
    hash: evidence.hash,
    calls: [],
    dtos: [],
  };
  visited.set(key, entry);
  for (const parameter of method.parameters)
    if (parameter.type && ts.isTypeReferenceNode(parameter.type)) {
      const type = parameter.type.typeName.getText(source),
        target = imported.get(type);
      if (target?.file && /Dto$/.test(type))
        entry.dtos.push({
          name: target.name,
          file: target.file,
          hash: hash(read(target.file)),
        });
      else if (/Dto$/.test(type))
        entry.dtos.push({ name: type, file, hash: hash(text) });
    }
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const expression = node.expression.getText(source),
        args = node.arguments.map((arg) => arg.getText(source));
      let target = null;
      if (ts.isPropertyAccessExpression(node.expression)) {
        const receiver = node.expression.expression.getText(source),
          name = node.expression.name.text;
        if (receiver === "this")
          target = { file, name: className, methodName: name };
        else if (/^this\.\w+$/.test(receiver)) {
          const injection = injections.get(receiver.slice(5));
          if (injection?.file) target = { ...injection, methodName: name };
        }
      }
      if (target) {
        const targetSource =
          target.file === file ? source : parse(read(target.file), target.file);
        const targetClass = targetSource.statements.find(
          (item) =>
            ts.isClassDeclaration(item) && item.name?.text === target.name,
        );
        if (
          !targetClass?.members.some(
            (item) =>
              ts.isMethodDeclaration(item) &&
              item.name.getText(targetSource) === target.methodName,
          )
        )
          target = null;
      }
      entry.calls.push({
        line:
          source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
        expression,
        arguments: args.map((text) =>
          text.length <= 256
            ? text
            : {
                preview: text.slice(0, 256),
                sha256: hash(text),
                characters: text.length,
                note: "Long callback/object retained by source location and full argument hash, not copied repeatedly.",
              },
        ),
        target: target
          ? `${target.file}#${target.name}.${target.methodName}`
          : null,
        classification: target
          ? "local-declared-method-reference"
          : "external-or-unresolved-or-free-function-needs-contract-review",
      });
      if (target)
        methodSurface(target.file, target.name, target.methodName, visited);
    }
    ts.forEachChild(node, visit);
  }
  visit(method);
  return visited;
}

export function remainingCommandSurface() {
  const remaining = buildTicketReview().facts.routeInventory.remaining;
  return remaining.map((route) => ({
    ...route,
    route: controllerRoutes(read(route.file), route.file).find(
      (item) =>
        `${item.method} ${item.path}` === route.signature &&
        item.className === route.className,
    ),
    surface: [
      ...methodSurface(route.file, route.className, route.handler).values(),
    ],
    runtimeAccepted: false,
  }));
}

export function readSideEffectSurface() {
  function walk(directory) {
    return readdirSync(resolve(root, directory), {
      withFileTypes: true,
    }).flatMap((entry) =>
      entry.isDirectory()
        ? walk(`${directory}/${entry.name}`)
        : [`${directory}/${entry.name}`],
    );
  }
  return walk("apps/api/src")
    .filter((file) => file.endsWith(".controller.ts"))
    .sort()
    .flatMap((file) => controllerRoutes(read(file), file))
    .filter((route) => route.method === "GET")
    .flatMap((route) => {
      const surface = [
        ...methodSurface(route.file, route.className, route.handler).values(),
      ];
      const mutationCandidates = surface.flatMap((method) =>
        method.calls
          .filter(
            (call) =>
              /\.(create|createMany|update|updateMany|upsert|delete|deleteMany|record|signAsync|put|send|notifyUser)$/.test(
                call.expression,
              ) &&
              !/createHash\([\s\S]*\)\s*\.update$/.test(call.expression) &&
              call.expression !== "res.send",
          )
          .map((call) => ({ method: method.key, call })),
      );
      return mutationCandidates.length
        ? [
            {
              signature: `GET ${route.path}`,
              route,
              surface,
              mutationCandidates,
            },
          ]
        : [];
    });
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const rows = remainingCommandSurface();
  if (process.argv.includes("--json")) console.log(JSON.stringify(rows));
  else if (process.argv.includes("--bodies")) {
    const filter = process.argv[process.argv.indexOf("--bodies") + 1];
    const methods = new Map(
      rows
        .filter((row) => !filter || row.file.includes(filter))
        .flatMap((row) => row.surface)
        .map((entry) => [entry.key, entry]),
    );
    for (const item of methods.values())
      console.log(
        `\n${item.key}\n${classMethodEvidence(read(item.file), item.className, item.methodName, item.file).text}`,
      );
  } else
    console.log(
      JSON.stringify({
        routes: rows.length,
        methodReferences: new Set(
          rows.flatMap((row) => row.surface.map((entry) => entry.key)),
        ).size,
        runtimeAccepted: false,
      }),
    );
}
