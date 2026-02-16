import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const outDir = path.join(root, ".tmp-route-module-test");
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
const { getModuleForPath } = await import(path.join(outDir, "auth-routing.mjs"));

assert.equal(getModuleForPath("/sales"), MODULES.DASHBOARD);
assert.equal(getModuleForPath("/payments"), MODULES.PAYMENTS);
assert.equal(getModuleForPath("/sales/payments"), MODULES.PAYMENTS);
assert.equal(getModuleForPath("/sales/reports"), MODULES.REPORTS);

console.log("route module sanity checks passed");
fs.rmSync(outDir, { recursive: true, force: true });
