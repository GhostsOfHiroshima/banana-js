import * as ramda from 'ramda';
import * as fs from 'fs';
import * as path from 'path';
import {Node, Identifier, AssignmentExpression, VariableDeclarator} from 'estree';
import {parse, parent, ancestors, descendants} from '../node';
import * as scope from '../scope';
import {findDefinition} from '../identifier';
import * as property from '../property';
import {Optional} from '../../types';

export function isDeclaration(identifier: Identifier): boolean {
    return parent(identifier)
    .map(parent => parent.type === 'VariableDeclarator' && parent.id === identifier)
    .or_else(false);
}

function moduleExport(ast: Node): Optional<Node> {
    let modules = scope.identifiers(ast)
    .filter(m => m.name === 'module')
    .filter(m => ! property.isa(m))
    .filter(m => parent(m).map(n =>
        n.type === 'MemberExpression' &&
        ((n.property.type === 'Identifier' && n.property.name === 'exports') ||
         (n.property.type === 'Literal' && n.property.value === 'exports'))));
    let values = Optional.cat(modules
        .filter(m => parent(m).chain(parent).map(i => i.type === 'AssignmentExpression'))
        .map(m => parent(m).chain(parent).map(i => (i as AssignmentExpression).right))
        .map(v => v.chain(v => v.type === 'Identifier' ? findDefinition(v) : Optional.of(v))));
    return Optional.of(ramda.head(values));
}

function resolve(expression: Node): Optional<Node> {
    if (expression.type === 'CallExpression') {
        if (expression.callee.type === 'Identifier' && expression.callee.name === 'require' && expression.arguments.length > 0) {
            let fpath = expression.arguments[0];
            if (fpath.type === 'Literal' && typeof(fpath.type) === 'string') {
                // todo: refine _path, .js
                let curDir = path.dirname(ramda.last(ancestors(expression))['_path']);
                let srcPath = path.join(curDir, fpath.value as string) + '.js';
                let src = fs.readFileSync(srcPath, 'utf-8');
                return parse(src, Optional.of(srcPath), {})
                .map(ast => moduleExport(ast).or_else(ast))
                .either(e => Optional.empty(), m => Optional.of(m));
            } else {
                return Optional.empty();
            }
        } else {
            return Optional.empty();
        }
    } else if (expression.type === 'MemberExpression') {
        if (expression.property.type === 'Identifier') {
            return resolve(expression.object)
            .chain(host => property.value((expression.property as Identifier).name, host));
        } else {
            return Optional.empty();
        }
    } else {
        return Optional.empty();
    }
}

export function definition(declaration: Identifier): Optional<Node> {
    try {
        return parent(declaration)
        .chain(p => resolve((p as VariableDeclarator).init));
    } catch(e) {
        return Optional.empty();
    }
}

export function propertyValueGetter(propertyName: string, host: Node): Optional<Node> {
    let values = scope.identifiers(host)
    .filter(i => i.name === 'exports' && ! property.isa(i))
    .filter(i => parent(i).map(p =>
        p.type === 'MemberExpression' &&
        p.object === i &&
        ((p.property.type === 'Identifier' && p.property.name === propertyName) ||
         (p.property.type === 'Literal' && p.property.value === propertyName)))
        .or_else(false))
    .filter(i => parent(i).chain(parent).map(i => i.type === 'AssignmentExpression' && i.left === parent(i).or_else(null)))
    .map(i =>
        parent(i)
        .chain(parent)
        .map(i => (i as AssignmentExpression).right)
        .chain(v => v.type === 'Identifier' ? findDefinition(v) : Optional.of(v)));
    return Optional.of(ramda.head(Optional.cat(values)));
}
