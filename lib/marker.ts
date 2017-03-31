import * as ramda from 'ramda';

type AtomRange = [number, number];

export class MarkerManager {
    markerLayerOf = {};

    clear(clsName: string) {
        if (this.markerLayerOf[clsName]) {
            this.markerLayerOf[clsName].clear();
        }
    }

    clearAll() {
        ramda.keys(this.markerLayerOf).forEach(k => this.markerLayerOf[k].clear());
    }

    set(editor, clsName: string, ranges: AtomRange[]) {
        if (! this.markerLayerOf[clsName]) {
            this.markerLayerOf[clsName] = editor.addMarkerLayer();
        }
        ranges.forEach(range => this.markerLayerOf[clsName].markBufferRange(range, {invalidate: 'touch'}));
        editor.decorateMarkerLayer(this.markerLayerOf[clsName], {
            type: 'highlight',
            class: clsName,
        });
    }
}
