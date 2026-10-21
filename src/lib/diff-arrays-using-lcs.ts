import type { ComparableArray, CompareFunc, RFC6902 } from "../types/index";
import { diffUnknownValues } from "./diff-unknown-values";
import { diff } from "./util/fast-myers-diff";
import { deepEqual } from "./util/deep-equal";
import type {
  AddOperationCandidate,
  OperationCandidate,
  RemoveOperationCandidate,
} from "../types/lcs";

export function diffArraysUsingLcs(
  leftArr: ComparableArray,
  rightArr: ComparableArray,
  compareFunc: CompareFunc,
  path: string = "",
  operations: RFC6902.Operation[] = [],
  shouldDetectMoveOperations = false
): void {
  // Myers approaches quadratic work when the arrays have no common values.
  // For primitive values, Set membership can prove this in linear time.
  // Custom comparators must retain their own equality semantics.
  if (
    compareFunc === deepEqual &&
    isPrimitive(leftArr[0]) &&
    isPrimitive(rightArr[0]) &&
    leftArr[0] !== rightArr[0] &&
    leftArr[leftArr.length - 1] !== rightArr[rightArr.length - 1] &&
    haveNoCommonPrimitiveValues(leftArr, rightArr)
  ) {
    operations.push({ op: "replace", path, value: rightArr });
    return;
  }

  const operationCandidates: OperationCandidate[] = [];

  const fastMyersDiffIterator = diff(leftArr, rightArr, (l, r) =>
    compareFunc(leftArr[l], rightArr[r])
  );

  let totalRemovalsCount = 0;
  let totalAdditionsCount = 0;

  let lcsLength = 0;
  let lcsI = 0;

  for (const diffEntry of fastMyersDiffIterator) {
    let [deleteStart, deleteEnd] = diffEntry;
    const insertStart = diffEntry[2];
    const insertEnd = diffEntry[3];
    const insertLen = insertEnd - insertStart;

    const sourceArrayRemovalBatchStartIdx = deleteStart;

    deleteStart += totalAdditionsCount - totalRemovalsCount;
    deleteEnd += totalAdditionsCount - totalRemovalsCount;

    if (lcsI !== deleteStart) {
      lcsLength += deleteStart - lcsI;
    }
    lcsI = deleteEnd;

    let batchAdditionsCount = 0;
    let batchRemovalsCount = 0;

    let insertIdxShift = 0;
    for (
      let i = 0, deletePos = deleteStart;
      deletePos < deleteEnd;
      i++, deletePos++
    ) {
      if (i >= insertLen) {
        // pure removal
        operationCandidates.push({
          type: "remove",
          shiftedIdx: deletePos,
          // Replaced elements precede the pure removals in this batch.
          sourceArrayRemovalBatchStartIdx:
            sourceArrayRemovalBatchStartIdx + insertLen,
          sourceArrayRemovalBatchPosition: batchRemovalsCount,
        });
        batchRemovalsCount++;
      } else {
        // replace
        operationCandidates.push({
          type: "replace",
          value: rightArr[insertStart + i],
          shiftedIdx: deletePos,
          removedValue: leftArr[sourceArrayRemovalBatchStartIdx + i],
        });
        insertIdxShift++;
      }
    }

    for (let i = insertIdxShift; i < insertLen; i++) {
      operationCandidates.push({
        type: "add",
        value: rightArr[insertStart + i],
        totalShiftedIdx: deleteStart + i,
      });
      batchAdditionsCount++;
    }

    totalAdditionsCount += batchAdditionsCount;
    totalRemovalsCount += batchRemovalsCount;
  }

  if (lcsI < leftArr.length) {
    lcsLength += leftArr.length - lcsI;
  }

  if (lcsLength < 1) {
    operations.push({
      op: "replace",
      path,
      value: rightArr,
    });
    return;
  }

  if (shouldDetectMoveOperations) {
    detectMoveOperations(operationCandidates, compareFunc, leftArr);
  }

  mapOperationCandidatesToOperations(
    operationCandidates,
    operations,
    path,
    compareFunc,
    shouldDetectMoveOperations
  );
}

function isPrimitive(value: unknown): boolean {
  return (
    value === null || (typeof value !== "object" && typeof value !== "function")
  );
}

function haveNoCommonPrimitiveValues(
  left: ComparableArray,
  right: ComparableArray
): boolean {
  const smaller = left.length <= right.length ? left : right;
  const larger = left.length <= right.length ? right : left;
  const values = new Set<unknown>();
  for (const value of smaller) {
    if (!isPrimitive(value)) return false;
    values.add(value);
  }
  for (const value of larger) {
    if (!isPrimitive(value) || values.has(value)) return false;
  }
  return true;
}

function mapOperationCandidatesToOperations(
  operationCandidates: OperationCandidate[],
  outputOperations: RFC6902.Operation[],
  path: string,
  compareFunc: CompareFunc,
  shouldDetectMoveOperations: boolean
) {
  for (let i = 0; i < operationCandidates.length; i++) {
    const candidate = operationCandidates[i];
    switch (candidate.type) {
      case "add": {
        outputOperations.push({
          op: "add",
          path: `${path}/${candidate.totalShiftedIdx}`,
          value: candidate.value,
        });
        break;
      }
      case "remove": {
        const removalIdx =
          candidate.shiftedIdx - candidate.sourceArrayRemovalBatchPosition;

        outputOperations.push({
          op: "remove",
          path: `${path}/${removalIdx}`,
        });
        break;
      }
      case "replace": {
        diffUnknownValues(
          candidate.removedValue,
          candidate.value,
          compareFunc,
          `${path}/${candidate.shiftedIdx}`,
          true,
          outputOperations,
          shouldDetectMoveOperations
        );
        break;
      }
      case "move": {
        outputOperations.push({
          op: "move",
          path: `${path}/${candidate.toShiftedIdx}`,
          from: `${path}/${candidate.fromShiftedIdx}`,
        });
        break;
      }
    }
  }
}

function detectMoveOperations(
  candidates: OperationCandidate[],
  compareFunc: CompareFunc,
  leftArr: ComparableArray
) {
  // Adjacent add/remove pairs can be merged without changing any other edit's
  // coordinates. Crossing another edit would require rebasing its indices.
  for (let i = candidates.length - 1; i > 0; i--) {
    const first = candidates[i - 1];
    const second = candidates[i];
    if (
      !(
        (first.type === "add" && second.type === "remove") ||
        (first.type === "remove" && second.type === "add")
      )
    ) {
      continue;
    }

    const addition = (
      first.type === "add" ? first : second
    ) as AddOperationCandidate;
    const removal = (
      first.type === "remove" ? first : second
    ) as RemoveOperationCandidate;
    const removedValue =
      leftArr[
        removal.sourceArrayRemovalBatchStartIdx +
          removal.sourceArrayRemovalBatchPosition
      ];
    if (!compareFunc(addition.value, removedValue)) continue;

    const removeIndex =
      removal.shiftedIdx - removal.sourceArrayRemovalBatchPosition;
    const addIndex = addition.totalShiftedIdx;
    const addFirst = first.type === "add";
    candidates[i - 1] = {
      type: "move",
      fromShiftedIdx:
        removeIndex - (addFirst && addIndex < removeIndex ? 1 : 0),
      toShiftedIdx: addIndex - (addFirst && removeIndex < addIndex ? 1 : 0),
      value: addition.value,
    };
    candidates.splice(i, 1);
  }
}
