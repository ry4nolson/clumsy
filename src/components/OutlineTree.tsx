import { useState } from "react";
import { ChevronRight } from "lucide-react";

export type OutlineTreeNode<T> = T & { title: string; items: OutlineTreeNode<T>[]; bold?: boolean; italic?: boolean };

type OutlineTreeProps<T> = {
  nodes: OutlineTreeNode<T>[];
  current?: OutlineTreeNode<T> | null;
  onActivate: (node: OutlineTreeNode<T>) => void;
};

function OutlineItem<T>({ node, depth, current, onActivate }: { node: OutlineTreeNode<T>; depth: number } & Omit<OutlineTreeProps<T>, "nodes">) {
  const [expanded, setExpanded] = useState(depth === 0 && node.items.length <= 12);
  const hasChildren = node.items.length > 0;

  return (
    <li>
      <div className="outline-row" style={{ paddingLeft: depth * 14 }}>
        {hasChildren ? (
          <button
            type="button"
            className={`outline-toggle${expanded ? " expanded" : ""}`}
            onClick={() => setExpanded(!expanded)}
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            <ChevronRight size={14} />
          </button>
        ) : (
          <span className="outline-toggle" />
        )}
        <button
          type="button"
          className={`outline-title${node === current ? " current" : ""}`}
          onClick={() => onActivate(node)}
          style={{ fontWeight: node.bold ? 600 : undefined, fontStyle: node.italic ? "italic" : undefined }}
          title={node.title}
        >
          {node.title}
        </button>
      </div>
      {hasChildren && expanded && (
        <ul>
          {node.items.map((child, index) => (
            <OutlineItem key={index} node={child} depth={depth + 1} current={current} onActivate={onActivate} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function OutlineTree<T>({ nodes, current, onActivate }: OutlineTreeProps<T>) {
  return (
    <ul className="outline">
      {nodes.map((node, index) => (
        <OutlineItem key={index} node={node} depth={0} current={current} onActivate={onActivate} />
      ))}
    </ul>
  );
}
