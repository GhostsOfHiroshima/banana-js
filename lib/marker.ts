import * as ramda from 'ramda';
import {Range} from './base';
import * as indicatorBar from './indicator-bar';

export class MarkerManager {
    markerLayerOf = {};

    clearAll(editor) {
        ramda.keys(this.markerLayerOf).forEach(k => this.markerLayerOf[k].clear());
        indicatorBar.clearAll(editor);
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
