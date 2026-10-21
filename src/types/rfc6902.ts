import type { JsonCompatible, JsonValue } from "./json";

type BaseOperation = {
  path: string;
};

export type AddOperation<T = JsonValue> = BaseOperation & {
  op: "add";
  value: T & JsonCompatible<T>;
};

export type RemoveOperation = BaseOperation & {
  op: "remove";
};

export type ReplaceOperation<T = JsonValue> = BaseOperation & {
  op: "replace";
  value: T & JsonCompatible<T>;
};

export type MoveOperation = BaseOperation & {
  op: "move";
  from: string;
};

export type CopyOperation = BaseOperation & {
  op: "copy";
  from: string;
};

export type TestOperation<T = JsonValue> = BaseOperation & {
  op: "test";
  value: T & JsonCompatible<T>;
};

export type Operation<T = JsonValue> =
  | AddOperation<T>
  | RemoveOperation
  | ReplaceOperation<T>
  | MoveOperation
  | CopyOperation
  | TestOperation<T>;
