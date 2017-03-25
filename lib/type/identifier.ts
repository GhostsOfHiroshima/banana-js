import * as ramda from 'ramda';
import {Node, Identifier} from 'estree';
import {Optional} from '../types';
import * as Scope from './scope';
import {parent} from './node';
import * as property from './property';

/**
### declaration
* 廣義的左值，包括函式或 class 的名稱。一定是 Identifier。

### definition
* 廣義的右值，包括函式定義、ObjectExpression、ClassDeclaration、Literal、Expression...，甚至另一個 Identifier
* 只有 declaration 會有 definition
* 原則上 declaration 都有一個 definition。但函式的參數是例外，參數沒有 definition !!!
* (New A()) 不是 declaration，所以沒有 definition。但他的執行結果是 A instance。

let a = new A();
let aa = a;
definition(aa);    ===> new A(); !!! 注意，這裡不是 A 的定義喔

let a = new A();
let aa = a.ccc;
definition(aa);    ===> A.ccc

let a = new A();
let aa = a.ccc();
definition(aa);    ===> a.ccc();

function a() {};
let aa = a;
definition(aa);    ===> a 的定義

let a = 1 + 2;
let aa = a;
definition(aa);    ===> 1 + 2;
*/

function isDeclaration(identifier: Identifier): boolean {
    const types = ['VariableDeclarator', 'FunctionDeclaration', 'ClassDeclaration'];
    return parent(identifier)
    .map(parent =>
        (types.some(t => parent.type === t) && (parent as any).id === identifier) ||
        (parent.type === 'FunctionDeclaration' && parent.params.some(p => p === identifier)))
    .or_else(false);
}

function findDeclaration(identifier: Identifier): Optional<Identifier> {
    if (isDeclaration(identifier)) {
        return Optional.of(identifier);
    } else {
        return Scope.scopes(identifier).reduce((result, scope) => {
            if (result.is_present()) {
                return result;
            } else {
                return Optional.of(ramda.head(Scope.identifiers(scope).filter(i => i.name === identifier.name && isDeclaration(i))));
            }
        }, Optional.empty());
    }
}

function definition(declaration: Identifier): Optional<Node> {
    return parent(declaration)
    .map(parent => {
        if (parent.type === 'FunctionDeclaration') {
            if (parent.id === declaration) {
                return parent;
            } else {
                return null;
            }
        } else if (parent.type === 'VariableDeclarator') {
            return parent.init;
        } else if (parent.type === 'ClassDeclaration') {
            return parent;
        } else {
            throw new Error(`wrong type`);
        }
    });
}

export function findDefinition(identifier: Identifier): Optional<Node> {
    if (property.isa(identifier)) {
        return property.host(identifier)
        .chain(host => {
            if (host.type === 'Identifier') {
                return findDefinition(host);
            } else {
                return Optional.of(host);
            }
        })
        .chain(host => property.value(identifier.name, host));
    } else {
        return findDeclaration(identifier)
        .chain(declaration => {
            return definition(declaration)
            .chain(def => {
                if (def.type === 'MemberExpression') {
                    if (def.property.type === 'Identifier') {
                        return findDefinition(def.property);
                    } else {
                        return Optional.of(def);
                    }
                } else if (def.type === 'Identifier') {
                    return findDefinition(def);
                } else {
                    return Optional.of(def);
                }
            });
        });
    }
}
