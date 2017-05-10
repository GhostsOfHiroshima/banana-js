import * as ramda from 'ramda';
import {Range} from './base';
import {Optional} from './types';
import {descendants} from './type/node';
import * as Identifier from './type/identifier';
import * as indicatorBar from './indicator-bar';
const CompositeDisposable = require('atom').CompositeDisposable;

declare let atom;

function flatten(listOfLists) {
    return listOfLists.reduce((results, i) => results.concat(i), []);
}

function indexs(line: string, word: string) {
    function ps(line: string, word: string, startIndex: number): number[] {
        let idx = line.indexOf(word, startIndex);
        return idx === -1 ? [] : [idx].concat(ps(line, word, idx + word.length));
    }
    return ps(line, word, 0);
}

function isToken(node) {
    return node.type === 'Identifier' ||
          (node.type === 'Literal' && typeof(node.value) === 'string' && node.value.match(/^\w+$/));
}

function isIn(node, position) {
    // position: atom buffer position, row, column 從 0 開始
    // token 的 line, column 分別從 1, 0 開始
    return (node.loc.start.line - 1 == position.row &&
            node.loc.start.column <= position.column &&
            node.loc.end.column >= position.column);
}

function parseErrorToRange(editor, error) {
    if (error.lineNumber) {
        let line = editor.getText().split('\n')[error.lineNumber-1]
        return Optional.of([
            [error.lineNumber-1, error.column],
            [error.lineNumber-1, line.length-1]
        ]);
    } else {
        return Optional.empty();
    }
}

function occurenceForToken(tokens, token) {
    /** 某一 token 在 tokens 中出現(有關聯)的地方 */
    const range = token => [
        [token.loc.start.line-1, token.loc.start.column],
        [token.loc.end.line-1, token.loc.end.column],
    ];
    const name = token => token.name || token.value;
    if (Identifier.isVariable(token)) {
        return Identifier.occurences(token).map(range);
    } else {
        return tokens.filter(t => ! Identifier.isVariable(t)).filter(t => name(t) === name(token)).map(range);
    }
}

function occurenceForWord(txt: string, word: string) {
    /** txt 中某一 word 出現的地方 */
    let lines = txt.split('\n');
    let points = flatten(ramda.zip(
        ramda.range(0, lines.length),
        lines.map(line => indexs(line, word)))
        .map(i => i[1].map(col => [i[0], col])));
    return points.map(p => [p, [p[0], p[1] + word.length]]);
}

export function init() {
    atom.workspace.observeTextEditors(editor => {
        let markerManager = new MarkerManager();
        let tokens = [];

        editor.emitter.on('did-parse-ok', ast => {
            tokens = descendants(ast).filter(isToken);
            markerManager.clear(editor, 'error');
        });

        editor.emitter.on('did-parse-error', error => {
            tokens = [];
            parseErrorToRange(editor, error)
            .map(errorMarker => markerManager.set(editor, 'error', [errorMarker]));
        });

        let subscriptions = new CompositeDisposable();
        subscriptions.add(editor.onDidChangeCursorPosition(e => {
            if (editor.getSelectedText() || this.editing) {
                return;
            }
            if (tokens.length > 0) {
                let token = ramda.find(t => isIn(t, editor.getCursorBufferPosition()), tokens);
                if (token) {
                    markerManager.set(editor, 'normal', occurenceForToken(tokens, token));
                } else {
                    markerManager.clear(editor, 'normal');
                }
            } else {
                let word = editor.getWordUnderCursor();
                if (word.match(/^\w+$/)) {
                    markerManager.set(editor, 'normal', occurenceForWord(editor.getText(), word));
                } else {
                    markerManager.clear(editor, 'normal');
                }
            }
        }));
        subscriptions.add(editor.onDidDestroy(e => subscriptions.dispose()));
    });
}

class MarkerManager {
    markerLayerOf = {};

    clearAll(editor) {
        ramda.keys(this.markerLayerOf).forEach(k => this.markerLayerOf[k].clear());
        indicatorBar.clearAll(editor);
    }

    clear(editor, type: string) {
        indicatorBar.clear(editor, type);
        if (this.markerLayerOf[type]) {
            this.markerLayerOf[type].clear();
        }
    }

    set(editor, type: string, ranges: Range[]) {
        if (! this.markerLayerOf[type]) {
            this.markerLayerOf[type] = editor.addMarkerLayer();
        }
        let layer = this.markerLayerOf[type];
        layer.clear();
        ranges.forEach(range => layer.markBufferRange(range, {invalidate: 'touch'}));
        editor.decorateMarkerLayer(layer, {
            type: 'highlight',
            class: type,
        });
        indicatorBar.set(editor, type, ranges.map(r => r[0]))
    }
}
