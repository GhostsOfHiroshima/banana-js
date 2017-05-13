'use babel';

import * as ramda from 'ramda';
import BananaView from './banana-view';
import { CompositeDisposable } from 'atom';
import {Optional} from './types';
import {parse, ancestors, descendants} from './type/node';
import * as Identifier from './type/identifier';
import * as parser from './parser';
import * as marker from './marker';
import * as diffOverview from './diff-overview';
import * as callHint from './call-hint';

// scrollbar indicator
// ref: https://github.com/Aakash1312/scroll-searcher/blob/master/lib/scroll-marker.coffee

function isIn(node, position) {
    // position: atom buffer position, row, column 從 0 開始
    // token 的 line, column 分別從 1, 0 開始
    return (node.loc.start.line - 1 == position.row &&
            node.loc.start.column <= position.column &&
            node.loc.end.column >= position.column);
}

export default {

  bananaView: null,
  modalPanel: null,
  subscriptions: null,

  astIn: {},

  activate(state) {
    parser.init();
    marker.init();
    diffOverview.init();
    callHint.init();
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
        let subscriptions = new CompositeDisposable();

        subscriptions.add(editor.emitter.on('did-parse-ok', ast => {
            this.astIn[editor.id] = ast;
        }));

        subscriptions.add(editor.emitter.on('did-parse-error', ast => {
            delete this.astIn[editor.id];
        }));

        subscriptions.add(editor.onDidDestroy(e => {
            delete this.astIn[editor.id];
        }));

        subscriptions.add(editor.onDidDestroy(e => subscriptions.dispose()));
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
    if (! this.astIn[editor.id]) {
      return;
    }
    let identifiers = descendants(this.astIn[editor.id]).filter(i => i.type === 'Identifier');
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
