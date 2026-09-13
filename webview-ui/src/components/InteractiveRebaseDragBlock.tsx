import type { ReactNode } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core';

/** What a row's drag handle spreads so it picks up the whole block. */
export interface RebaseDragHandleProps {
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners;
}

interface InteractiveRebaseDragBlockProps {
  id: string;
  children: (dragHandle: RebaseDragHandleProps) => ReactNode;
}

/**
 * One sortable unit in the interactive rebase list: a squash group's rows, or a
 * single row. Every row's handle drags the block, so a group moves together.
 */
export function InteractiveRebaseDragBlock({ id, children }: InteractiveRebaseDragBlockProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  // Translate only: blocks differ in height, and the sortable strategy's scale
  // would stretch a single row to a group's size while they swap.
  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      {children({ attributes, listeners })}
    </div>
  );
}
