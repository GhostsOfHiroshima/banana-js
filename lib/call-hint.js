"use strict";
const ramda = require('ramda');
const types_1 = require('./types');
const atom_position_1 = require('./atom-position');
const node_1 = require('./type/node');
const call_expression_1 = require('./type/call-expression');
const identifier_1 = require('./type/identifier');
let markerIn = {}; // hint marker in editor
let markerDecorationIn = {}; // markerDecoration in editor
let programIn = {}; // estree program node in editor
function hintElement(editor, text) {
    let hint = document.createElement('div');
    hint.textContent = text;
    let container = document.createElement('div');
    container.style.marginTop = `${editor.getLineHeightInPixels() * -2}px`;
    container.appendChild(hint);
    return container;
}
function clear(editor) {
    if (markerIn[editor.id] && markerIn[editor.id].destroy) {
        markerIn[editor.id].destroy();
    }
    if (markerDecorationIn[editor.id] && markerDecorationIn[editor.id].destroy) {
        markerDecorationIn[editor.id].destroy();
    }
    delete markerIn[editor.id];
    delete markerDecorationIn[editor.id];
}
function init(editor) {
    atom.workspace.observeTextEditors(editor => {
        editor.emitter.on('did-parse-ok', program => {
            programIn[editor.id] = program;
        });
        editor.onDidStopChanging(event => {
            Promise.resolve(null) // wait for parse
                .then(_ => {
                types_1.Optional.of(programIn[editor.id])
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
                                clear(editor);
                                let bufferPosition = editor.getCursorBufferPosition();
                                let marker = editor.markBufferRange([bufferPosition, bufferPosition]);
                                let overlay = editor.decorateMarker(marker, { type: 'overlay', item: hintElement(editor, args.join(', ')), position: 'head', class: 'banana-hint' });
                                markerIn[editor.id] = marker;
                                markerDecorationIn[editor.id] = overlay;
                            }
                        });
                    }
                });
            });
        });
        editor.onDidChangeCursorPosition(e => {
            types_1.Optional.of(programIn[editor.id])
                .map(program => {
                let pos = atom_position_1.toEstreePosition(editor.getCursorBufferPosition());
                if (!call_expression_1.inArgumentsBlock(program, pos)) {
                    clear(editor);
                }
            })
                .or_exec(() => clear(editor));
        });
        editor.onDidDestroy(event => clear(editor));
    });
}
exports.init = init;
