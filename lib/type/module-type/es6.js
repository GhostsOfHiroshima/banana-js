"use strict";
const fs = require('fs');
const path = require('path');
const ramda = require('ramda');
const types_1 = require('../../types');
const node_1 = require('../node');
const identifier_1 = require('../identifier');
function isDeclaration(identifier) {
    return node_1.parent(identifier)
        .chain(node_1.parent)
        .map(p => {
        if (p.type === 'ImportDeclaration') {
            return ramda.contains(identifier, p.specifiers.map(i => i.local));
        }
        else {
            return false;
        }
    })
        .or_else(false);
}
exports.isDeclaration = isDeclaration;
function curDir(node) {
    return path.dirname(ramda.last(node_1.ancestors(node))[node_1.pathField]);
}
function load(curDir, source) {
    const exts = ['.js'];
    let candidates = path.extname(source) === '' ? exts.map(ext => source + ext) : [source];
    return candidates.reduce((m, file) => {
        if (m.is_present()) {
            return m;
        }
        else {
            let srcPath = path.join(curDir, file);
            let txt = fs.readFileSync(srcPath, 'utf-8');
            return node_1.parse(txt, types_1.Optional.of(srcPath), {})
                .either(err => types_1.Optional.empty(), ast => types_1.Optional.of(ast));
        }
    }, types_1.Optional.empty());
}
function getExport(module, exportName) {
    function definition(node) {
        if (node.declaration) {
            if (node.declaration.type === 'FunctionDeclaration' || node.declaration.type === 'ClassDeclaration') {
                if (node.declaration.id.name === exportName) {
                    return types_1.Optional.of(node.declaration);
                }
                else {
                    return types_1.Optional.empty();
                }
            }
            else if (node.declaration.type === 'VariableDeclaration') {
                let matchs = node.declaration.declarations
                    .filter(i => i.id.type === 'Identifier' && i.id.name === exportName)
                    .map(i => i.id);
                return types_1.Optional.of(ramda.head(matchs))
                    .chain(m => identifier_1.findDefinition(m));
            }
            else {
                return null;
            }
        }
        else {
            let matchs = node.specifiers
                .filter(i => i.local.name === exportName)
                .map(i => i.local);
            return types_1.Optional.of(ramda.head(matchs))
                .chain(m => identifier_1.findDefinition(m));
        }
    }
    return types_1.Optional.of(ramda.head(types_1.Optional.cat(module.body.filter(i => i.type === 'ExportNamedDeclaration').map(definition))));
}
function getDefaultExport(module) {
    return types_1.Optional.of(ramda.head(module.body.filter(i => i.type === 'ExportDefaultDeclaration')))
        .map(ex => ex.declaration)
        .chain(d => {
        if (d.type === 'Identifier') {
            return identifier_1.findDefinition(d);
        }
        else if (d.type === 'AssignmentExpression') {
            if (d.right.type === 'Identifier') {
                return identifier_1.findDefinition(d.right);
            }
            else {
                return types_1.Optional.of(d.right);
            }
        }
        else {
            return types_1.Optional.of(d);
        }
    });
}
function definition(declaration) {
    return node_1.parent(declaration)
        .chain(specifier => {
        if (ramda.contains(specifier.type, ['ImportSpecifier', 'ImportDefaultSpecifier', 'ImportNamespaceSpecifier'])) {
            let module = node_1.parent(specifier)
                .map((i) => i.source.value)
                .chain(source => load(curDir(specifier), source.toString()));
            if (specifier.type === 'ImportSpecifier') {
                return module.chain(m => getExport(m, specifier.imported.name));
            }
            else if (specifier.type === 'ImportDefaultSpecifier') {
                return module.chain(m => getDefaultExport(m));
            }
            else if (specifier.type === 'ImportNamespaceSpecifier') {
                return module;
            }
            else {
                throw new Error();
            }
        }
        else {
            return types_1.Optional.empty();
        }
    });
}
exports.definition = definition;
function propertyValueGetter(propertyName, host) {
    if (host.type === 'Program') {
        return getExport(host, propertyName);
    }
    else {
        return types_1.Optional.empty();
    }
}
exports.propertyValueGetter = propertyValueGetter;
