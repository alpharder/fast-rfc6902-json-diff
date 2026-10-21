import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import Benchmark from "benchmark";
import * as fastJsonPatch from "fast-json-patch/index.mjs";
import { generateJSONPatch } from "generate-json-patch";
import { create } from "jsondiffpatch";
import { format } from "jsondiffpatch/formatters/jsonpatch";
import { diff, jsonPatchPathConverter } from "just-diff";
import { createPatch } from "rfc6902";
import { compare } from "../dist/index.js";
import { cases, probes, type Case } from "./cases";

const args = process.argv.slice(2);
const validateOnly = args.includes("--validate-only");
const updateReadme = args.includes("--update-readme");
const outputIndex = args.indexOf("--output");
if (
  args.some(
    (arg, index) =>
      !["--validate-only", "--update-readme", "--output"].includes(arg) &&
      !(outputIndex >= 0 && index === outputIndex + 1)
  )
) {
  throw new Error(
    "Usage: benchmark.ts [--validate-only] [--update-readme] [--output results.json]"
  );
}
if (outputIndex >= 0 && !args[outputIndex + 1])
  throw new Error("--output needs a path");
const runtime = typeof Bun === "undefined" ? "node" : "bun";
const output = fileURLToPath(
  new URL(
    outputIndex < 0 ? `results-${runtime}.json` : args[outputIndex + 1],
    import.meta.url
  )
);
if (!output.endsWith(".json")) throw new Error("--output must end in .json");

const hash = (value: unknown) => JSON.stringify(value);
const jsondiffpatchDefault = create({
  arrays: { detectMove: false },
  objectHash: hash,
});
const jsondiffpatchMoves = create({
  arrays: { detectMove: true },
  objectHash: hash,
});
// The built-in just-diff converter joins segments but does not escape '/' or '~'.
const pointer = (path: (string | number)[]) =>
  jsonPatchPathConverter(
    path.map((segment) =>
      String(segment).replace(/~/g, "~0").replace(/\//g, "~1")
    )
  );
const libraries = [
  {
    name: "fast-rfc6902-json-diff",
    run: (c: Case) =>
      compare(c.left, c.right, { detectMoveOperations: !!c.moves }),
  },
  {
    name: "fast-json-patch",
    run: (c: Case) => fastJsonPatch.compare(c.left, c.right),
  },
  { name: "rfc6902", run: (c: Case) => createPatch(c.left, c.right) },
  {
    name: "jsondiffpatch",
    run: (c: Case) =>
      format(
        (c.moves ? jsondiffpatchMoves : jsondiffpatchDefault).diff(
          c.left,
          c.right
        )
      ) ?? [],
  },
  { name: "just-diff", run: (c: Case) => diff(c.left, c.right, pointer) },
  {
    name: "generate-json-patch",
    run: (c: Case) =>
      generateJSONPatch(
        c.left,
        c.right,
        c.moves ? { objectHash: hash } : undefined
      ),
  },
];

type Validation = {
  valid: boolean;
  operations?: number;
  bytes?: number;
  moves?: number;
  error?: string;
};
const cloneInputs = (fixture: Case): Case => ({
  ...fixture,
  left: structuredClone(fixture.left),
  right: structuredClone(fixture.right),
});
function validate(
  library: (typeof libraries)[number],
  fixture: Case
): Validation {
  // Each library gets independent inputs; cloning and patch application are not timed.
  const input = cloneInputs(fixture);
  const before = JSON.stringify(input);
  try {
    const patch = library.run(input);
    assert(Array.isArray(patch), "Expected an operation array");
    const actual = fastJsonPatch.applyPatch(
      structuredClone(input.left),
      patch,
      true
    ).newDocument;
    assert.deepEqual(
      actual,
      input.right,
      "Patch did not produce the target document"
    );
    assert.equal(JSON.stringify(input), before, "Diff mutated its inputs");
    return {
      valid: true,
      operations: patch.length,
      bytes: Buffer.byteLength(JSON.stringify(patch)),
      moves: patch.filter((op) => op.op === "move").length,
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

const conformanceProbes = probes.map((fixture) => ({
  name: fixture.name,
  libraries: Object.fromEntries(
    libraries.map((library) => [library.name, validate(library, fixture)])
  ),
}));
const results = cases.map((fixture) => ({
  name: fixture.name,
  moves: !!fixture.moves,
  inputBytes: Buffer.byteLength(JSON.stringify([fixture.left, fixture.right])),
  libraries: Object.fromEntries(
    libraries.map((library) => [library.name, validate(library, fixture)])
  ),
}));
console.log("Patch validation:");
console.table(
  [...results, ...conformanceProbes].map((result) => ({
    case: result.name,
    ...Object.fromEntries(
      libraries.map((library) => [
        library.name,
        result.libraries[library.name].valid ? "pass" : "FAIL",
      ])
    ),
  }))
);
// A failure in this library is a regression. Competitor failures remain visible per case.
assert(
  [...results, ...conformanceProbes].every(
    (result) => result.libraries[libraries[0].name].valid
  ),
  "Own-library patch validation failed"
);
if (validateOnly) process.exit(0);

let checksum = 0;
for (const [index, fixture] of cases.entries()) {
  const suite = new Benchmark.Suite();
  for (const library of libraries) {
    const result = results[index].libraries[library.name];
    if (!result.valid) continue;
    const input = cloneInputs(fixture);
    suite.add(
      library.name,
      () => {
        checksum ^= library.run(input).length;
      },
      { maxTime: 1, minSamples: 12, minTime: 0.02 }
    );
  }
  suite.on(
    "cycle",
    (event: {
      target: {
        name: string;
        hz: number;
        stats: { rme: number; sample: number[] };
        error?: Error;
      };
    }) => {
      const target = event.target;
      if (target.error) throw target.error;
      Object.assign(results[index].libraries[target.name], {
        hz: target.hz,
        rme: target.stats.rme,
        samples: target.stats.sample.length,
      });
      console.log(
        `${fixture.name} | ${target.name}: ${Math.round(
          target.hz
        ).toLocaleString("en-US")} ops/s ±${target.stats.rme.toFixed(2)}%`
      );
    }
  );
  suite.run();
}

const packageJson = (name: string) =>
  JSON.parse(
    readFileSync(
      new URL(
        name === libraries[0].name
          ? "../package.json"
          : `./node_modules/${name}/package.json`,
        import.meta.url
      ),
      "utf8"
    )
  );
const report = {
  generatedAt: new Date().toISOString(),
  environment: {
    runtime,
    node: process.version,
    bun: typeof Bun === "undefined" ? null : Bun.version,
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
    cpu: os.cpus()[0]?.model,
    logicalCpus: os.cpus().length,
  },
  artifactSha256: createHash("sha256")
    .update(readFileSync(new URL("../dist/index.js", import.meta.url)))
    .digest("hex"),
  versions: Object.fromEntries(
    libraries.map((library) => [
      library.name,
      packageJson(library.name).version,
    ])
  ),
  benchmark: { maxTime: 1, minSamples: 12, minTime: 0.02, checksum },
  settings: {
    inputs:
      "Source and target cloned independently; cloning and patch application are not timed",
    validation:
      "Apply every patch with validation; check target equality and input immutability",
    "fast-rfc6902-json-diff":
      "Caching off; move detection enabled only in rows marked moves enabled",
    jsondiffpatch:
      "JSON.stringify objectHash; JSON Patch formatter included; move detection enabled only in marked rows",
    "just-diff": "JSON Patch path converter with RFC 6901 escaping included",
    "generate-json-patch":
      "Default positional hash; JSON.stringify objectHash in move rows",
  },
  results,
  conformanceProbes,
};
writeFileSync(output, JSON.stringify(report, null, 2) + "\n");

if (updateReadme) {
  const reports = new Map([[runtime, report]]);
  for (const other of ["bun", "node"]) {
    if (other === runtime) continue;
    const filename = `results-${other}.json`;
    const path = new URL(filename, import.meta.url);
    if (!existsSync(path)) continue;
    const data = JSON.parse(readFileSync(path, "utf8"));
    // Never combine measurements of different builds in one comparison.
    if (data.artifactSha256 === report.artifactSha256) reports.set(other, data);
  }
  const names = libraries.map((library) => library.name);
  const documentSizes = new Map(
    cases
      .filter((fixture) => fixture.showDocumentSize)
      .map((fixture) => {
        const source = Math.round(
          Buffer.byteLength(JSON.stringify(fixture.left)) / 1000
        );
        const target = Math.round(
          Buffer.byteLength(JSON.stringify(fixture.right)) / 1000
        );
        return [
          fixture.name,
          source === target ? `${source} kB` : `${source} → ${target} kB`,
        ];
      })
  );
  const sections = ["bun", "node"]
    .filter((name) => reports.has(name))
    .map((name) => {
      const data = reports.get(name)!;
      const title =
        name === "bun"
          ? `Bun ${data.environment.bun}`
          : `Node.js ${data.environment.node.replace(/^v/, "")}`;
      const table = [
        `| Case | **${names[0]}** | ${names.slice(1).join(" | ")} |`,
        `|---|${names.map(() => "---:").join("|")}|`,
        ...data.results.map(
          (row: {
            name: string;
            libraries: Record<string, Validation & { hz: number }>;
          }) => {
            const size = documentSizes.get(row.name);
            const label = size ? `${row.name} (${size})` : row.name;
            return `| ${label} | ${names
              .map((library, index) => {
                const result = row.libraries[library];
                if (!result.valid) return "invalid patch";
                const value = Math.round(result.hz).toLocaleString("en-US");
                return index === 0 ? `**${value}**` : value;
              })
              .join(" | ")} |`;
          }
        ),
      ].join("\n");
      return name === "node"
        ? `<details>\n<summary>${title} benchmarks</summary>\n\n${table}\n\n</details>`
        : `#### ${title}\n\n${table}`;
    });
  const caption = `${report.environment.cpu}, ${report.environment.platform} ${
    report.environment.arch
  }, ${report.generatedAt.slice(
    0,
    10
  )} UTC. Local JSON results include 95% confidence margins, exact versions, patch sizes and validation.`;
  const notes = [
    caption,
    "Document sizes use serialized UTF-8 JSON and are rounded to the nearest kB (1 kB = 1,000 bytes). An arrow shows the source → target size.",
    "Each measurement includes complete JSON Patch generation and any formatter or converter. Every patch is validated against its target before timing. Source and target have no shared references; cloning and patch application are outside the timed region.",
    "Move detection is enabled for this library and `jsondiffpatch` in rows marked “moves enabled”; `generate-json-patch` uses a content hash in those rows. Exact settings are saved with the results. Patch sizes differ: for the disjoint-array case, this library emits one whole-array replacement, while some competitors emit per-item edits.",
  ].join("\n\n");
  const readme = new URL("../README.md", import.meta.url);
  const content = readFileSync(readme, "utf8");
  const marker = /<!-- benchmark:start -->[\s\S]*?<!-- benchmark:end -->/;
  assert(marker.test(content), "README benchmark markers missing");
  writeFileSync(
    readme,
    content.replace(
      marker,
      `<!-- benchmark:start -->\n\nOperations per second; higher is better.\n\n${sections.join(
        "\n\n"
      )}\n\n<details>\n<summary>Benchmark notes</summary>\n\n${notes}\n\n</details>\n\n<!-- benchmark:end -->`
    )
  );
}
console.log(`Saved ${output}`);
