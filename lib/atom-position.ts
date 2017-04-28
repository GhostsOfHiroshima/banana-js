import {Position} from 'estree';

type AtomPosition = {
    row: number,                // 0 base
    column: number,             // 0 base
};

export function toEstreePosition(position: AtomPosition): Position {
    return {
        line: position.row + 1,
        column: position.column,
    };
}
