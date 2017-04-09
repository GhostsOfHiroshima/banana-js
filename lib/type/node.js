"use strict";
const ramda = require('ramda');
const esprima = require('esprima');
const types_1 = require('../types');
const parentField = '_parent';
exports.pathField = '_path';
function isa(node) {
    return node && node.type && typeof (node.type) === 'string';
}
exports.isa = isa;
function children(node) {
    let fields = ramda.keys(node).filter(f => f !== parentField);
    return ramda.flatten(fields.map(f => node[f])).filter(isa);
}
exports.children = children;
function parent(node) {
    return node[parentField];
}
exports.parent = parent;
function ancestors(node) {
    /** 從近到遠 */
    return parent(node)
        .map(p => [p].concat(ancestors(p)))
        .or_else([]);
}
exports.ancestors = ancestors;
function descendants(node) {
    /** 深度優先 */
    return ramda.flatten(children(node).map(child => [child].concat(descendants(child))));
}
exports.descendants = descendants;
function parse(src, path, option) {
    const defaultOpt = {
        sourceType: 'module',
        loc: true,
        tolerant: true,
        jsx: true,
    };
    function setParent(node, parent) {
        node[parentField] = parent;
        children(node).forEach(child => setParent(child, types_1.Optional.of(node)));
    }
    try {
        let ast = esprima.parse(src, ramda.merge(defaultOpt, option));
        setParent(ast, types_1.Optional.empty());
        ast[exports.pathField] = path.or_else(null);
        return types_1.Result.ok(ast);
    }
    catch (e) {
        return types_1.Result.fail(e);
    }
}
exports.parse = parse;
