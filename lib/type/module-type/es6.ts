import * as fs from 'fs';
import * as path from 'path';
import * as ramda from 'ramda';
import {Node, Identifier, ImportDeclaration, Program, ExportNamedDeclaration} from 'estree';
import {Optional} from '../../types';
import {parse, parent, ancestors, pathField} from '../node';
import {findDefinition} from '../identifier';

export function isDeclaration(identifier: Identifier): boolean {
    return parent(identifier)
    .chain(parent)
    .map(p => {
        if (p.type === 'ImportDeclaration') {
            return ramda.contains(identifier, p.specifiers.map(i => i.local));
        } else {
            return false;
        }
    })
    .or_else(false);
}

function curDir(node: Node) {
    return path.dirname(ramda.last(ancestors(node))[pathField]);
}

function load(curDir: string, source: string): Optional<Program> {
    const exts = ['.js'];
    let candidates = path.extname(source) === '' ? exts.map(ext => source + ext) : [source];
    return candidates.reduce((m, file) => {
        if (m.is_present()) {
            return m;
        } else {
            let srcPath = path.join(curDir, file);
            let txt = fs.readFileSync(srcPath, 'utf-8');
            return parse(txt, Optional.of(srcPath), {})
            .either(err => Optional.empty() as Optional<Program>, ast => Optional.of(ast));
        }
    }, Optional.empty() as Optional<Program>);
}

function getExport(module: Program, exportName: string): Optional<Node> {
    function definition(node: ExportNamedDeclaration): Optional<Node> {
        if (node.declaration) {
            if (node.declaration.type === 'FunctionDeclaration' || node.declaration.type === 'ClassDeclaration') {
                if (node.declaration.id.name === exportName) {
                    return Optional.of(node.declaration);
                } else {
                    return Optional.empty();
                }
            } else if (node.declaration.type === 'VariableDeclaration') {
                let matchs = node.declaration.declarations
                .filter(i => i.id.type === 'Identifier' && i.id.name === exportName)
                .map(i => i.id as Identifier);
                return Optional.of(ramda.head(matchs))
                .chain(m => findDefinition(m));
            } else {
                return null;
            }
        } else {
            let matchs = node.specifiers
            .filter(i => i.local.name === exportName)
            .map(i => i.local);
            return Optional.of(ramda.head(matchs))
            .chain(m => findDefinition(m));
        }
    }
    return Optional.of(ramda.head(Optional.cat(module.body.filter(i => i.type === 'ExportNamedDeclaration').map(definition))));
}

function getDefaultExport(module: Program): Optional<Node> {
    return Optional.empty();
}

export function definition(declaration: Identifier): Optional<Node> {
    return parent(declaration)
    .chain(specifier => {
        if (ramda.contains(specifier.type, ['ImportSpecifier', 'ImportDefaultSpecifier', 'ImportNamespaceSpecifier'])) {
            let module = parent(specifier)
            .map((i: ImportDeclaration) => i.source.value)
            .chain(source => load(curDir(specifier), source.toString()));

            if (specifier.type === 'ImportSpecifier') {
                return module.chain(m => getExport(m, specifier.imported.name));
            } else if (specifier.type === 'ImportDefaultSpecifier') {
                return module.chain(m => getDefaultExport(m));
            } else if (specifier.type === 'ImportNamespaceSpecifier') {
                return module;
            } else {
                throw new Error();
            }
        } else {
            return Optional.empty();
        }
    });
}

export function propertyValueGetter(propertyName: string, host: Node): Optional<Node> {
    if (host.type === 'Program') {
        return getExport(host, propertyName);
    } else {
        return Optional.empty();
    }
}
