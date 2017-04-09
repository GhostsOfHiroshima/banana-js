"use strict";
const ramda = require('ramda');
const fs = require('fs');
const path = require('path');
const node_1 = require('../node');
const scope = require('../scope');
const identifier_1 = require('../identifier');
const property = require('../property');
const types_1 = require('../../types');
function isDeclaration(identifier) {
    return node_1.parent(identifier)
        .map(parent => parent.type === 'VariableDeclarator' && parent.id === identifier)
        .or_else(false);
}
exports.isDeclaration = isDeclaration;
function moduleExport(ast) {
    let modules = scope.identifiers(ast)
        .filter(m => m.name === 'module')
        .filter(m => !property.isa(m))
        .filter(m => node_1.parent(m).map(n => n.type === 'MemberExpression' &&
        ((n.property.type === 'Identifier' && n.property.name === 'exports') ||
            (n.property.type === 'Literal' && n.property.value === 'exports'))));
    let values = types_1.Optional.cat(modules
        .filter(m => node_1.parent(m).chain(node_1.parent).map(i => i.type === 'AssignmentExpression'))
        .map(m => node_1.parent(m).chain(node_1.parent).map(i => i.right))
        .map(v => v.chain(v => v.type === 'Identifier' ? identifier_1.findDefinition(v) : types_1.Optional.of(v))));
    return types_1.Optional.of(ramda.head(values));
}
function resolve(expression) {
    if (expression.type === 'CallExpression') {
        if (expression.callee.type === 'Identifier' && expression.callee.name === 'require' && expression.arguments.length > 0) {
            let fpath = expression.arguments[0];
            if (fpath.type === 'Literal' && typeof (fpath.type) === 'string') {
                // todo: refine _path, .js
                let curDir = path.dirname(ramda.last(node_1.ancestors(expression))['_path']);
                let srcPath = path.join(curDir, fpath.value) + '.js';
                let src = fs.readFileSync(srcPath, 'utf-8');
                return node_1.parse(src, types_1.Optional.of(srcPath), {})
                    .map(ast => moduleExport(ast).or_else(ast))
                    .either(e => types_1.Optional.empty(), m => types_1.Optional.of(m));
            }
            else {
                return types_1.Optional.empty();
            }
        }
        else {
            return types_1.Optional.empty();
        }
    }
    else if (expression.type === 'MemberExpression') {
        if (expression.property.type === 'Identifier') {
            return resolve(expression.object)
                .chain(host => property.value(expression.property.name, host));
        }
        else {
            return types_1.Optional.empty();
        }
    }
    else {
        return types_1.Optional.empty();
    }
}
function definition(declaration) {
    try {
        return node_1.parent(declaration)
            .chain(p => resolve(p.init));
    }
    catch (e) {
        return types_1.Optional.empty();
    }
}
exports.definition = definition;
function propertyValueGetter(propertyName, host) {
    let values = scope.identifiers(host)
        .filter(i => i.name === 'exports' && !property.isa(i))
        .filter(i => node_1.parent(i).map(p => p.type === 'MemberExpression' &&
        p.object === i &&
        ((p.property.type === 'Identifier' && p.property.name === propertyName) ||
            (p.property.type === 'Literal' && p.property.value === propertyName)))
        .or_else(false))
        .filter(i => node_1.parent(i).chain(node_1.parent).map(i => i.type === 'AssignmentExpression' && i.left === node_1.parent(i).or_else(null)))
        .map(i => node_1.parent(i)
        .chain(node_1.parent)
        .map(i => i.right)
        .chain(v => v.type === 'Identifier' ? identifier_1.findDefinition(v) : types_1.Optional.of(v)));
    return types_1.Optional.of(ramda.head(types_1.Optional.cat(values)));
}
exports.propertyValueGetter = propertyValueGetter;
