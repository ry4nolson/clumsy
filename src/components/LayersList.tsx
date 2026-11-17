import type { ViewerLayers } from "../hooks/useViewerLayers";
import type { LayerNode } from "../lib/layers";

type LayersListProps = {
  layers: ViewerLayers;
  onToggle: (ids: string[], visible: boolean) => void;
  onShowAll: (visible: boolean) => void;
  onReset: () => void;
};

function LayerItems({ nodes, onToggle }: { nodes: LayerNode[]; onToggle: LayersListProps["onToggle"] }) {
  return (
    <ul className="layer-items">
      {nodes.map((node, index) =>
        node.kind === "layer" ? (
          <li key={node.id}>
            <label className="layer-row">
              <input type="checkbox" checked={node.visible} onChange={(event) => onToggle([node.id], event.target.checked)} />
              <span>{node.name}</span>
            </label>
          </li>
        ) : (
          <li key={`${node.name}-${index}`} className="layer-group">
            <span className="layer-label">{node.name}</span>
            <LayerItems nodes={node.children} onToggle={onToggle} />
          </li>
        ),
      )}
    </ul>
  );
}

export function LayersList({ layers, onToggle, onShowAll, onReset }: LayersListProps) {
  return (
    <div className="layers">
      <div className="layers-header">
        <button type="button" className="layers-button" onClick={() => onShowAll(true)}>
          Show All
        </button>
        <button type="button" className="layers-button" onClick={() => onShowAll(false)}>
          Hide All
        </button>
        <button type="button" className="layers-button" title="Back to the document's own layer settings" onClick={onReset}>
          Reset
        </button>
      </div>
      <LayerItems nodes={layers.nodes} onToggle={onToggle} />
      <p className="layers-note">Hiding a layer changes only what you see here. Printing and saving use the document's own layer settings.</p>
    </div>
  );
}
