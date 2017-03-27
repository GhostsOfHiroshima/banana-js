import * as ramda from 'ramda';
import * as esprima from 'esprima';
import {Node} from 'estree';
import {Optional, Result} from '../types';

const parentField = '_parent';
const pathField = '_path';

export function isa(node) {
    return node && node.type && typeof(node.type) === 'string';
}

export function children(node: Node): Node[] {
    let fields = ramda.keys(node).filter(f => f !== parentField);
    return ramda.flatten(fields.map(f => node[f])).filter(isa);
}

export function parent(node: Node): Optional<Node> {
    return node[parentField];
}

export function ancestors(node: Node): Node[] {
    /** 從近到遠 */
    return parent(node)
    .map(p => [p].concat(ancestors(p)))
    .or_else([]);
}

export function descendants(node: Node): Node[] {
    /** 深度優先 */
    return ramda.flatten(children(node).map(child => [child].concat(descendants(child))));
}

type ParseError = {lineNumber: number, column: number, description: string};
export function parse(src: string, path: Optional<string>, option: {}): Result<ParseError, Node> {
    const defaultOpt = {
        sourceType: 'module',
        loc: true,
    };
    function setParent(node: Node, parent: Optional<Node>): void {
        node[parentField] = parent;
        children(node).forEach(child => setParent(child, Optional.of(node)));
    }
    try {
        let ast = esprima.parse(src, ramda.merge(defaultOpt, option));
        setParent(ast, Optional.empty());
        ast[pathField] = path.or_else(null);
        return Result.ok(ast);
    } catch(e) {
        return Result.fail(e);
    }
}
