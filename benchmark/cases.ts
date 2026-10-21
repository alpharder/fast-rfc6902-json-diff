import { realWorldLargeDocumentCases } from "../src/tests/_diff-test-data";

export type Case = {
  name: string;
  left: object;
  right: object;
  moves?: boolean;
  showDocumentSize?: boolean;
};

const items = Array.from({ length: 64 }, (_, id) => ({
  id,
  name: `item-${id}`,
}));
const rotation = [...items.slice(-1), ...items.slice(0, -1)];

export const cases: Case[] = [
  {
    name: "Large document, few changes",
    showDocumentSize: true,
    left: realWorldLargeDocumentCases[0].left,
    right: realWorldLargeDocumentCases[0].right,
  },
  {
    name: "Structured document, array changes",
    showDocumentSize: true,
    left: realWorldLargeDocumentCases[3].left,
    right: realWorldLargeDocumentCases[3].right,
  },
  {
    name: "Array replacement (128 items)",
    left: Array.from({ length: 128 }, (_, i) => i),
    right: Array.from({ length: 128 }, (_, i) => i + 128),
  },
  {
    name: "Identical small documents (separate objects)",
    left: { name: "Alice", items: [1, 2, 3], meta: { active: true } },
    right: { name: "Alice", items: [1, 2, 3], meta: { active: true } },
  },
  {
    name: "Array append (128 to 144 items)",
    left: Array.from({ length: 128 }, (_, i) => i),
    right: Array.from({ length: 144 }, (_, i) => i),
  },
  { name: "Array rotation (64 objects)", left: items, right: rotation },
  {
    name: "Array rotation, moves enabled",
    left: items,
    right: rotation,
    moves: true,
  },
  {
    name: "Nested array rotation, moves enabled",
    left: { data: { items } },
    right: { data: { items: rotation } },
    moves: true,
  },
];

export const probes: Case[] = [
  {
    name: "Escaped JSON Pointer keys",
    left: { "a/b": { "~key": 1 } },
    right: { "a/b": { "~key": 2 } },
  },
  {
    name: "Duplicate array values",
    left: [1, 1, 2],
    right: [1, 2, 1],
    moves: true,
  },
  { name: "Object to array", left: { a: 1 }, right: [1, 2] },
  { name: "Array to object", left: [1, 2], right: { a: 1 } },
];
