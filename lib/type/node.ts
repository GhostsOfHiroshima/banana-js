import {Node} from 'estree';

export function isa(node) {
    return node && node.type && typeof(node.type) === 'string';
}

export function id(node: Node): string {
    let s = node.loc.start;
    let e = node.loc.end;
    return `${node.type}:${s.line}:${s.column}:${e.line}:${e.column}`;
}
