import test from "ava";
import { applyPatch } from "fast-json-patch";
import { compare } from "../lib/compare";
import { diffArraysUsingLcs } from "../lib/diff-arrays-using-lcs";
import { deepEqual } from "../lib/util/deep-equal";
import type { JsonArray, JsonValue, RFC6902 } from "../types/index";

const leftItems = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
const rightItems = [{ id: 4 }, { id: 1 }, { id: 2 }, { id: 3 }];

test("JSON primitives and container transitions round-trip at the root", (t) => {
  const values: JsonValue[] = [null, false, true, 0, 42, "", "json", [], {}];
  for (const left of values) {
    for (const right of values) {
      const patch = compare(left, right);
      t.deepEqual(
        applyPatch(structuredClone(left), patch, true).newDocument,
        right
      );
      if (left === right) t.deepEqual(patch, []);
    }
  }
});

test("frozen JSON documents support nested moves without mutation", (t) => {
  const first = Object.freeze({ id: 1 });
  const second = Object.freeze({ id: 2 });
  const third = Object.freeze({ id: 3 });
  const fourth = Object.freeze({ id: 4 });
  const left = Object.freeze({
    items: Object.freeze([first, second, third, fourth]),
  });
  const right = Object.freeze({
    items: Object.freeze([fourth, first, second, third]),
  });
  const patch = compare(left, right, {
    detectMoveOperations: true,
    doCaching: true,
  });
  t.deepEqual(patch, [{ op: "move", from: "/items/3", path: "/items/0" }]);
  t.deepEqual(
    applyPatch(structuredClone(left), patch, true).newDocument,
    right
  );
});

for (const [title, wrap, path] of [
  ["object property", (items: JsonArray) => ({ items }), "/items"],
  ["single-item array", (items: JsonArray) => [items], "/0"],
  [
    "nested escaped property",
    (items: JsonArray) => [{ "a/b": { "~items": items } }],
    "/0/a~1b/~0items",
  ],
] as const) {
  test(`move detection propagates through ${title}`, (t) => {
    const left = wrap(leftItems);
    const right = wrap(rightItems);
    const originalLeft = JSON.stringify(left);
    const originalRight = JSON.stringify(right);
    const patch = compare(left, right, { detectMoveOperations: true });

    t.deepEqual(patch, [{ op: "move", from: `${path}/3`, path: `${path}/0` }]);
    t.deepEqual(
      applyPatch(JSON.parse(originalLeft), patch, true).newDocument,
      right
    );
    t.false(compare(left, right).some((operation) => operation.op === "move"));
    t.is(JSON.stringify(left), originalLeft);
    t.is(JSON.stringify(right), originalRight);
  });
}

test("disjoint primitive arrays produce one replacement", (t) => {
  const left = Array.from({ length: 128 }, (_, i) => i);
  const right = Array.from({ length: 128 }, (_, i) => i + 128);
  for (const options of [
    {},
    { doCaching: true },
    { detectMoveOperations: true },
  ]) {
    const patch = compare({ items: left }, { items: right }, options);
    t.deepEqual(patch, [{ op: "replace", path: "/items", value: right }]);
    t.deepEqual(applyPatch({ items: [...left] }, patch, true).newDocument, {
      items: right,
    });
  }
});

test("primitive membership uses type-sensitive equality and handles null", (t) => {
  t.deepEqual(compare([1, 2, 3], ["1", "2", null]), [
    { op: "replace", path: "", value: ["1", "2", null] },
  ]);
  const patch = compare([1, null, 2], [3, null, 4]);
  t.false(patch.some((operation) => operation.path === ""));
  t.deepEqual(applyPatch([1, null, 2], patch, true).newDocument, [3, null, 4]);
});

test("a common primitive in the middle preserves granular array edits", (t) => {
  const left = [1, 2, 3, 2];
  const right = [4, 2, 5, 2, 6];
  const patch = compare(left, right, { detectMoveOperations: true });
  t.false(patch.some((operation) => operation.path === ""));
  t.deepEqual(applyPatch([...left], patch, true).newDocument, right);
});

test("mixed arrays still match deeply equal objects", (t) => {
  const left = [1, { id: 1 }, 2];
  const right = [3, { id: 1 }, 4];
  const patch = compare(left, right);
  t.false(patch.some((operation) => operation.path === ""));
  t.deepEqual(
    applyPatch(structuredClone(left), patch, true).newDocument,
    right
  );
});

test("custom array comparators retain their equality semantics", (t) => {
  const operations: RFC6902.Operation[] = [];
  diffArraysUsingLcs(
    [1, 2, 3],
    [11, 12, 13],
    (a, b) => Number(a) % 10 === Number(b) % 10,
    "",
    operations
  );
  t.deepEqual(operations, []);
});

test("primitive array edits round-trip with and without equality caching", (t) => {
  let seed = 0x6902;
  const next = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed;
  };
  const pool = [null, false, true, 0, 1, 2, "0", "1", "x"];
  for (let i = 0; i < 200; i++) {
    const left = Array.from(
      { length: next() % 12 },
      () => pool[next() % pool.length]
    );
    const right = Array.from(
      { length: next() % 12 },
      () => pool[next() % pool.length]
    );
    const patch = compare(left, right);
    t.deepEqual(patch, compare(left, right, { doCaching: true }));
    t.deepEqual(applyPatch([...left], patch, true).newDocument, right);
  }
});

test("primitive optimization agrees with generic Myers diff", (t) => {
  const inputs = [
    [
      [1, 2, 3],
      [4, 5],
    ],
    [
      [null, true],
      [false, "x"],
    ],
    [
      [1, 2, 3],
      [3, 2, 1],
    ],
    [
      [1, 1, 2],
      [3, 4, 4],
    ],
  ];
  for (const [left, right] of inputs) {
    const optimized: RFC6902.Operation[] = [];
    const generic: RFC6902.Operation[] = [];
    diffArraysUsingLcs(left, right, deepEqual, "", optimized);
    diffArraysUsingLcs(left, right, (a, b) => deepEqual(a, b), "", generic);
    t.deepEqual(optimized, generic);
  }
});
