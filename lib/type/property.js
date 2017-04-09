"use strict";
const ramda = require('ramda');
const types_1 = require('../types');
const node_1 = require('./node');
const identifier_1 = require('./identifier');
const commonjs = require('./module-type/commonjs');
const es6 = require('./module-type/es6');
const hostGetters = [
    node => {
        return node_1.parent(node)
            .map(parent => {
            if (parent.type === 'MemberExpression' && parent.property === node) {
                return parent.object;
            }
            else {
                return null;
            }
        });
    },
    node => {
        return node_1.parent(node)
            .chain(node_1.parent)
            .map(p => {
            if (p.type === 'ObjectExpression') {
                return ramda.find(p => p.key === node, p.properties);
            }
            else {
                return null;
            }
        });
    },
    node => {
        return node_1.parent(node)
            .chain(node_1.parent)
            .map(p => {
            if (p.type === 'ClassBody') {
                return ramda.find(m => m.key === node, p.body);
            }
            else {
                return null;
            }
        });
    }
];
function host(node) {
    return hostGetters.reduce((result, getter) => {
        if (result.is_present()) {
            return result;
        }
        else {
            return getter(node);
        }
    }, types_1.Optional.empty());
}
exports.host = host;
function isa(node) {
    return host(node).is_present();
}
exports.isa = isa;
const valueGetters = [
    commonjs.propertyValueGetter,
    es6.propertyValueGetter,
        (propertyName, host) => {
        if (host.type === 'ObjectExpression') {
            let ps = host.properties
                .filter(p => (p.key.type === 'Literal' && p.key.value === propertyName) ||
                (p.key.type === 'Identifier' && p.key.name === propertyName))
                .map(p => p.value);
            return types_1.Optional.of(ramda.head(ps));
        }
        else {
            return types_1.Optional.empty();
        }
    },
        (propertyName, host) => {
        if (host.type === 'ClassDeclaration') {
            return types_1.Optional.of(ramda.head(host.body.body.filter(m => m.key.type === 'Identifier' &&
                m.key.name === propertyName &&
                m.static === true)));
        }
        else {
            return types_1.Optional.empty();
        }
    },
        (propertyName, host) => {
        if (host.type === 'NewExpression') {
            if (host.callee.type === 'Identifier') {
                return identifier_1.findDefinition(host.callee)
                    .chain(d => {
                    if (d.type === 'ClassDeclaration') {
                        return types_1.Optional.of(ramda.head(d.body.body.filter(m => m.key.type === 'Identifier' &&
                            m.key.name === propertyName &&
                            m.static === false)));
                    }
                    else {
                        return types_1.Optional.empty();
                    }
                });
            }
            else {
                return types_1.Optional.empty();
            }
        }
        else {
            return types_1.Optional.empty();
        }
    },
        (propertyName, host) => {
        if (host.type === 'MemberExpression') {
            if (host.property.type === 'Identifier') {
                return identifier_1.findDefinition(host.property).chain(d => value(propertyName, d));
            }
            else {
                return types_1.Optional.empty();
            }
        }
        else {
            return types_1.Optional.empty();
        }
    }
];
function value(propertyName, host) {
    return valueGetters.reduce((res, getter) => {
        if (res.is_present()) {
            return res;
        }
        else {
            return getter(propertyName, host);
        }
    }, types_1.Optional.empty());
}
exports.value = value;
