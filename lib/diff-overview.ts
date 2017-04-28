import * as ramda from 'ramda';
import {Optional} from './types';

declare let atom;

export function init() {
    atom.workspace.observeTextEditors(editor => {
        editor.onDidStopChanging(e => update(editor));
        editor.onDidChangePath(e => update(editor));
    });
}

function bar(editor): HTMLElement {
    let bar = atom.views.getView(editor).component.domNodeValue.querySelector('.diff-overview');
    if (! bar) {
        bar = document.createElement('div');
        bar.classList.add('diff-overview');
        atom.views.getView(editor).component.domNodeValue.appendChild(bar);
    }
    return bar;
}

function isSameRepo(repoPath: string, filePath: string) {
    let repoRoot = repoPath.replace('.git', '');
    return filePath.indexOf(repoRoot) === 0;
}

function clear(editor) {
    bar(editor).innerHTML = '';
}

function set(editor, diff, type) {
    let displayHeight = editor.displayBuffer.height;
    let rowCount = editor.getScreenLineCount();
    let rowHeight = displayHeight / rowCount;

    let beginRow = diff.newStart - 1;
    let endRow = type === 'removed' ? beginRow + 1 : diff.newStart + diff.newLines - 1;
    let item = document.createElement('div');
    item.classList.add(type);
    item.style.top = `${Math.round(beginRow * rowHeight)}px`;
    item.style.height = `${Math.round((endRow - beginRow) * rowHeight)}px`;
    bar(editor).appendChild(item);
}

function update(editor) {
    const isAdded = diff => diff.oldLines === 0 && diff.newLines > 0;
    const isRemoved = diff => diff.newLines === 0 && diff.oldLines > 0;
    const isModified = diff => ! isAdded(diff) && ! isRemoved(diff);

    clear(editor);
    Optional.of(ramda.head(atom.project.getRepositories().filter(repo => isSameRepo(repo.getPath(), editor.getPath()))))
    .map(repo => (repo as any).getLineDiffs(editor.getPath(), editor.getText()))
    .map((diffs: any[]) => {
        diffs.filter(isAdded).forEach(diff => set(editor, diff, 'added'));
        diffs.filter(isRemoved).forEach(diff => set(editor, diff, 'removed'));
        diffs.filter(isModified).forEach(diff => set(editor, diff, 'modified'));
    });
}
