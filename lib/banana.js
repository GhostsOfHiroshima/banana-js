'use babel';

import * as ramda from 'ramda';
import BananaView from './banana-view';
import { CompositeDisposable } from 'atom';
import * as esprima from 'esprima';
import {Optional} from './types';
import {parse, ancestors, descendants} from './type/node';
import * as Identifier from './type/identifier';

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

function indicatorBar(editor) {
    let bar = atom.views.getView(editor).component.domNodeValue.querySelector('.indicator-bar');
    if (! bar) {
        bar = document.createElement('div');
        bar.classList.add('indicator-bar');
        atom.views.getView(editor).component.domNodeValue.appendChild(bar);
    }
    return bar;
}

function clearIndicators(editor) {
    indicatorBar(editor).innerHTML = '';
}

function showIndicator(editor, screenPosition) {
    // 只處理單行 range (因為 identifier 只會有一行)
    // todo: 用 atom.views.getView(editor).component.domNodeValue.querySelector('.vertical-scrollbar')
    let row = screenPosition.row;
    let rowCount = editor.getScreenLineCount();
    let scrollHeight = atom.views.getView(editor).getScrollHeight();
    let displayHeight = editor.displayBuffer.height;

    let indicator = document.createElement('div');
    indicator.classList.add('indicator');
    indicator.style.top = Math.round((row / rowCount) * displayHeight) + 'px';
    indicatorBar(editor).appendChild(indicator);
}

export default {

  bananaView: null,
  modalPanel: null,
  subscriptions: null,

  enabled: true,
  lastWord: null,
  editing: false,
  identifiersInEditor: {},
  markerLayerInEditor: {},

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
        if (! this.markerLayerInEditor[editor.id]) {
            this.markerLayerInEditor[editor.id] = editor.addMarkerLayer();
        }

        editor.onDidDestroy(event => {
            delete this.identifiersInEditor[editor.id];
            delete this.markerLayerInEditor[editor.id];
        });

        editor.onDidChange(event => this.editing = true);
        editor.onDidStopChanging(event => this.editing = false);

        editor.onDidStopChanging(event => {
            if (!this.enabled || editor.getGrammar().name !== 'JavaScript') {
                return;
            }
            delete this.identifiersInEditor[editor.id];

            let ast = parse(editor.getText(), Optional.of(editor.getPath()), {sourceType: 'module'});
            if (ast.is_present()) {
                this.identifiersInEditor[editor.id] = descendants(ast).filter(n => n.type === 'Identifier');
            }
        });

        editor.onDidChangeCursorPosition(event => {
            if (!this.enabled || editor.getSelectedText() || this.editing) {
                if (! this.enabled) {
                    this.markerLayerInEditor[editor.id].clear();
                    clearIndicators(editor);
                }
                return;
            }
            let markerLayer = this.markerLayerInEditor[editor.id];
            let word = editor.getWordUnderCursor();
            if (word.match(/^\w+$/)) {
                if (word !== this.lastWord) {
                    this.lastWord = word;
                    markerLayer.clear();
                    clearIndicators(editor);
                    ranges(editor.getText(), word, this.identifiersInEditor[editor.id])
                    .forEach(range => {
                        markerLayer.markBufferRange(range, {invalidate: 'touch'});
                        showIndicator(editor, editor.screenPositionForBufferPosition(range[0]));
                    });
                    editor.decorateMarkerLayer(markerLayer, {
                        type: 'highlight',
                        class: 'aaa',
                    });
                }
            } else {
                this.lastWord = null;
                markerLayer.clear();
                clearIndicators(editor);
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
          atom.workspace.open(root._path)
          .then(editor => editor.setCursorBufferPosition([def.loc.start.line-1, def.loc.start.column]));
        });
      }
    }
  }
};
