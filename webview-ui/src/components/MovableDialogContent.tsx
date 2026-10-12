import { useRef, useState, type ComponentPropsWithoutRef, type PointerEvent } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { clampDialogPosition, type DialogPosition } from '../utils/dialogPosition';

/**
 * Spread onto the element the user drags to move the dialog — normally the
 * `Dialog.Title`. The dialog gives it the move cursor and keeps a drag from
 * selecting its text.
 */
export const dialogDragHandleProps = { 'data-dialog-drag-handle': '' } as const;

const DRAG_HANDLE_SELECTOR = '[data-dialog-drag-handle]';

interface DragSession {
  pointerId: number;
  offsetX: number;
  offsetY: number;
}

/**
 * A `Dialog.Content` the user can move by its drag handle.
 *
 * The shared dialog chrome centres a dialog with a -50% translate. That is fine
 * until the user touches it: a centred box resized from its corner grows both
 * ways, so the grip moves at half the pointer's speed. The first pointer-down
 * anywhere on the dialog therefore *pins* it at its current pixel position
 * (same rect, so nothing visibly moves); from then on resize grows right/down
 * under the pointer and a handle drag moves `left`/`top`.
 *
 * Position is component state, so it resets each time the dialog opens.
 */
export function MovableDialogContent({
  className,
  style,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  ...props
}: ComponentPropsWithoutRef<typeof Dialog.Content>) {
  const contentRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragSession | null>(null);
  const [position, setPosition] = useState<DialogPosition | null>(null);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    onPointerDown?.(event);
    const content = contentRef.current;
    if (event.button !== 0 || !content) return;

    const rect = content.getBoundingClientRect();
    if (!position) setPosition({ left: rect.left, top: rect.top });

    const handle = (event.target as Element).closest(DRAG_HANDLE_SELECTOR);
    if (!handle || !content.contains(handle)) return;

    event.preventDefault();
    content.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    onPointerMove?.(event);
    const drag = dragRef.current;
    const content = contentRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !content) return;

    setPosition(
      clampDialogPosition(
        { left: event.clientX - drag.offsetX, top: event.clientY - drag.offsetY },
        content.offsetWidth,
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    contentRef.current?.releasePointerCapture(event.pointerId);
  };

  return (
    <Dialog.Content
      {...props}
      ref={contentRef}
      className={`${className ?? ''} [&_[data-dialog-drag-handle]]:cursor-move [&_[data-dialog-drag-handle]]:select-none`}
      style={position ? { ...style, left: position.left, top: position.top, transform: 'none' } : style}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={(event) => {
        onPointerUp?.(event);
        endDrag(event);
      }}
      onPointerCancel={(event) => {
        onPointerCancel?.(event);
        endDrag(event);
      }}
    />
  );
}
