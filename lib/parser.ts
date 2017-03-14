/// <reference types="node" />

import * as ramda from 'ramda';
import * as fs from 'fs';
import * as esprima from 'esprima';
import * as ESTree from 'estree';

function flatten<T>(listOfLists: T[][]): T[] {
    return listOfLists.reduce((results, i) => results.concat(i), []);
}

function isNode(node) {
    return node && node.type && typeof(node.type) === 'string';
}

function id(node: ESTree.Node): string {
    let s = node.loc.start;
    let e = node.loc.end;
    return `${node.type}:${s.line}:${s.column}:${e.line}:${e.column}`;
}

export class Jst {
    index: {string: ESTree.Node};
    parent: {};

    constructor() {
        this.index = {} as {string: ESTree.Node};
        this.parent = {};
    }

    parse(src: string, option): boolean {
        const idx = (node: ESTree.Node, parentId: string) => {
            // 要用 this，所以必須用 arrow function
            let _id = id(node);
            this.index[_id] = node;
            if (parentId) {
                this.parent[_id] = parentId;
            }
            flatten(ramda.values(node).map(v => v instanceof Array ? v : [v]))
            .filter(isNode)
            .forEach(n => idx(n, _id));
        }
        try {
            this.index = {} as {string: ESTree.Node};
            this.parent = {};
            let ast = esprima.parse(src, ramda.assoc('loc', true, option));
            ast.body.forEach(n => idx(n, null));
            return true;
        } catch (e) {
            return false;
        }
    }

    nodes(): ESTree.Node[] {
        return ramda.values(this.index);
    }

    ancestors(node: ESTree.Node): ESTree.Node[] {
        /** 從近到遠 */
        let pid = this.parent[id(node)];
        if (pid) {
            return [this.index[pid]].concat(this.ancestors(this.index[pid]));
        } else {
            return [];
        }
    }
}

export function identifiers(jst: Jst, block: ESTree.Program | ESTree.BlockStatement): ESTree.Identifier[] {
    let items = jst.nodes().filter(n => n.type === 'Identifier') as ESTree.Identifier[];
    if (block) {
        return items
        .filter(i => {
            let ancestors = jst.ancestors(i);
            if (block.type === 'Program') {
                return ! ancestors.some(a => a.type === 'BlockStatement');
            } else {
                return ancestors.filter(a => a.type === 'BlockStatement')[0] === i;
            }
        })
        .filter(i => {
            // MethodDefinition 裡的 params 不算這一層的 Identifier
            let parent = jst.ancestors(i)[0];
            return ! parent || parent.type !== 'FunctionExpression';
        });
    } else {
        return items;
    }
}
