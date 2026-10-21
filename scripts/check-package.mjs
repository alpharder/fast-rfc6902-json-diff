import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const temp = mkdtempSync(path.join(tmpdir(), "fast-rfc6902-package-"));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const run = (command, args, cwd = temp) =>
  execFileSync(command, args, {
    cwd,
    // npm publish --dry-run exports this flag to lifecycle scripts. The smoke
    // check must still create and install its local tarball inside the temp dir.
    env: { ...process.env, npm_config_dry_run: "false" },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

try {
  // Build is run by check:package. Do not recursively invoke prepack here.
  const [packed] = JSON.parse(
    run(
      npm,
      ["pack", "--ignore-scripts", "--json", "--pack-destination", temp],
      root
    )
  );
  const files = packed.files.map((file) => file.path).sort();
  assert.deepEqual(
    files,
    [
      "LICENSE",
      "README.md",
      "THIRD_PARTY_NOTICES",
      "dist/index.cjs",
      "dist/index.d.cts",
      "dist/index.d.ts",
      "dist/index.js",
      "package.json",
    ].sort()
  );
  assert.equal(packed.name, "fast-rfc6902-json-diff");
  writeFileSync(
    path.join(temp, "package.json"),
    JSON.stringify({ private: true, type: "module" })
  );
  run(npm, [
    "install",
    "--offline",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--package-lock=false",
    path.join(temp, packed.filename),
  ]);
  const packageJson = JSON.parse(
    readFileSync(
      path.join(temp, "node_modules", packed.name, "package.json"),
      "utf8"
    )
  );
  assert.equal(Object.keys(packageJson.dependencies ?? {}).length, 0);
  const assertion = `
    const patch = compare({items:[1,2,3,4]}, {items:[4,1,2,3]}, {detectMoveOperations:true});
    assert.deepEqual(patch, [{op:'move',from:'/items/3',path:'/items/0'}]);
    assert.deepEqual(compare({x:1},{x:2}), [{op:'replace',path:'/x',value:2}]);
  `;
  run(process.execPath, [
    "--input-type=module",
    "-e",
    `import assert from 'node:assert/strict'; import {compare} from '${packed.name}'; ${assertion}`,
  ]);
  run(process.execPath, [
    "--input-type=commonjs",
    "-e",
    `const assert = require('node:assert/strict'); const {compare} = require('${packed.name}'); ${assertion}`,
  ]);
  // Exercise the same positive and @ts-expect-error cases against the actual
  // packed declarations under both the import and require export conditions.
  const consumer = readFileSync(
    path.join(root, "type-tests/compare.ts"),
    "utf8"
  );
  for (const extension of ["mts", "cts"])
    writeFileSync(path.join(temp, `consumer.${extension}`), consumer);
  run(process.execPath, [
    path.join(root, "node_modules/typescript/bin/tsc"),
    "--noEmit",
    "--strict",
    "--exactOptionalPropertyTypes",
    "--target",
    "ES2020",
    "--module",
    "NodeNext",
    "--moduleResolution",
    "NodeNext",
    "consumer.mts",
    "consumer.cts",
  ]);
  console.log(
    `Package verified: ${packed.filename}, ${files.length} files, ${(
      packed.size / 1024
    ).toFixed(1)} KiB tarball; ESM, CommonJS and TypeScript consumers pass.`
  );
} catch (error) {
  if (error.stdout) process.stderr.write(error.stdout);
  if (error.stderr) process.stderr.write(error.stderr);
  throw error;
} finally {
  rmSync(temp, { recursive: true, force: true });
}
