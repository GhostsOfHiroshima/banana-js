"use strict";
function toEstreePosition(position) {
    return {
        line: position.row + 1,
        column: position.column,
    };
}
exports.toEstreePosition = toEstreePosition;
