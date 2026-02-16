import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = path.resolve(process.cwd(), "web");
const outDir = path.join(root, ".tmp-authz-test");
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(path.join(outDir, "constants"), { recursive: true });

const moduleSource = fs.readFileSync(path.join(root, "src/constants/modules.ts"), "utf8");
const authzSource = fs.readFileSync(path.join(root, "src/authz.ts"), "utf8");

const transpile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 }
  }).outputText;

fs.writeFileSync(path.join(outDir, "constants/modules.mjs"), transpile(moduleSource));
fs.writeFileSync(path.join(outDir, "authz.mjs"), transpile(authzSource).replace('./constants/modules', './constants/modules.mjs'));

const { canAccess } = await import(path.join(outDir, "authz.mjs"));
const { MODULES } = await import(path.join(outDir, "constants/modules.mjs"));

assert.equal(canAccess(MODULES.INVOICES, { is_admin: false, allowed_modules: ["INVOICES"] }), true);
assert.equal(canAccess(MODULES.INVOICES, { is_admin: false, allowed_modules: ["SALES_REQUESTS"] }), false);
assert.equal(canAccess(MODULES.INVOICES, { is_admin: true, allowed_modules: [] }), true);

console.log("authz sanity checks passed");
fs.rmSync(outDir, { recursive: true, force: true });
