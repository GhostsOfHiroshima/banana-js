import {Point} from './base';

declare let atom;

function indicatorBar(editor) {
    let bar = atom.views.getView(editor).component.domNodeValue.querySelector('.indicator-bar');
    if (! bar) {
        bar = document.createElement('div');
        bar.classList.add('indicator-bar');
        atom.views.getView(editor).component.domNodeValue.appendChild(bar);
    }
    return bar;
}

export function clearAll(editor) {
    indicatorBar(editor).innerHTML = '';
}

function clearType(editor, type) {
    Array.from(indicatorBar(editor).children).forEach((i: any) => i.remove());
}

function show(editor, type: string, position: Point) {
    // 只處理單行 range (因為 identifier 只會有一行)
    // todo: 用 atom.views.getView(editor).component.domNodeValue.querySelector('.vertical-scrollbar')
    let row = editor.screenPositionForBufferPosition(position).row;
    let rowCount = editor.getScreenLineCount();
    let scrollHeight = atom.views.getView(editor).getScrollHeight();
    let displayHeight = editor.displayBuffer.height;

    let indicator = document.createElement('div');
    indicator.classList.add('indicator', type);
    indicator.style.top = Math.round((row / rowCount) * displayHeight) + 'px';
    indicatorBar(editor).appendChild(indicator);
}

export function set(editor, type: string, positions: Point[]) {
    clearType(editor, type);
    positions.forEach(p => show(editor, type, p));
}
