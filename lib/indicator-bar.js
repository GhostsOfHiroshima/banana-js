"use strict";
const ramda = require('ramda');
function indicatorBar(editor) {
    let bar = atom.views.getView(editor).component.domNodeValue.querySelector('.indicator-bar');
    if (!bar) {
        bar = document.createElement('div');
        bar.classList.add('indicator-bar');
        atom.views.getView(editor).component.domNodeValue.appendChild(bar);
        let resizeSensor = document.createElement('iframe');
        resizeSensor.classList.add('indicator-resize-sensor');
        atom.views.getView(editor).component.domNodeValue.appendChild(resizeSensor);
        Promise.resolve(true) // 等一下，讓 iframe.contentWindow 長出來
            .then(_ => {
            resizeSensor.contentWindow.addEventListener('resize', e => {
                let positions = indicators(editor).map(i => JSON.parse(i.getAttribute('position')));
                let types = indicators(editor).map(i => i.getAttribute('type'));
                clearAll(editor);
                ramda.zip(types, positions).map(([type, pos]) => show(editor, type, pos));
            });
        });
    }
    return bar;
}
function indicators(editor) {
    return Array.from(indicatorBar(editor).querySelectorAll('*'));
}
function clearAll(editor) {
    indicatorBar(editor).innerHTML = '';
}
exports.clearAll = clearAll;
function clear(editor, type) {
    Array.from(indicatorBar(editor).children)
        .filter(i => i.classList.contains(type))
        .forEach(i => i.remove());
}
exports.clear = clear;
function show(editor, type, position) {
    // 只處理單行 range (因為 identifier 只會有一行)
    // todo: 用 atom.views.getView(editor).component.domNodeValue.querySelector('.vertical-scrollbar')
    let row = editor.screenPositionForBufferPosition(position).row;
    let rowCount = editor.getScreenLineCount();
    let scrollHeight = atom.views.getView(editor).getScrollHeight();
    let displayHeight = editor.displayBuffer.height;
    let indicator = document.createElement('div');
    indicator.setAttribute('position', JSON.stringify(position));
    indicator.setAttribute('type', type);
    indicator.classList.add('indicator', type);
    indicator.style.top = Math.round((row / rowCount) * displayHeight) + 'px';
    indicatorBar(editor).appendChild(indicator);
}
function set(editor, type, positions) {
    clear(editor, type);
    positions.forEach(p => show(editor, type, p));
}
exports.set = set;
