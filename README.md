# fast-rfc6902-json-diff

**The fastest RFC 6902 JSON diff generator.** Turn two JSON snapshots into standard [RFC 6902 JSON Patch](https://datatracker.ietf.org/doc/html/rfc6902), with compact array edits, optional move detection and zero runtime dependencies.

```typescript
import { compare } from "@alpharder/fast-rfc6902-json-diff";

const before = { items: ["a", "b", "c", "d"] };
const after = { items: ["d", "a", "b", "c"] };

compare(before, after, { detectMoveOperations: true });
// [{ op: "move", from: "/items/3", path: "/items/0" }]
```

## Why this library?

### When you need a JSON diff

A JSON diff compares two versions of a document and describes the changes as instructions you can apply to the older version. Use it when you already have before-and-after objects and need to:

- **Synchronize application state or update a JSON Patch API:** send the changes between document versions.
- **Track edits in document editors, sortable lists and configuration files:** describe which values were added, removed, changed or moved.
- **Build audit logs, document history and undo/redo:** store patches you can replay; compare in reverse to generate an undo patch.

### Why choose this implementation

- **Compact edits when arrays change.** Positional diffing can report changes to every item that shifts after an insertion or reorder. This library matches the unchanged sequence, so inserting one item can produce a single `add`, and moving an existing item can produce a single `move`.
- **The fastest JSON Patch generation.** Optimized for large document updates and array edits on Node.js and Bun. See the benchmarks below.
- **Standard output with zero runtime dependencies.** JSON Patch operations are returned directly and work with existing patch appliers and services accepting `application/json-patch+json`.

**Tested with large, realistic documents.** The [test suite](./src/tests) includes **hundreds of tests** covering deeply nested objects, arrays of objects, multidimensional arrays, duplicate values, escaped keys and moves. It includes real-world document fixtures of around **1 MB**, plus randomized array checks. Fixture tests check the expected operations and verify that applying the generated patch with an independent patch applier reconstructs the target document.

The benchmarks reuse those large document fixtures alongside smaller, focused cases, so the comparison covers realistic document structures as well as individual editing patterns.

## Comparison and benchmarks

### Features

Capabilities below describe **patch generation** in the tested versions.

| Library | JSON Patch output | Array moves | Array strategy | Runtime dependencies |
|---|---|---|---|:---:|
| **[fast-rfc6902-json-diff 1.0.0](https://www.npmjs.com/package/@alpharder/fast-rfc6902-json-diff)** | **Yes** | **Optional** | **Myers / LCS, deep equality** | **0** |
| [fast-json-patch 3.1.1](https://github.com/Starcounter-Jack/JSON-Patch) | Yes | No | Positional | 0 |
| [rfc6902 5.3.0](https://github.com/chbrown/rfc6902) | Yes | No | Levenshtein edit distance | 0 |
| [jsondiffpatch 0.7.6](https://github.com/benjamine/jsondiffpatch) | Via formatter | Yes, including JSON Patch output | LCS; configurable object matching | 1 direct |
| [just-diff 6.0.2](https://github.com/angus-c/just/tree/master/packages/diff) | Via path converter¹ | No | Positional, with array trimming | 0 |
| [generate-json-patch 1.2.9](https://github.com/marcolink/generate-json-patch) | Yes | With suitable `objectHash` | Hash matching / LCS moves | 0 |

¹ `just-diff` needs a converter for JSON Pointer paths; its built-in converter also needs escaping for property names containing `~` or `/`. The benchmark includes that escaping.

### Performance

The same workloads run separately on **Bun and Node.js**.

<!-- benchmark:start -->

Operations per second; higher is better.

#### Bun 1.4.3

| Case | **fast-rfc6902-json-diff** | fast-json-patch | rfc6902 | jsondiffpatch | just-diff | generate-json-patch |
|---|---:|---:|---:|---:|---:|---:|
| Large document, few changes (978 kB) | **1,833** | 861 | 190 | 85 | 152 | 128 |
| Structured document, array changes (60 → 57 kB) | **585,135** | 11,368 | 721 | 6,583 | 22,304 | 7,085 |
| Array replacement (128 items) | **410,005** | 170,500 | 73 | 10,868 | 24,647 | 7,848 |
| Identical small documents (separate objects) | **4,433,554** | 4,386,353 | 1,555,030 | 1,370,795 | 770,617 | 1,982,400 |
| Array append (128 to 144 items) | **629,598** | 172,665 | 157 | 131,094 | 35,771 | 6,455 |
| Array rotation (64 objects) | **215,948** | 141,767 | 554 | 15,942 | 17,884 | 21,604 |
| Array rotation, moves enabled | **189,835** | 144,437 | 510 | 15,368 | 17,347 | 18,493 |
| Nested array rotation, moves enabled | **184,431** | 136,715 | 404 | 14,683 | 13,920 | 18,469 |

<details>
<summary>Node.js 24.22.0 benchmarks</summary>

| Case | **fast-rfc6902-json-diff** | fast-json-patch | rfc6902 | jsondiffpatch | just-diff | generate-json-patch |
|---|---:|---:|---:|---:|---:|---:|
| Large document, few changes (978 kB) | **650** | 527 | 58 | 44 | 62 | 102 |
| Structured document, array changes (60 → 57 kB) | **405,268** | 5,017 | 290 | 3,973 | 13,231 | 4,158 |
| Array replacement (128 items) | **524,727** | 203,339 | 32 | 9,530 | 21,707 | 8,348 |
| Identical small documents (separate objects) | **5,959,872** | 4,606,017 | 585,954 | 835,301 | 611,789 | 1,031,984 |
| Array append (128 to 144 items) | **1,411,947** | 270,244 | 77 | 109,831 | 36,271 | 6,735 |
| Array rotation (64 objects) | **126,693** | 116,505 | 230 | 9,334 | 12,223 | 14,871 |
| Array rotation, moves enabled | **126,808** | 119,327 | 218 | 9,367 | 12,183 | 13,127 |
| Nested array rotation, moves enabled | **122,632** | 117,643 | 178 | 9,441 | 10,116 | 13,502 |

</details>

<details>
<summary>Benchmark notes</summary>

Intel(R) Core(TM) Ultra X7 358H, linux x64, 2026-10-21 UTC. Local JSON results include 95% confidence margins, exact versions, patch sizes and validation.

Document sizes use serialized UTF-8 JSON and are rounded to the nearest kB (1 kB = 1,000 bytes). An arrow shows the source → target size.

Each measurement includes complete JSON Patch generation and any formatter or converter. Every patch is validated against its target before timing. Source and target have no shared references; cloning and patch application are outside the timed region.

Move detection is enabled for this library and `jsondiffpatch` in rows marked “moves enabled”; `generate-json-patch` uses a content hash in those rows. Exact settings are saved with the results. Patch sizes differ: for the disjoint-array case, this library emits one whole-array replacement, while some competitors emit per-item edits.

</details>

<!-- benchmark:end -->

## Install

**Bun**

```bash
bun add @alpharder/fast-rfc6902-json-diff
```

**npm**

```bash
npm install @alpharder/fast-rfc6902-json-diff
```

## Usage

### Compare documents

```typescript
import { compare } from "@alpharder/fast-rfc6902-json-diff";

const patch = compare({ count: 1 }, { count: 2 });
// [{ op: "replace", path: "/count", value: 2 }]
```

### Apply a patch

Use a separate patch applier, such as [fast-json-patch](https://github.com/Starcounter-Jack/JSON-Patch):

```typescript
import { compare } from "@alpharder/fast-rfc6902-json-diff";
import { applyPatch } from "fast-json-patch";

const before = { count: 1 };
const patch = compare(before, { count: 2 });
const { newDocument } = applyPatch(before, patch, true, false);
// newDocument is { count: 2 }; before is unchanged.
```

## API

### `compare(left, right, options?)`

Returns JSON Patch operations that transform `left` into `right`, without mutating either document.

| Parameter | Type | Description |
|---|---|---|
| `left` | JSON value | Source JSON document |
| `right` | JSON value | Target JSON document |
| `options.detectMoveOperations` | `boolean` | Detect equal array elements that moved; default `false` |
| `options.doCaching` | `boolean` | Cache successful deep-equality comparisons within this call; default `false` |

Generated operations: `add`, `remove`, `replace`, and `move` when enabled. Paths use [RFC 6901 JSON Pointer](https://datatracker.ietf.org/doc/html/rfc6901) escaping; `""` addresses the document root. `copy` and `test` are not generated.

Array matching uses deep equality, rather than an `id` field or a custom identity callback. Arrays with no common values can be replaced as a whole. Patch minimality and operation ordering are not API guarantees.

Inputs can be JSON objects, arrays, strings, finite numbers, booleans or `null`. Cycles and non-JSON values such as `undefined`, `BigInt`, `Date`, `Map` and `Set` are outside the supported contract. Operation values can reference `right`; clone the patch if it needs to remain independent of later changes to that document.

TypeScript checks nested fields and accepts ordinary interfaces and readonly arrays. The exported `JsonValue`, `JsonObject` and `JsonArray` types describe JSON data; operation values default to `JsonValue`. Types do not validate untrusted runtime data, cyclic references or non-finite numbers.

ES2020 builds are provided for ESM and CommonJS, with TypeScript declarations. Use them in Node.js, Bun or browser bundles.

```typescript
import { compare, type CompareOptions, type RFC6902 } from "@alpharder/fast-rfc6902-json-diff";

const options: CompareOptions = { detectMoveOperations: true };
const patch: RFC6902.Operation[] = compare({ items: [1, 2] }, { items: [2, 1] }, options);
```

## Development

```bash
bun install --frozen-lockfile
bun run check

# Run Node.js and Bun benchmarks sequentially and update the tables above:
cd benchmark
bun install --frozen-lockfile
bun run benchmark
```

`bun run check` runs type checking, lint, tests, a clean build and installation checks for the packed npm package. Type regression tests use `@ts-expect-error` against both the source and the packed ESM/CommonJS declarations. Use `bun run test:types` for source type checks or `bun run check:package` to check the packed declarations. Benchmarks save exact versions, environment, measurement uncertainty, operation counts and patch sizes in `benchmark/results-{node,bun}.json`; these local files are ignored by Git. To run just one runtime, use `bun run benchmark:node` or `bun run benchmark:bun` inside `benchmark/`.

## License

[MIT](./LICENSE). [Third-party notices](./THIRD_PARTY_NOTICES) are included in the npm package.
