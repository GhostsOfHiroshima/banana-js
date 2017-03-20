import * as ramda from 'ramda';
import {Node, Identifier, FunctionDeclaration} from 'estree';
import {Optional} from '../types';
import {Jst} from '../parser';
import * as INode from './node';

/**
大部份 scope 只是單純的 block。例如 if {...}, class {...}
有些 scope 會有 block 以外的部份。例如 for 迴圈的 init, test, update 或 function 的 params
在這種情況下，scope 會是最外層的 Node。例如 ForStatement / FunctionDeclaration Node
而不是內部的 block

scope 裡的 identifiers 原則上是屬於這個 scope 的，但也有例外，例如 function 的 name 就不屬於這個 scope
*/

type ScopeType = {
    isScope: (jst: Jst, node: Node) => boolean,
    willBan: (jst: Jst, node: Node) => boolean,

    // 在這個 scope 底下，但不屬於這個 scope 的 identifiers
    outerIdentifiers: (jst: Jst, scope: Node) => Identifier[],
}

const functionScopeType: ScopeType = {
    isScope: (jst, node) => node.type === 'FunctionDeclaration',
    willBan: (jst, node) => jst.parent(node).map(parent => parent.type === 'FunctionDeclaration').or_else(false),
    outerIdentifiers: (jst, scope) => [(scope as FunctionDeclaration).id],
}

const forScopeType: ScopeType = {
    isScope: (jst, node) => node.type === 'ForStatement',
    willBan: (jst, node) => jst.parent(node).map(parent => parent.type === 'ForStatement').or_else(false),
    outerIdentifiers: (jst, scope) => [],
}

const defaultScopeType: ScopeType = {
    isScope: (jst, node) => ['Program', 'BlockStatement', 'ClassBody'].some(t => node.type === t),
    willBan: (jst, node) => false,
    outerIdentifiers: (jst, scope) => [],
}

const scopeTypes = [
    functionScopeType,
    forScopeType,
    defaultScopeType,
];

export function getScopeType(jst: Jst, node: Node): Optional<ScopeType> {
    if (scopeTypes.some(i => i.willBan(jst, node))) {
        return Optional.empty();
    } else {
        let candidates = scopeTypes.filter(i => i.isScope(jst, node));
        return Optional.of(ramda.head(candidates));
    }
}

export function isScope(jst: Jst, node: Node): boolean {
    return getScopeType(jst, node).is_present();
}

export function scopes(jst: Jst, identifier: Identifier): Node[] {
    return jst.ancestors(identifier).filter(node => isScope(jst, node));
}

export function identifiers(jst: Jst, node: Node): Identifier[] {
    /** 查出這個 Node 下面所有的 identifiers，不包含子 Scope 底下的 */
    let children = ramda.flatten(ramda.values(node).map(v => v instanceof Array ? v : [v]))
    .filter(INode.isa) as Node[];

    return children.reduce((result, child) => {
        if (child.type === 'Identifier') {
            return result.concat([child]);
        } else if (isScope(jst, child)) {
            // 遇到子 scope 就不往下追了。但要子 scope 吐出屬於本層的 identifiers
            return result.concat(getScopeType(jst, child).map(type => type.outerIdentifiers(jst, child)).or_else([]));
        } else {
            return result.concat(identifiers(jst, child));
        }
    }, [] as Identifier[]);
}
