import * as ramda from 'ramda';
import {Range} from './base';

export class MarkerManager {
    markerLayerOf = {};

    clearAll() {
        ramda.keys(this.markerLayerOf).forEach(k => this.markerLayerOf[k].clear());
    }

    set(editor, clsName: string, ranges: Range[]) {
        if (! this.markerLayerOf[clsName]) {
            this.markerLayerOf[clsName] = editor.addMarkerLayer();
        }
        let layer = this.markerLayerOf[clsName];
        layer.clear();
        ranges.forEach(range => layer.markBufferRange(range, {invalidate: 'touch'}));
        editor.decorateMarkerLayer(layer, {
            type: 'highlight',
            class: clsName,
        });
    }
}
