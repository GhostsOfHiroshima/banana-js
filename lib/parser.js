"use strict";
const types_1 = require('./types');
const node_1 = require('./type/node');
const CompositeDisposable = require('atom').CompositeDisposable;
function parseCode(editor) {
    node_1.parse(editor.getText(), types_1.Optional.of(editor.getPath()), { sourceType: 'module' })
        .if_ok(ast => {
        editor.emitter.emit('did-parse-ok', ast);
    })
        .if_error(error => {
        editor.emitter.emit('did-parse-error', error);
    });
}
function init() {
    atom.workspace.observeTextEditors(editor => {
        if (editor.getGrammar().name === 'JavaScript') {
            parseCode(editor);
        }
        let subscriptions = new CompositeDisposable();
        subscriptions.add(editor.onDidStopChanging(event => {
            if (editor.getGrammar().name === 'JavaScript') {
                parseCode(editor);
            }
        }));
        subscriptions.add(editor.onDidDestroy(e => subscriptions.dispose()));
    });
}
exports.init = init;
