import * as ramda from 'ramda';
import {Node, Literal, Identifier, MemberExpression, ObjectExpression, FunctionDeclaration, ClassDeclaration, MethodDefinition, VariableDeclaration} from 'estree';
import {Optional} from '../types';
import {Jst} from '../parser';
import * as Scope from './scope';
import * as INode from './node';

export function propertyHost(jst: Jst, node: Identifier): Optional<Node> {
    return jst.parent(node)
    .map(parent => {
        if (parent.type === 'MemberExpression' && parent.property === node) {
            return parent.object;
        } else {
            return null;
        }
    });
}

export function isProperty(jst: Jst, node: Identifier): boolean {
    return propertyHost(jst, node).is_present();
}

export function property(propertyName: string, node: ObjectExpression): Optional<Node> {
    return Optional.of(ramda.head(node.properties
    .filter(p =>
        (p.key.type === 'Literal' && p.key.value === propertyName) ||
        (p.key.type === 'Identifier' && p.key.name === propertyName))
    .map(p => p.value)));
}

export function method(methodName: string, node: ClassDeclaration, isStatic: boolean): Optional<MethodDefinition> {
    return Optional.of(ramda.head(node.body.body.filter(m =>
        m.key.type === 'Identifier' &&
        m.key.name === methodName &&
        m.static === isStatic
    )));
}

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

function isDeclaration(jst: Jst, identifier: Identifier): boolean {
    const types = ['VariableDeclarator', 'FunctionDeclaration', 'ClassDeclaration'];
    return jst.parent(identifier)
    .map(parent =>
        (types.some(t => parent.type === t) && (parent as any).id === identifier) ||
        (parent.type === 'FunctionDeclaration' && parent.params.some(p => p === identifier)))
    .or_else(false);
}

function findDeclaration(jst: Jst, identifier: Identifier): Optional<Identifier> {
    if (isDeclaration(jst, identifier)) {
        return Optional.of(identifier);
    } else {
        return Scope.scopes(jst, identifier).reduce((result, scope) => {
            if (result.is_present()) {
                return result;
            } else {
                return Optional.of(ramda.head(Scope.identifiers(jst, scope).filter(i => i.name === identifier.name && isDeclaration(jst, i))));
            }
        }, Optional.empty());
    }
}

function definition(jst: Jst, declaration: Identifier): Optional<Node> {
    return jst.parent(declaration)
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

export function findDefinition(jst: Jst, identifier: Identifier): Optional<Node> {
    if (isProperty(jst, identifier)) {
        let types = ['ObjectExpression', 'ClassDeclaration', 'NewExpression']
        return propertyHost(jst, identifier)
        .chain(host => {
            if (host.type === 'Identifier') {
                return findDefinition(jst, host);
            } else if (ramda.contains(host.type, types)) {
                return Optional.of(host);
            } else {
                return Optional.empty() as Optional<Node>;
            }
        })
        .chain(hostDef => {
            if (hostDef.type === 'ObjectExpression') {
                return property(identifier.name, hostDef);
            } else if (hostDef.type === 'ClassDeclaration') {
                return method(identifier.name, hostDef, true);
            } else if (hostDef.type === 'NewExpression') {
                if (hostDef.callee.type === 'Identifier') {
                    return findDefinition(jst, hostDef.callee)
                    .chain(d => {
                        if (d.type === 'ClassDeclaration') {
                            return method(identifier.name, d, false);
                        } else {
                            return Optional.empty();
                        }
                    });
                } else {
                    return Optional.empty();
                }
            } else {
                return Optional.empty();
            }
        });
    } else {
        return findDeclaration(jst, identifier)
        .chain(declaration => {
            return definition(jst, declaration)
            .chain(def => {
                if (def.type === 'MemberExpression') {
                    if (def.property.type === 'Identifier') {
                        return findDefinition(jst, def.property);
                    } else {
                        return Optional.of(def);
                    }
                } else if (def.type === 'Identifier') {
                    return findDefinition(jst, def);
                } else {
                    return Optional.of(def);
                }
            });
        });
    }
}
