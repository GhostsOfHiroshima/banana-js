'use babel';

import * as ramda from 'ramda';
import BananaView from './banana-view';
import { CompositeDisposable } from 'atom';
import * as esprima from 'esprima';
import {Optional} from './types';
import {parse, ancestors, descendants} from './type/node';
import * as Identifier from './type/identifier';
import {MarkerManager} from './marker';
import * as diffOverview from './diff-overview';

// scrollbar indicator
// ref: https://github.com/Aakash1312/scroll-searcher/blob/master/lib/scroll-marker.coffee

function flatten(listOfLists) {
    return listOfLists.reduce((results, i) => results.concat(i), []);
}

function indexs(line, word) {
    function ps(line, word, startIndex) {
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

function occurenceForWord(txt, word) {
    /** txt 中某一 word 出現的地方 */
    let lines = txt.split('\n');
    let points = flatten(ramda.zip(
        ramda.range(0, lines.length),
        lines.map(line => indexs(line, word)))
        .map(i => i[1].map(col => [i[0], col])));
    return points.map(p => [p, [p[0], p[1] + word.length]]);
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

export default {

  bananaView: null,
  modalPanel: null,
  subscriptions: null,

  editing: false,
  tokensIn: {},
  markerManagerIn: {},

  parseCode(editor) {
      parse(editor.getText(), Optional.of(editor.getPath()), {sourceType: 'module'})
      .if_ok(ast => {
          this.tokensIn[editor.id] = descendants(ast).filter(isToken);
          this.markerManagerIn[editor.id].clear(editor, 'error');
      })
      .if_error(error => {
          delete this.tokensIn[editor.id];
          parseErrorToRange(editor, error)
          .map(errorMarker => {
              this.markerManagerIn[editor.id].set(editor, 'error', [errorMarker]);
          });
      });
  },

  activate(state) {
    diffOverview.init();
    this.bananaView = new BananaView(state.bananaViewState);
    this.modalPanel = atom.workspace.addModalPanel({
      item: this.bananaView.getElement(),
      visible: false
    });

    // Events subscribed to in atom's system can be easily cleaned up with a CompositeDisposable
    this.subscriptions = new CompositeDisposable();

    this.subscriptions.add(atom.commands.add('atom-workspace', {
      'banana:gotoDeclaration': () => this.gotoDeclaration(),
    }));

    atom.workspace.observeTextEditors(editor => {
        if (! this.markerManagerIn[editor.id]) {
            this.markerManagerIn[editor.id] = new MarkerManager();
        }
        if (editor.getGrammar().name === 'JavaScript') {
            this.parseCode(editor);
        }

        editor.onDidDestroy(event => {
            delete this.tokensIn[editor.id];
            delete this.markerManagerIn[editor.id];
        });

        editor.onDidChange(event => {
            if (editor.isModified()) {
                this.editing = true;
            }
        });
        editor.onDidStopChanging(event => this.editing = false);

        editor.onDidStopChanging(event => {
            if (editor.getGrammar().name === 'JavaScript') {
                this.parseCode(editor);
            }
        });

        editor.onDidChangeCursorPosition(event => {
            if (editor.getSelectedText() || this.editing) {
                return;
            }
            let markerManager = this.markerManagerIn[editor.id];
            if (this.tokensIn[editor.id]) {
                let tokens = this.tokensIn[editor.id];
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
        });
    });
  },

  deactivate() {
    this.modalPanel.destroy();
    this.subscriptions.dispose();
    this.bananaView.destroy();
  },

  serialize() {
    return {
      bananaViewState: this.bananaView.serialize()
    };
  },

  gotoDeclaration() {
    let editor = atom.workspace.getActiveTextEditor();
    if (! this.tokensIn[editor.id]) {
      return;
    }
    let identifiers = this.tokensIn[editor.id].filter(i => i.type === 'Identifier');
    if (identifiers) {
      let pos = editor.getCursorBufferPosition();
      let i = ramda.find(i => isIn(i, pos), identifiers);
      if (i) {
        Identifier.findDefinition(i)
        .map(def => {
          let root = ramda.last(ancestors(def)) || def;
          return atom.workspace.open(root._path)
          .then(editor => {
              editor.setCursorBufferPosition([def.loc.start.line-1, def.loc.start.column]);
              editor.scrollToCursorPosition();
          });
        })
        .or_exec(() => atom.notifications.addWarning("can't find the definition!!"));
      }
    } else {
      parse(editor.getText(), Optional.of(editor.getPath()), {sourceType: 'module'})
      .if_error(err => atom.notifications.addError(`compile error: (${err.lineNumber}, ${err.column}) ${err.description}`));
    }
  }
};
