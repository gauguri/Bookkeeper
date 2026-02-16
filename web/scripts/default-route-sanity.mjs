import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const outDir = path.join(root, ".tmp-default-route-test");
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(path.join(outDir, "constants"), { recursive: true });

const moduleSource = fs.readFileSync(path.join(root, "src/constants/modules.ts"), "utf8");
const authzSource = fs.readFileSync(path.join(root, "src/authz.ts"), "utf8");
const authRoutingSource = fs.readFileSync(path.join(root, "src/auth-routing.ts"), "utf8");

const transpile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 }
  }).outputText;

fs.writeFileSync(path.join(outDir, "constants/modules.mjs"), transpile(moduleSource));
fs.writeFileSync(path.join(outDir, "authz.mjs"), transpile(authzSource).replace('./constants/modules', './constants/modules.mjs'));
fs.writeFileSync(
  path.join(outDir, "auth-routing.mjs"),
  transpile(authRoutingSource)
    .replace('./authz', './authz.mjs')
    .replace('./constants/modules', './constants/modules.mjs')
);

const { MODULES } = await import(path.join(outDir, "constants/modules.mjs"));
const { getDefaultRoute } = await import(path.join(outDir, "auth-routing.mjs"));

assert.equal(getDefaultRoute({ isAdmin: false, allowedModules: [MODULES.INVOICES] }), "/invoices");
assert.equal(getDefaultRoute({ isAdmin: false, allowedModules: [MODULES.SALES_REQUESTS] }), "/sales-requests");
assert.equal(getDefaultRoute({ isAdmin: false, allowedModules: [] }), "/no-access");

console.log("default route sanity checks passed");
fs.rmSync(outDir, { recursive: true, force: true });
