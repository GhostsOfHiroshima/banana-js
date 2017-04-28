"use strict";
const ramda = require('ramda');
const types_1 = require('../types');
const node_1 = require('./node');
function cmp(p1, p2) {
    if (ramda.equals(p1, p2)) {
        return 0;
    }
    else {
        if (p1.line < p2.line) {
            return 1;
        }
        else if (p1.line === p2.line) {
            return p1.column < p2.column ? 1 : -1;
        }
        else {
            return -1;
        }
    }
}
function isIn(pos, loc) {
    return cmp(loc.start, pos) >= 0 && cmp(pos, loc.end) >= 0;
}
function getArguments(node) {
    if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') {
        return node.params.map(i => {
            if (i.type === 'Identifier') {
                return i.name;
            }
            else if (i.type === 'AssignmentPattern') {
                if (i.left.type === 'Identifier') {
                    return i.left.name;
                }
            }
        });
    }
    else if (node.type === 'MethodDefinition') {
        return node.value.params.map(i => {
            if (i.type === 'Identifier') {
                return i.name;
            }
            else if (i.type === 'AssignmentPattern') {
                if (i.left.type === 'Identifier') {
                    return i.left.name;
                }
            }
        });
    }
    else {
        return [];
    }
}
exports.getArguments = getArguments;
function callExpression(program, position) {
    let exps = ramda.filter(node => node.type === 'CallExpression' && isIn(position, node.loc), node_1.descendants(program));
    return types_1.Optional.of(ramda.last(exps));
}
exports.callExpression = callExpression;
function inArgumentsBlock(program, position) {
    return callExpression(program, position)
        .map(callExp => !isIn(position, callExp.callee.loc))
        .or_else(false);
}
exports.inArgumentsBlock = inArgumentsBlock;
