export * as RFC6902 from "./rfc6902";
export type {
  JsonPrimitive,
  JsonObject,
  JsonArray,
  JsonValue,
  JsonCompatible,
} from "./json";

import type { JsonArray, JsonObject, JsonValue } from "./json";

export type ComparableRecord = JsonObject;
export type ComparableArray = JsonArray;
export type ComparableValue = JsonValue;
export type CompareOptions = {
  detectMoveOperations?: boolean;
  doCaching?: boolean;
};
export type CompareFunc = (ia: JsonValue, ib: JsonValue) => boolean;
