import {Optional} from './types';
import {parse} from './type/node';
const CompositeDisposable = require('atom').CompositeDisposable;

declare let atom;

function parseCode(editor) {
    parse(editor.getText(), Optional.of(editor.getPath()), {sourceType: 'module'})
    .if_ok(ast => {
        editor.emitter.emit('did-parse-ok', ast);
    })
    .if_error(error => {
        editor.emitter.emit('did-parse-error', error);
    });
}

export function init() {
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
