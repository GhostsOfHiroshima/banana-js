"use strict";
const ramda = require('ramda');
const types_1 = require('../types');
const node_1 = require('./node');
const functionScopeType = {
    isScope: node => node.type === 'FunctionDeclaration',
    willBan: node => node_1.parent(node).map(parent => parent.type === 'FunctionDeclaration').or_else(false),
    outerIdentifiers: scope => [scope.id],
};
const functionExpressionScopeType = {
    isScope: node => node.type === 'FunctionExpression',
    willBan: node => node_1.parent(node).map(parent => parent.type === 'FunctionExpression').or_else(false),
    outerIdentifiers: (scope) => scope.id ? [scope.id] : [],
};
const arrowFunctionScopeType = {
    isScope: node => node.type === 'ArrowFunctionExpression',
    willBan: node => node_1.parent(node).map(parent => parent.type === 'ArrowFunctionExpression').or_else(false),
    outerIdentifiers: scope => [],
};
const forScopeType = {
    isScope: node => node.type === 'ForStatement',
    willBan: node => node_1.parent(node).map(parent => parent.type === 'ForStatement').or_else(false),
    outerIdentifiers: scope => [],
};
const defaultScopeType = {
    isScope: node => ['Program', 'BlockStatement', 'ClassBody'].some(t => node.type === t),
    willBan: node => false,
    outerIdentifiers: scope => [],
};
const scopeTypes = [
    functionScopeType,
    functionExpressionScopeType,
    arrowFunctionScopeType,
    forScopeType,
    defaultScopeType,
];
function getScopeType(node) {
    if (scopeTypes.some(i => i.willBan(node))) {
        return types_1.Optional.empty();
    }
    else {
        let candidates = scopeTypes.filter(i => i.isScope(node));
        return types_1.Optional.of(ramda.head(candidates));
    }
}
exports.getScopeType = getScopeType;
function isScope(node) {
    return getScopeType(node).is_present();
}
exports.isScope = isScope;
function scopes(identifier) {
    return node_1.ancestors(identifier)
        .filter(node => getScopeType(node)
        .map(st => !ramda.contains(identifier, st.outerIdentifiers(node)))
        .or_else(false));
}
exports.scopes = scopes;
function identifiers(node) {
    /** 查出這個 Node 下面所有的 identifiers，不包含子 Scope 底下的 */
    let children = ramda.flatten(ramda.values(node).map(v => v instanceof Array ? v : [v]))
        .filter(node_1.isa);
    return children.reduce((result, child) => {
        if (child.type === 'Identifier') {
            return result.concat([child]);
        }
        else if (isScope(child)) {
            // 遇到子 scope 就不往下追了。但要子 scope 吐出屬於本層的 identifiers
            return result.concat(getScopeType(child).map(type => type.outerIdentifiers(child)).or_else([]));
        }
        else {
            return result.concat(identifiers(child));
        }
    }, []);
}
exports.identifiers = identifiers;
