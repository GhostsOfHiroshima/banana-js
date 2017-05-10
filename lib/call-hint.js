"use strict";
const ramda = require('ramda');
const types_1 = require('./types');
const atom_position_1 = require('./atom-position');
const node_1 = require('./type/node');
const call_expression_1 = require('./type/call-expression');
const identifier_1 = require('./type/identifier');
const CompositeDisposable = require('atom').CompositeDisposable;
function hintElement(editor, text) {
    let hint = document.createElement('div');
    hint.textContent = text;
    let container = document.createElement('div');
    container.style.marginTop = `${editor.getLineHeightInPixels() * -2}px`;
    container.appendChild(hint);
    return container;
}
function init(editor) {
    let marker = null; // hint marker
    let markerDecoration = null; // markerDecoration
    let ast = null; // estree ast
    function clear() {
        if (marker && marker.destroy) {
            marker.destroy();
        }
        if (markerDecoration && markerDecoration.destroy) {
            markerDecoration.destroy();
        }
        marker = null;
        markerDecoration = null;
    }
    atom.workspace.observeTextEditors(editor => {
        let subscriptions = new CompositeDisposable();
        subscriptions.add(editor.emitter.on('did-parse-ok', _ast => {
            ast = _ast;
        }));
        subscriptions.add(editor.onDidStopChanging(event => {
            Promise.resolve(null) // wait for parse
                .then(_ => {
                types_1.Optional.of(ast)
                    .map(program => {
                    let pos = atom_position_1.toEstreePosition(editor.getCursorBufferPosition());
                    if (call_expression_1.inArgumentsBlock(program, pos)) {
                        call_expression_1.callExpression(program, pos)
                            .chain(callExp => {
                            if (callExp.callee.type === 'Identifier') {
                                return identifier_1.findDefinition(callExp.callee).map(call_expression_1.getArguments);
                            }
                            else if (callExp.callee.type === 'MemberExpression') {
                                if (callExp.callee.property.type === 'Identifier') {
                                    return identifier_1.findDefinition(callExp.callee.property).map(call_expression_1.getArguments);
                                }
                                else {
                                    return types_1.Optional.empty();
                                }
                            }
                            else {
                                return types_1.Optional.of(ramda.head(node_1.descendants(callExp.callee).filter(i => i.type === 'Identifier')))
                                    .chain((id) => identifier_1.findDefinition(id))
                                    .map(call_expression_1.getArguments);
                            }
                        })
                            .map(args => {
                            if (args.length > 0) {
                                clear();
                                let bufferPosition = editor.getCursorBufferPosition();
                                marker = editor.markBufferRange([bufferPosition, bufferPosition]);
                                markerDecoration = editor.decorateMarker(marker, { type: 'overlay', item: hintElement(editor, args.join(', ')), position: 'head', class: 'banana-hint' });
                            }
                        });
                    }
                });
            });
        }));
        subscriptions.add(editor.onDidChangeCursorPosition(e => {
            if (!e.textChanged) {
                clear();
            }
        }));
        subscriptions.add(editor.onDidDestroy(e => {
            clear();
            subscriptions.dispose();
        }));
    });
}
exports.init = init;
