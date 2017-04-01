'use babel';

import * as ramda from 'ramda';
import BananaView from './banana-view';
import { CompositeDisposable } from 'atom';
import * as esprima from 'esprima';
import {Optional} from './types';
import {parse, ancestors, descendants} from './type/node';
import * as Identifier from './type/identifier';
import * as indicatorBar from './indicator-bar';
import {MarkerManager} from './marker';

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

function identifier(identifiers, position) {
    // position: atom buffer position, row, column 從 0 開始
    // identifier 的 line, column 分別從 1, 0 開始
    return identifiers.reduce((result, i) => {
        if (result) {
            return result;
        } else {
            if (i.loc.start.line - 1 == position.row &&
                i.loc.start.column <= position.column &&
                i.loc.end.column >= position.column) {
                return i;
            } else {
                return null;
            }
        }
    }, null);
}

function ranges(txt, word, identifiers) {
    if (identifiers) {
        return identifiers.filter(i => i.name === word).map(i => [
            [i.loc.start.line-1, i.loc.start.column],
            [i.loc.end.line-1, i.loc.end.column],
        ]);
    } else {
        let lines = txt.split('\n');
        let points = flatten(ramda.zip(
            ramda.range(0, lines.length),
            lines.map(line => indexs(line, word)))
            .map(i => i[1].map(col => [i[0], col])));
        return points.map(p => [p, [p[0], p[1] + word.length]]);
    }
}

export default {

  bananaView: null,
  modalPanel: null,
  subscriptions: null,

  enabled: true,
  lastWord: null,
  editing: false,
  identifiersInEditor: {},
  markerManagerInEditor: {},

  activate(state) {
    this.bananaView = new BananaView(state.bananaViewState);
    this.modalPanel = atom.workspace.addModalPanel({
      item: this.bananaView.getElement(),
      visible: false
    });

    // Events subscribed to in atom's system can be easily cleaned up with a CompositeDisposable
    this.subscriptions = new CompositeDisposable();

    // Register command that toggles this view
    this.subscriptions.add(atom.commands.add('atom-workspace', {
      'banana:toggle': () => this.toggle(),
      'banana:gotoDeclaration': () => this.gotoDeclaration(),
    }));

    atom.workspace.observeTextEditors(editor => {
        if (! this.markerManagerInEditor[editor.id]) {
            this.markerManagerInEditor[editor.id] = new MarkerManager();
        }
        let ast = parse(editor.getText(), Optional.of(editor.getPath()), {sourceType: 'module'});
        ast
        .if_ok(ast => this.identifiersInEditor[editor.id] = descendants(ast).filter(n => n.type === 'Identifier'))

        editor.onDidDestroy(event => {
            delete this.identifiersInEditor[editor.id];
            delete this.markerManagerInEditor[editor.id];
        });

        editor.onDidChange(event => {
            if (editor.isModified()) {
                this.editing = true;
            }
        });
        editor.onDidStopChanging(event => this.editing = false);

        editor.onDidStopChanging(event => {
            if (!this.enabled || editor.getGrammar().name !== 'JavaScript') {
                return;
            }
            delete this.identifiersInEditor[editor.id];

            let ast = parse(editor.getText(), Optional.of(editor.getPath()), {sourceType: 'module'});
            ast
            .if_ok(ast => this.identifiersInEditor[editor.id] = descendants(ast).filter(n => n.type === 'Identifier'));
        });

        editor.onDidChangeCursorPosition(event => {
            if (!this.enabled || editor.getSelectedText() || this.editing) {
                if (! this.enabled) {
                    this.markerManagerInEditor[editor.id].clearAll();
                    indicatorBar.clear(editor);
                }
                return;
            }
            let markerManager = this.markerManagerInEditor[editor.id];
            let word = editor.getWordUnderCursor();
            if (word.match(/^\w+$/)) {
                if (word !== this.lastWord) {
                    this.lastWord = word;
                    markerManager.clearAll();
                    indicatorBar.clear(editor);
                    let rs = ranges(editor.getText(), word, this.identifiersInEditor[editor.id]);
                    markerManager.set(editor, 'identifier', rs);
                    rs.forEach(range => {
                        indicatorBar.show(editor, editor.screenPositionForBufferPosition(range[0]), 'green');
                    });
                }
            } else {
                this.lastWord = null;
                markerManager.clearAll();
                indicatorBar.clear(editor);
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

  toggle() {
    this.enabled = ! this.enabled;
    let msg = 'banana ' + (this.enabled ? 'enabled' : 'disabled');
    atom.notifications.addSuccess(msg);
  },

  gotoDeclaration() {
    let editor = atom.workspace.getActiveTextEditor();
    let identifiers = this.identifiersInEditor[editor.id];
    if (identifiers) {
      let i = identifier(identifiers, editor.getCursorBufferPosition());
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
