"use strict";
const ramda = require('ramda');
const indicatorBar = require('./indicator-bar');
class MarkerManager {
    constructor() {
        this.markerLayerOf = {};
    }
    clearAll(editor) {
        ramda.keys(this.markerLayerOf).forEach(k => this.markerLayerOf[k].clear());
        indicatorBar.clearAll(editor);
    }
    clear(editor, type) {
        indicatorBar.clear(editor, type);
        if (this.markerLayerOf[type]) {
            this.markerLayerOf[type].clear();
        }
    }
    set(editor, type, ranges) {
        if (!this.markerLayerOf[type]) {
            this.markerLayerOf[type] = editor.addMarkerLayer();
        }
        let layer = this.markerLayerOf[type];
        layer.clear();
        ranges.forEach(range => layer.markBufferRange(range, { invalidate: 'touch' }));
        editor.decorateMarkerLayer(layer, {
            type: 'highlight',
            class: type,
        });
        indicatorBar.set(editor, type, ranges.map(r => r[0]));
    }
}
exports.MarkerManager = MarkerManager;
