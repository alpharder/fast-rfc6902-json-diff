/** JSON data. Numbers must be finite and objects must not contain cycles. */
export type JsonPrimitive = string | number | boolean | null;
export type JsonObject = { readonly [key: string]: JsonValue };
export type JsonArray = readonly JsonValue[];
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

/** Validate named interfaces recursively without requiring an index signature. */
export type JsonCompatible<T> = T extends JsonPrimitive
  ? T
  : T extends (...args: never[]) => unknown
  ? never
  : T extends abstract new (...args: never[]) => unknown
  ? never
  : T extends readonly unknown[]
  ? T extends JsonArray
    ? T
    : { [K in keyof T]: JsonCompatible<T[K]> }
  : T extends object
  ? object extends T
    ? JsonObject
    : Extract<keyof T, symbol> extends never
    ? T extends JsonObject
      ? T
      : { [K in keyof T]: JsonCompatible<T[K]> }
    : never
  : never;
