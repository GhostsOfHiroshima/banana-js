import * as ramda from 'ramda';
import {Identifier} from 'estree';
import {Optional} from './types';
import {toEstreePosition} from './atom-position';
import {descendants} from './type/node';
import {callExpression, getArguments, inArgumentsBlock as inCallArgumentsBlock} from './type/call-expression';
import {findDefinition} from './type/identifier';

declare let atom;

let markerIn = {};                    // hint marker in editor
let markerDecorationIn = {};          // markerDecoration in editor
let programIn = {};                   // estree program node in editor

function hintElement(editor, text) {
    let hint = document.createElement('div');
    hint.textContent = text;
    let container = document.createElement('div');
    container.style.marginTop = `${editor.getLineHeightInPixels()*-2}px`;
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

export function init(editor) {
    atom.workspace.observeTextEditors(editor => {
        editor.emitter.on('did-parse-ok', program => {
            programIn[editor.id] = program;
        });
        editor.onDidStopChanging(event => {
            Promise.resolve(null)           // wait for parse
            .then(_ => {
                Optional.of(programIn[editor.id])
                .map(program => {
                    let pos = toEstreePosition(editor.getCursorBufferPosition());
                    if (inCallArgumentsBlock(program, pos)) {
                        callExpression(program, pos)
                        .chain(callExp => {
                            if (callExp.callee.type === 'Identifier') {
                                return findDefinition(callExp.callee).map(getArguments);
                            } else if (callExp.callee.type === 'MemberExpression') {
                                if (callExp.callee.property.type === 'Identifier') {
                                    return findDefinition(callExp.callee.property).map(getArguments);
                                } else {
                                    return Optional.empty() as Optional<string[]>;
                                }
                            } else {
                                return Optional.of(ramda.head(descendants(callExp.callee).filter(i => i.type === 'Identifier')))
                                .chain((id: Identifier) => findDefinition(id))
                                .map(getArguments);
                            }
                        })
                        .map(args => {
                            if (args.length > 0) {
                                clear(editor);
                                let bufferPosition = editor.getCursorBufferPosition();
                                let marker = editor.markBufferRange([bufferPosition, bufferPosition]);
                                let overlay = editor.decorateMarker(marker, {type: 'overlay', item: hintElement(editor, args.join(', ')), position: 'head', class: 'banana-hint'});
                                markerIn[editor.id] = marker;
                                markerDecorationIn[editor.id] = overlay;
                            }
                        });
                    }
                });
            });
        });
        editor.onDidChangeCursorPosition(e => {
            Optional.of(programIn[editor.id])
            .map(program => {
                let pos = toEstreePosition(editor.getCursorBufferPosition());
                if (! inCallArgumentsBlock(program, pos)) {
                    clear(editor);
                }
            })
            .or_exec(() => clear(editor));
        });
        editor.onDidDestroy(event => clear(editor));
    });
}
