import * as ramda from 'ramda';
import {Identifier} from 'estree';
import {Optional} from './types';
import {toEstreePosition} from './atom-position';
import {descendants} from './type/node';
import {callExpression, getArguments, inArgumentsBlock as inCallArgumentsBlock} from './type/call-expression';
import {findDefinition} from './type/identifier';
const CompositeDisposable = require('atom').CompositeDisposable;

declare let atom;

function hintElement(editor, text) {
    let hint = document.createElement('div');
    hint.textContent = text;
    let container = document.createElement('div');
    container.style.marginTop = `${editor.getLineHeightInPixels()*-2}px`;
    container.appendChild(hint);
    return container;
}

export function init(editor) {
    let marker = null;                    // hint marker
    let markerDecoration = null;          // markerDecoration
    let ast = null;                       // estree ast

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
            Promise.resolve(null)           // wait for parse
            .then(_ => {
                Optional.of(ast)
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
                                clear();
                                let bufferPosition = editor.getCursorBufferPosition();
                                marker = editor.markBufferRange([bufferPosition, bufferPosition]);
                                markerDecoration = editor.decorateMarker(marker, {type: 'overlay', item: hintElement(editor, args.join(', ')), position: 'head', class: 'banana-hint'});
                            }
                        });
                    }
                });
            });
        }));
        subscriptions.add(editor.onDidChangeCursorPosition(e => {
            if (! e.textChanged) {
                clear();
            }
        }));
        subscriptions.add(editor.onDidDestroy(e => {
            clear();
            subscriptions.dispose();
        }));
    });
}
