import { diffObjects } from "./diff-objects";
import { diffArrays } from "./diff-arrays";
import type {
  RFC6902,
  CompareFunc,
  JsonValue,
  JsonArray,
  JsonObject,
} from "../types/index";

export function diffUnknownValues(
  leftVal: JsonValue,
  rightVal: JsonValue,
  compareFunc: CompareFunc,
  path = "",
  rightValExists = false,
  operations: RFC6902.Operation[] = [],
  detectMoveOperations = false
) {
  if (leftVal === rightVal) {
    return;
  }

  if (!rightValExists && leftVal !== undefined && rightVal === undefined) {
    operations.push({
      op: "remove",
      path,
    });
    return;
  }

  let ctor;

  if (
    leftVal &&
    rightVal &&
    (ctor = leftVal.constructor) === rightVal.constructor
  ) {
    if (ctor === Array) {
      diffArrays(
        leftVal as JsonArray,
        rightVal as JsonArray,
        compareFunc,
        path,
        operations,
        detectMoveOperations
      );
      return;
    }

    if (!ctor || typeof leftVal === "object") {
      diffObjects(
        leftVal as JsonObject,
        rightVal as JsonObject,
        compareFunc,
        path,
        operations,
        detectMoveOperations
      );
      return;
    }
  }

  operations.push({
    op: "replace",
    path,
    value: rightVal,
  });
}
