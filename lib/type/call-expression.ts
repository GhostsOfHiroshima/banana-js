import * as ramda from 'ramda';
import {CallExpression, Node, SourceLocation, Position} from 'estree';
import {Optional} from '../types';
import {descendants} from './node';

function cmp(p1: Position, p2: Position) {
    if (ramda.equals(p1, p2)) {
        return 0;
    } else {
        if (p1.line < p2.line) {
            return 1;
        } else if (p1.line === p2.line) {
            return p1.column < p2.column ? 1 : -1;
        } else {
            return -1;
        }
    }
}

function isIn(pos: Position, loc: SourceLocation): boolean {
    return cmp(loc.start, pos) >= 0 && cmp(pos, loc.end) >= 0;
}

export function getArguments(node: Node): string[] {
    if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') {
        return node.params.map(i => {
            if (i.type === 'Identifier') {
                return i.name;
            } else if (i.type === 'AssignmentPattern') {
                if (i.left.type === 'Identifier') {
                    return i.left.name;
                }
            }
        });
    } else if (node.type === 'MethodDefinition') {
        return node.value.params.map(i => {
            if (i.type === 'Identifier') {
                return i.name;
            } else if (i.type === 'AssignmentPattern') {
                if (i.left.type === 'Identifier') {
                    return i.left.name;
                }
            }
        });
    } else {
        return [];
    }
}

export function callExpression(program: Node, position: Position) {
    let exps = ramda.filter(
        node => node.type === 'CallExpression' && isIn(position, node.loc),
        descendants(program)) as CallExpression[];
    return Optional.of(ramda.last(exps));
}

export function inArgumentsBlock(program: Node, position: Position): boolean {
    return callExpression(program, position)
    .map(callExp => ! isIn(position, callExp.callee.loc))
    .or_else(false);
}
