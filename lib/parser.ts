/// <reference types="node" />

import * as ramda from 'ramda';
import * as fs from 'fs';
import * as esprima from 'esprima';
import * as ESTree from 'estree';
import {Optional} from './types';
import * as INode from './type/node';
import * as Scope from './type/scope';

/*
object:
* {xxx: 'xxx'}
* method body
* class body
* class instance

identifier.from => identifier | object | expression | value | unknown (左值才有 from)
* function a() {}    a.from === method body
* class A {};        A.from === class body
* let a = A;         a.from === A identifier
* let a = b.c;       a.from === c identifier
* let a = A;         A.from === null
* let a = b+c;       b.from === null
* let a = new A();   a.from === expression
* let a = b();       a.from === expression
* let a = 1+2+3;     a.from === expression
* let a = 'a';       a.from === value
* function x(a) {}   a.from === unknown


identifier.belongTo => identifier | object | expression | value
 * a.b.c:          c.belongTo === b identifier
 * A.b:            b.belongTo === A identifier
 * (new A()).b:    b.belongTo === expression
 * a().b           b.belongTo === expression
 * (1+2+3).b       b.belongTo === expression
 * 'xx'.b          b.belongTo === value

expression.value => object | unknown
* new A()    value === class instance
* a()        value === unknown
* 1+2+3      value === unknown

const A = require('a');
let a = new A();
(new A()).m1();
a.m1();
A.sm1();
A.setting.lang = 'en';
*/

function flatten<T>(listOfLists: T[][]): T[] {
    return listOfLists.reduce((results, i) => results.concat(i), []);
}

export class Jst {
    index: {string: ESTree.Node};
    parentId: {};

    constructor() {
        this.index = {} as {string: ESTree.Node};
        this.parentId = {};
    }

    parse(src: string, option): boolean {
        const idx = (node: ESTree.Node, parentId: string) => {
            // 要用 this，所以必須用 arrow function
            let _id = INode.id(node);
            this.index[_id] = node;
            if (parentId) {
                this.parentId[_id] = parentId;
            }
            flatten(ramda.values(node).map(v => v instanceof Array ? v : [v]))
            .filter(INode.isa)
            .forEach(n => idx(n, _id));
        }
        try {
            this.index = {} as {string: ESTree.Node};
            this.parentId = {};
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
        let pid = this.parentId[INode.id(node)];
        if (pid) {
            return [this.index[pid]].concat(this.ancestors(this.index[pid]));
        } else {
            return [];
        }
    }

    parent(node: ESTree.Node): Optional<ESTree.Node> {
        let pid = this.parentId[INode.id(node)];
        return Optional.of(pid ? this.index[pid] : null);
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
