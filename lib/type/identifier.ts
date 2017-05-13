import * as ramda from 'ramda';
import {Node, Identifier} from 'estree';
import {Optional} from '../types';
import * as Scope from './scope';
import {parent, descendants} from './node';
import * as property from './property';
import * as commonjs from './module-type/commonjs';
import * as es6 from './module-type/es6';

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
    type Checker = (identifier: Identifier) => boolean;
    const checkers: Checker[] = [
        identifier => parent(identifier).map(p => p.type === 'VariableDeclarator' && p.id === identifier).or_else(false),
        identifier => parent(identifier).map(p => p.type === 'ClassDeclaration' && p.id === identifier).or_else(false),
        identifier => parent(identifier).map(p => p.type === 'FunctionDeclaration' && p.id === identifier).or_else(false),
        identifier => parent(identifier).map(p => p.type === 'FunctionDeclaration' && p.params.some(i => i === identifier)).or_else(false),
        identifier => parent(identifier).map(p => p.type === 'ArrowFunctionExpression' && ramda.contains(identifier, p.params)).or_else(false),
        identifier => parent(identifier).map(p => p.type === 'FunctionExpression' && ramda.contains(identifier, p.params)).or_else(false),
        commonjs.isDeclaration,
        es6.isDeclaration,
    ];
    return checkers.some(chk => chk(identifier));
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
    type Resolver = (declaration: Identifier) => Optional<Node>;
    const resolvers: Resolver[] = [
        commonjs.definition,
        es6.definition,
        identifier => {
            return parent(identifier).map(p => {
                if (p.type === 'FunctionDeclaration') {
                    if (p.id === declaration) {
                        return p;
                    } else {
                        return null;        // 函式參數沒有 definition
                    }
                } else {
                    return null;
                }
            });
        },
        identifier => parent(identifier).map(p => p.type === 'VariableDeclarator' ? p.init : null),
        identifier => parent(identifier).map(p => p.type === 'ClassDeclaration' ? p : null),
    ];

    return resolvers.reduce((result, resolver) => {
        if (result.is_present()) {
            return result;
        } else {
            return resolver(declaration);
        }
    }, Optional.empty());
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
        .chain(host => {
            return property.value(identifier.name, host)
            .chain(v => {
                if (v.type === 'Identifier') {
                    return findDefinition(v);
                } else {
                    return Optional.of(v);
                }
            });
        });
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

export function isVariable(node: Node) {
    return node.type === 'Identifier' && (! property.isa(node));
}

export function occurences(variable: Identifier): Identifier[] {
    return findDeclaration(variable)
    .chain(d => {
        return Optional.of(ramda.head(Scope.scopes(d)))
        .map(scope => [scope].concat(descendants(scope).filter(Scope.isScope)))
        .map(scopes => ramda.flatten(scopes.map(s => Scope.identifiers(s))))
        .map(items => items.filter(i => i.name === variable.name && isVariable(i)))
        .map(vars => vars.filter(v => findDeclaration(v).map(d2 => d2 === d).or_else(false)));
    })
    .or_else([]);
}
