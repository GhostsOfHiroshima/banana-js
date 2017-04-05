import * as ramda from 'ramda';
import {Node, Identifier, FunctionDeclaration, FunctionExpression} from 'estree';
import {Optional} from '../types';
import {parent, ancestors, isa as isNode} from './node';

/**
大部份 scope 只是單純的 block。例如 if {...}, class {...}
有些 scope 會有 block 以外的部份。例如 for 迴圈的 init, test, update 或 function 的 params
在這種情況下，scope 會是最外層的 Node。例如 ForStatement / FunctionDeclaration Node
而不是內部的 block

scope 裡的 identifiers 原則上是屬於這個 scope 的，但也有例外，例如 function 的 name 就不屬於這個 scope
*/

type ScopeType = {
    isScope: (node: Node) => boolean,
    willBan: (node: Node) => boolean,

    // 在這個 scope 底下，但不屬於這個 scope 的 identifiers
    outerIdentifiers: (scope: Node) => Identifier[],
}

const functionScopeType: ScopeType = {
    isScope: node => node.type === 'FunctionDeclaration',
    willBan: node => parent(node).map(parent => parent.type === 'FunctionDeclaration').or_else(false),
    outerIdentifiers: scope => [(scope as FunctionDeclaration).id],
}

const functionExpressionScopeType: ScopeType = {
    isScope: node => node.type === 'FunctionExpression',
    willBan: node => parent(node).map(parent => parent.type === 'FunctionExpression').or_else(false),
    outerIdentifiers: (scope: FunctionExpression) => scope.id ? [scope.id] : [],
}

const arrowFunctionScopeType: ScopeType = {
    isScope: node => node.type === 'ArrowFunctionExpression',
    willBan: node => parent(node).map(parent => parent.type === 'ArrowFunctionExpression').or_else(false),
    outerIdentifiers: scope => [],
}

const forScopeType: ScopeType = {
    isScope: node => node.type === 'ForStatement',
    willBan: node => parent(node).map(parent => parent.type === 'ForStatement').or_else(false),
    outerIdentifiers: scope => [],
}

const defaultScopeType: ScopeType = {
    isScope: node => ['Program', 'BlockStatement', 'ClassBody'].some(t => node.type === t),
    willBan: node => false,
    outerIdentifiers: scope => [],
}

const scopeTypes = [
    functionScopeType,
    functionExpressionScopeType,
    arrowFunctionScopeType,
    forScopeType,
    defaultScopeType,
];

export function getScopeType(node: Node): Optional<ScopeType> {
    if (scopeTypes.some(i => i.willBan(node))) {
        return Optional.empty();
    } else {
        let candidates = scopeTypes.filter(i => i.isScope(node));
        return Optional.of(ramda.head(candidates));
    }
}

export function isScope(node: Node): boolean {
    return getScopeType(node).is_present();
}

export function scopes(identifier: Identifier): Node[] {
    return ancestors(identifier)
    .filter(node => getScopeType(node)
        .map(st => ! ramda.contains(identifier, st.outerIdentifiers(node)))
        .or_else(false));
}

export function identifiers(node: Node): Identifier[] {
    /** 查出這個 Node 下面所有的 identifiers，不包含子 Scope 底下的 */
    let children = ramda.flatten(ramda.values(node).map(v => v instanceof Array ? v : [v]))
    .filter(isNode) as Node[];

    return children.reduce((result, child) => {
        if (child.type === 'Identifier') {
            return result.concat([child]);
        } else if (isScope(child)) {
            // 遇到子 scope 就不往下追了。但要子 scope 吐出屬於本層的 identifiers
            return result.concat(getScopeType(child).map(type => type.outerIdentifiers(child)).or_else([]));
        } else {
            return result.concat(identifiers(child));
        }
    }, [] as Identifier[]);
}
