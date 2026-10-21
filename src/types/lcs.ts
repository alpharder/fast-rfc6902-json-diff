import type { JsonValue } from "./json";

export type RemoveOperationCandidate = {
  type: "remove";
  sourceArrayRemovalBatchStartIdx: number;
  sourceArrayRemovalBatchPosition: number;
  shiftedIdx: number;
};

export type AddOperationCandidate = {
  type: "add";
  value: JsonValue;
  totalShiftedIdx: number;
};

export type OperationCandidate =
  | RemoveOperationCandidate
  | AddOperationCandidate
  | {
      type: "replace";
      value: JsonValue;
      removedValue: JsonValue;
      shiftedIdx: number;
    }
  | {
      type: "move";
      value: JsonValue;
      fromShiftedIdx: number;
      toShiftedIdx: number;
    };
