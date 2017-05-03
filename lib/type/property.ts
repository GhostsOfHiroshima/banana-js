import * as ramda from 'ramda';
import {Node, Identifier, ObjectExpression, AssignmentExpression} from 'estree';
import {Optional} from '../types';
import {parent} from './node';
import {findDefinition, occurences, isVariable} from './identifier';
import * as commonjs from './module-type/commonjs';
import * as es6 from './module-type/es6';

type HostGetter = (node: Identifier) => Optional<Node>;
const hostGetters: HostGetter[] = [
    node => {
        return parent(node)
        .map(parent => {
            if (parent.type === 'MemberExpression' && parent.property === node) {
                return parent.object;
            } else {
                return null;
            }
        });
    },
    node => {
        return parent(node)
        .chain(parent)
        .map(p => {
            if (p.type === 'ObjectExpression') {
                return ramda.find(p => p.key === node, p.properties);
            } else {
                return null;
            }
        });
    },
    node => {
        return parent(node)
        .chain(parent)
        .map(p => {
            if (p.type === 'ClassBody') {
                return ramda.find(m => m.key === node, p.body)
            } else {
                return null;
            }
        });
    }
]

export function host(node: Identifier): Optional<Node> {
    return hostGetters.reduce((result, getter) => {
        if (result.is_present()) {
            return result;
        } else {
            return getter(node);
        }
    }, Optional.empty());
}

export function isa(node: Identifier): boolean {
    return host(node).is_present();
}

type ValueGetter = (propertyName: string, host: Node) => Optional<Node>;

const valueGetters: ValueGetter[] = [
    commonjs.propertyValueGetter,
    es6.propertyValueGetter,

    (propertyName, host) => {
        if (host.type === 'ObjectExpression') {
            const methods = [
                (propertyName, host: ObjectExpression) => {
                    let ps = host.properties
                    .filter(p =>
                        (p.key.type === 'Literal' && p.key.value === propertyName) ||
                        (p.key.type === 'Identifier' && p.key.name === propertyName))
                    .map(p => p.value);
                    return Optional.of(ramda.head(ps));
                },
                (propertyName, host: ObjectExpression) => {
                    return parent(host)
                    .chain(p => {
                        if (p.type === 'VariableDeclarator' && isVariable(p.id)) {
                            let values = occurences(p.id as Identifier)
                            .filter(o =>
                                parent(o)
                                .chain(parent)
                                .map(p => p.type === 'AssignmentExpression' &&
                                    p.operator === '=' &&
                                    p.left.type === 'MemberExpression' &&
                                    p.left.property.type === 'Identifier' &&
                                    p.left.property.name === propertyName)
                                .or_else(false))
                            .map(o => parent(o).chain(parent).map((p: AssignmentExpression) => p.right));
                            return Optional.of(ramda.head(Optional.cat(values)));
                        } else {
                            return Optional.empty();
                        }
                    });
                },
            ];
            return methods.reduce((result, m) => {
                if (result.is_present()) {
                    return result;
                } else {
                    return m(propertyName, host);
                }
            }, Optional.empty() as Optional<Node>);
        } else {
            return Optional.empty();
        }
    },

    (propertyName, host) => {
        if (host.type === 'ClassDeclaration') {
            return Optional.of(ramda.head(host.body.body.filter(m =>
                m.key.type === 'Identifier' &&
                m.key.name === propertyName &&
                m.static === true)));
        } else {
            return Optional.empty();
        }
    },

    (propertyName, host) => {
        if (host.type === 'NewExpression') {
            if (host.callee.type === 'Identifier') {
                return findDefinition(host.callee)
                .chain(d => {
                    if (d.type === 'ClassDeclaration') {
                        return Optional.of(ramda.head(d.body.body.filter(m =>
                            m.key.type === 'Identifier' &&
                            m.key.name === propertyName &&
                            m.static === false)));
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
    },

    (propertyName, host) => {
        if (host.type === 'MemberExpression') {
            if (host.property.type === 'Identifier') {
                return findDefinition(host.property).chain(d => value(propertyName, d));
            } else {
                return Optional.empty();
            }
        } else {
            return Optional.empty();
        }
    }
];

export function value(propertyName: string, host: Node): Optional<Node> {
    return valueGetters.reduce((res, getter) => {
        if (res.is_present()) {
            return res;
        } else {
            return getter(propertyName, host);
        }
    }, Optional.empty());
}
