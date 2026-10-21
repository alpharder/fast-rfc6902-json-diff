import {
  compare,
  diffArrays,
  diffArraysUsingLcs,
  diffObjects,
  diffUnknownValues,
  type CompareFunc,
  type JsonArray,
  type JsonObject,
  type JsonValue,
  type RFC6902,
} from "@alpharder/fast-rfc6902-json-diff";

interface Document {
  readonly id: string;
  title?: string;
  settings: { enabled: boolean; tags: readonly string[] };
  children?: readonly Document[];
}

declare const document: Document;
declare const documents: readonly Document[];
declare const json: JsonValue;
declare const array: JsonArray;
declare const object: JsonObject;

compare(document, document);
compare(documents, documents, { detectMoveOperations: true, doCaching: true });
compare(json, json);
compare(array, object);
compare({ nullable: null, mixed: [true, 1, "x", { nested: [] }] }, {});
compare(["a", { count: 1 }] as const, []);
compare(null, false);
compare(1, "1");

const patch: RFC6902.Operation[] = compare(document, document);
for (const operation of patch) {
  if ("value" in operation) {
    const value: JsonValue = operation.value;
    void value;
  }
}
const typedOperation: RFC6902.AddOperation<Document> = {
  op: "add",
  path: "/document",
  value: document,
};
void typedOperation;

// @ts-expect-error Date instances are not JSON values.
compare(new Date(), {});
// @ts-expect-error The target must also contain only JSON values.
compare({}, { createdAt: new Date() });
// @ts-expect-error Nested Map instances are not JSON values.
compare({ items: [{ metadata: new Map<string, string>() }] }, {});
// @ts-expect-error Set instances are not JSON arrays.
compare(new Set<number>(), []);
// @ts-expect-error Regular expressions are not JSON values.
compare({ pattern: /json/ }, {});
// @ts-expect-error Typed arrays must be converted to JSON arrays.
compare(new Uint8Array([1, 2]), []);
// @ts-expect-error Functions are not JSON values.
compare(() => 1, {});
// @ts-expect-error Methods are not JSON properties.
compare({ nested: { toJSON: () => ({ id: 1 }) } }, {});
// @ts-expect-error Constructors are not JSON values.
compare(class Example {}, {});
// @ts-expect-error Undefined is not a JSON document.
compare(undefined, null);
// @ts-expect-error Explicit undefined properties are not JSON values.
compare({ missing: undefined }, {});
// @ts-expect-error Undefined array elements are not JSON values.
compare([1, undefined], []);
// @ts-expect-error BigInt is not a JSON number.
compare({ nested: [1n] }, {});
// @ts-expect-error Symbols are not JSON values.
compare(Symbol("value"), null);
declare const key: unique symbol;
// @ts-expect-error Symbol property names are not JSON keys.
compare({ [key]: "value" }, {});

declare const unvalidated: unknown;
declare const unknownArray: readonly unknown[];
declare const erasedObject: object;
declare const mixedUnion: string | Date;
// @ts-expect-error Untrusted unknown input must be narrowed before comparison.
compare(unvalidated, {});
// @ts-expect-error Unknown values inside objects also need validation.
compare({ nested: unvalidated }, {});
// @ts-expect-error Unknown array elements may contain non-JSON values.
compare(unknownArray, []);
// @ts-expect-error The object type erases information needed to verify JSON data.
compare(erasedObject, {});
// @ts-expect-error Every member of an input union must be JSON-compatible.
compare(mixedUnion, {});

interface InvalidDocument {
  children: InvalidDocument[];
  metadata?: { createdAt: Date };
}
declare const invalid: InvalidDocument;
// @ts-expect-error Recursive interfaces must also have JSON-compatible fields.
compare(invalid, {});

const invalidOperation: RFC6902.Operation = {
  op: "add",
  path: "",
  // @ts-expect-error Default operation values are JSON, not arbitrary unknown data.
  value: new Date(),
};
const invalidGeneric: RFC6902.ReplaceOperation<Date> = {
  op: "replace",
  path: "",
  // @ts-expect-error Generic operation values must also be JSON-compatible.
  value: new Date(),
};
void invalidOperation;
void invalidGeneric;

const equal: CompareFunc = (left, right) => left === right;
diffUnknownValues(json, json, equal);
diffObjects(object, object, equal);
diffArrays(array, array, equal);
diffArraysUsingLcs(array, array, equal);
// @ts-expect-error The lower-level value helper also requires JSON.
diffUnknownValues(new Date(), {}, equal);
// @ts-expect-error The lower-level object helper also requires JSON properties.
diffObjects({ bad: undefined }, {}, equal);
// @ts-expect-error The lower-level array helper also requires JSON elements.
diffArrays([new Date()], [], equal);
// @ts-expect-error The LCS helper also requires JSON elements.
diffArraysUsingLcs([new Set()], [], equal);
