import * as ramda from 'ramda';
import {Node, Identifier} from 'estree';
import {Optional} from '../types';
import {parent} from './node';
import {findDefinition} from './identifier';

export function host(node: Identifier): Optional<Node> {
    return parent(node)
    .map(parent => {
        if (parent.type === 'MemberExpression' && parent.property === node) {
            return parent.object;
        } else {
            return null;
        }
    });
}

export function isa(node: Identifier): boolean {
    return host(node).is_present();
}

type ValueGetter = (propertyName: string, host: Node) => Optional<Node>;

const valueGetters: ValueGetter[] = [
    (propertyName, host) => {
        if (host.type === 'ObjectExpression') {
            let ps = host.properties.filter(p =>
                (p.key.type === 'Literal' && p.key.value === propertyName) ||
                (p.key.type === 'Identifier' && p.key.name === propertyName));
            return Optional.of(ramda.head(ps));
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
