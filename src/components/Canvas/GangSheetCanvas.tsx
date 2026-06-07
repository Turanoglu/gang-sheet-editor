import React, { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { Stage, Layer, Rect, Line, Image, Text, Transformer } from 'react-konva';
import Konva from 'konva';
import { useEditorStore } from '../../store/editorStore';
import { inchesToPx } from '../../types';
import type { CanvasItem } from '../../types';

interface GangSheetCanvasProps {
  containerWidth: number;
  containerHeight: number;
  stageRef: React.RefObject<Konva.Stage | null>;
  displayScale: number;
  setDisplayScale: (scale: number) => void;
  isTextToolActive?: boolean;
  onTextToolPlaced?: () => void;
}

const GRID_SIZE_INCHES = 1;

// Context menu state
interface ContextMenu {
  x: number; // screen px
  y: number;
  itemId: string;
}

export const GangSheetCanvas: React.FC<GangSheetCanvasProps> = ({
  containerWidth,
  containerHeight,
  stageRef,
  displayScale,
  setDisplayScale,
  isTextToolActive = false,
  onTextToolPlaced,
}) => {
  const transformerRef = useRef<Konva.Transformer>(null);
  const selectionRectRef = useRef<Konva.Rect>(null);
  const isSelectingRef = useRef(false);
  const selectionStartRef = useRef({ x: 0, y: 0 });
  const didMarqueeRef = useRef(false);

  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  // Text inline editing
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [textareaStyle, setTextareaStyle] = useState<React.CSSProperties>({});
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const {
    boardSize,
    dpi,
    items,
    assets,
    selectedIds,
    setSelectedIds,
    updateItem,
    removeItem,
    duplicateItem,
    clearSelection,
    gridVisible,
    zoomLevel,
    checkOverflow,
    hasOverflow,
    checkOverlap,
    snapToGrid,
    addTextItem,
  } = useEditorStore();

  const boardPxWidth = inchesToPx(boardSize.width, dpi);
  const boardPxHeight = inchesToPx(boardSize.height, dpi);
  const gridSizeBoardPx = inchesToPx(GRID_SIZE_INCHES, dpi);

  useEffect(() => {
    const padding = 40;
    const scaleX = (containerWidth - padding * 2) / boardPxWidth;
    const scaleY = (containerHeight - padding * 2) / boardPxHeight;
    const baseScale = Math.min(scaleX, scaleY, 1);
    setDisplayScale(Math.max(0.01, baseScale * zoomLevel));
  }, [containerWidth, containerHeight, boardPxWidth, boardPxHeight, setDisplayScale, zoomLevel]);

  useEffect(() => {
    checkOverflow();
    checkOverlap();
  }, [items, checkOverflow, checkOverlap]);

  const displayWidth = boardPxWidth * displayScale;
  const displayHeight = boardPxHeight * displayScale;

  const gridLines = useMemo(() => {
    const lines: React.ReactElement[] = [];
    const gridSizePx = gridSizeBoardPx * displayScale;
    for (let x = 0; x <= displayWidth; x += gridSizePx) {
      lines.push(<Line key={`v-${x}`} points={[x, 0, x, displayHeight]} stroke="#e0e0e0" strokeWidth={0.5} />);
    }
    for (let y = 0; y <= displayHeight; y += gridSizePx) {
      lines.push(<Line key={`h-${y}`} points={[0, y, displayWidth, y]} stroke="#e0e0e0" strokeWidth={0.5} />);
    }
    return lines;
  }, [displayWidth, displayHeight, gridSizeBoardPx, displayScale]);

  useEffect(() => {
    const transformer = transformerRef.current;
    const stage = stageRef.current;
    if (!transformer || !stage) return;
    const selectedNodes = selectedIds
      .map((id) => stage.findOne(`#item-${id}`))
      .filter((node): node is Konva.Node => node !== null && node !== undefined);
    transformer.nodes(selectedNodes);
    transformer.getLayer()?.batchDraw();
  }, [selectedIds, items, stageRef]);

  // Snap helper: snap board-pixel value to nearest grid line
  const snapBoardPx = useCallback(
    (val: number) => Math.round(val / gridSizeBoardPx) * gridSizeBoardPx,
    [gridSizeBoardPx]
  );

  // Marquee
  const handleMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      // Close context menu on any click
      setContextMenu(null);

      if (isTextToolActive) return; // text tool uses click not drag

      const isBackground =
        e.target === e.currentTarget ||
        e.target.name() === 'background' ||
        e.target.name() === 'grid';
      if (!isBackground) return;

      const stage = stageRef.current;
      const pos = stage?.getPointerPosition();
      if (!pos) return;

      isSelectingRef.current = true;
      selectionStartRef.current = pos;
      const rect = selectionRectRef.current;
      if (rect) {
        rect.setAttrs({ x: pos.x, y: pos.y, width: 0, height: 0, visible: false });
        rect.getLayer()?.batchDraw();
      }
    },
    [stageRef, isTextToolActive]
  );

  const handleMouseMove = useCallback(
    (_e: Konva.KonvaEventObject<MouseEvent>) => {
      if (!isSelectingRef.current) return;
      const stage = stageRef.current;
      const pos = stage?.getPointerPosition();
      if (!pos) return;
      const start = selectionStartRef.current;
      const x = Math.min(start.x, pos.x);
      const y = Math.min(start.y, pos.y);
      const w = Math.abs(pos.x - start.x);
      const h = Math.abs(pos.y - start.y);
      const rect = selectionRectRef.current;
      if (rect) {
        rect.setAttrs({ x, y, width: w, height: h, visible: w > 4 || h > 4 });
        rect.getLayer()?.batchDraw();
      }
    },
    [stageRef]
  );

  const handleMouseUp = useCallback(
    (_e: Konva.KonvaEventObject<MouseEvent>) => {
      if (!isSelectingRef.current) return;
      isSelectingRef.current = false;
      const rect = selectionRectRef.current;
      if (!rect || !rect.visible()) return;
      rect.visible(false);
      rect.getLayer()?.batchDraw();
      didMarqueeRef.current = true;
      const selBox = rect.getClientRect();
      const stage = stageRef.current;
      if (!stage) return;
      const newSelectedIds: string[] = [];
      items.forEach((item) => {
        const node = stage.findOne(`#item-${item.id}`) as Konva.Node | undefined;
        if (!node) return;
        const nodeBox = node.getClientRect();
        if (
          nodeBox.x < selBox.x + selBox.width &&
          nodeBox.x + nodeBox.width > selBox.x &&
          nodeBox.y < selBox.y + selBox.height &&
          nodeBox.y + nodeBox.height > selBox.y
        ) {
          newSelectedIds.push(item.id);
        }
      });
      if (newSelectedIds.length > 0) setSelectedIds(newSelectedIds);
    },
    [stageRef, items, setSelectedIds]
  );

  const handleStageClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (didMarqueeRef.current) {
        didMarqueeRef.current = false;
        return;
      }
      const isBackground =
        e.target === e.currentTarget ||
        e.target.name() === 'background' ||
        e.target.name() === 'grid';

      // Text tool: place text on board click
      if (isTextToolActive && isBackground) {
        const stage = stageRef.current;
        const pos = stage?.getPointerPosition();
        if (pos) {
          const boardX = pos.x / displayScale;
          const boardY = pos.y / displayScale;
          addTextItem(boardX, boardY);
          onTextToolPlaced?.();
        }
        return;
      }

      if (isBackground) clearSelection();
    },
    [clearSelection, isTextToolActive, stageRef, displayScale, addTextItem, onTextToolPlaced]
  );

  const handleItemClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>, itemId: string) => {
      e.cancelBubble = true;
      setContextMenu(null);
      const isShiftKey = 'shiftKey' in e.evt && e.evt.shiftKey;
      if (isShiftKey) {
        setSelectedIds(selectedIds.includes(itemId)
          ? selectedIds.filter((id) => id !== itemId)
          : [...selectedIds, itemId]);
      } else {
        setSelectedIds([itemId]);
      }
    },
    [selectedIds, setSelectedIds]
  );

  // Double-click on text item → open inline textarea
  const handleItemDblClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>, itemId: string) => {
      const item = items.find((i) => i.id === itemId);
      if (!item || item.type !== 'text') return;
      e.cancelBubble = true;

      const stage = stageRef.current;
      const stageEl = stage?.container();
      if (!stageEl) return;
      const stageRect = stageEl.getBoundingClientRect();

      // Position textarea over the text item
      const tx = stageRect.left + item.x * displayScale;
      const ty = stageRect.top + item.y * displayScale;
      const tw = item.width * displayScale;
      const th = item.height * displayScale;

      setTextareaStyle({
        position: 'fixed',
        left: tx,
        top: ty,
        width: tw,
        minHeight: th,
        fontSize: (item.fontSize ?? 150) * displayScale,
        fontFamily: item.fontFamily ?? 'Arial',
        fontWeight: item.fontStyle?.includes('bold') ? 'bold' : 'normal',
        fontStyle: item.fontStyle?.includes('italic') ? 'italic' : 'normal',
        textAlign: item.textAlign ?? 'left',
        color: item.fill ?? '#ffffff',
        background: 'rgba(30,30,50,0.85)',
        border: '2px solid #3b82f6',
        borderRadius: 4,
        padding: 4,
        outline: 'none',
        resize: 'none',
        zIndex: 99999,
        lineHeight: 1.2,
        overflow: 'hidden',
        transform: `rotate(${item.rotation}deg)`,
        transformOrigin: 'top left',
      });
      setEditingTextId(itemId);

      // Deselect transformer while editing
      if (transformerRef.current) transformerRef.current.nodes([]);
    },
    [items, displayScale, stageRef]
  );

  // Commit textarea value back to item
  const commitTextEdit = useCallback(() => {
    if (!editingTextId || !textareaRef.current) return;
    const newText = textareaRef.current.value;
    updateItem(editingTextId, { text: newText });
    setEditingTextId(null);
  }, [editingTextId, updateItem]);

  const MIN_ITEM_BOARD_PX = inchesToPx(0.25, dpi);

  // dragBoundFunc factory — snaps to grid if enabled, otherwise free
  const makeDragBoundFunc = useCallback(
    (_item: CanvasItem) => (pos: { x: number; y: number }) => {
      if (!snapToGrid) return pos;
      const snappedBoardX = snapBoardPx(pos.x / displayScale);
      const snappedBoardY = snapBoardPx(pos.y / displayScale);
      return { x: snappedBoardX * displayScale, y: snappedBoardY * displayScale };
    },
    [snapToGrid, snapBoardPx, displayScale]
  );

  const handleDragEnd = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>, itemId: string) => {
      const node = e.target;
      let x = node.x() / displayScale;
      let y = node.y() / displayScale;
      if (snapToGrid) {
        x = snapBoardPx(x);
        y = snapBoardPx(y);
        node.x(x * displayScale);
        node.y(y * displayScale);
      }
      updateItem(itemId, { x, y });
    },
    [displayScale, updateItem, snapToGrid, snapBoardPx]
  );

  const handleTransformEnd = useCallback(
    (e: Konva.KonvaEventObject<Event>, itemId: string) => {
      const node = e.target as Konva.Image;
      const scaleX = node.scaleX();
      const scaleY = node.scaleY();
      const newWidth = Math.max(MIN_ITEM_BOARD_PX, (node.width() * scaleX) / displayScale);
      const newHeight = Math.max(MIN_ITEM_BOARD_PX, (node.height() * scaleY) / displayScale);
      const newX = node.x() / displayScale;
      const newY = node.y() / displayScale;
      const newRotation = node.rotation();
      node.scaleX(1);
      node.scaleY(1);
      node.width(newWidth * displayScale);
      node.height(newHeight * displayScale);
      updateItem(itemId, { x: newX, y: newY, width: newWidth, height: newHeight, rotation: newRotation });
    },
    [displayScale, updateItem, MIN_ITEM_BOARD_PX]
  );

  // Context menu
  const handleContextMenu = useCallback(
    (e: Konva.KonvaEventObject<PointerEvent>, itemId: string) => {
      e.evt.preventDefault();
      e.cancelBubble = true;
      setSelectedIds([itemId]);
      setContextMenu({ x: e.evt.clientX, y: e.evt.clientY, itemId });
    },
    [setSelectedIds]
  );

  const sortedItems = useMemo(() => [...items].sort((a, b) => a.zIndex - b.zIndex), [items]);

  const isLocked = (item: CanvasItem) => !!item.locked;

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <Stage
        ref={stageRef}
        width={displayWidth}
        height={displayHeight}
        onClick={handleStageClick}
        onTap={handleStageClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        style={{ cursor: isTextToolActive ? 'text' : undefined }}
      >
        <Layer name="backgroundLayer">
          <Rect name="background" x={0} y={0} width={displayWidth} height={displayHeight} fill="#1a1a2e" />
        </Layer>

        <Layer name="gridLayer">
          {gridVisible && gridLines}
          <Rect
            name="grid"
            x={0} y={0}
            width={displayWidth}
            height={displayHeight}
            stroke={hasOverflow ? '#ef4444' : '#999'}
            strokeWidth={hasOverflow ? 3 : 1}
            listening={false}
          />
        </Layer>

        <Layer name="itemsLayer">
          {sortedItems.map((item) => {
            const locked = isLocked(item);
            if (item.type === 'text') {
              return (
                <CanvasTextItem
                  key={item.id}
                  item={item}
                  displayScale={displayScale}
                  onClick={(e) => handleItemClick(e, item.id)}
                  onDblClick={(e) => handleItemDblClick(e, item.id)}
                  onDragEnd={(e) => handleDragEnd(e, item.id)}
                  onTransformEnd={(e) => handleTransformEnd(e, item.id)}
                  onContextMenu={(e) => handleContextMenu(e as any, item.id)}
                  draggable={!locked}
                  dragBoundFunc={makeDragBoundFunc(item)}
                />
              );
            }
            const asset = assets[item.assetId];
            if (!asset) return null;
            return (
              <CanvasImage
                key={item.id}
                item={item}
                image={asset.imageEl}
                displayScale={displayScale}
                onClick={(e) => handleItemClick(e, item.id)}
                onDragEnd={(e) => handleDragEnd(e, item.id)}
                onTransformEnd={(e) => handleTransformEnd(e, item.id)}
                onContextMenu={(e) => handleContextMenu(e as any, item.id)}
                draggable={!locked}
                dragBoundFunc={makeDragBoundFunc(item)}
              />
            );
          })}

          <Transformer
            ref={transformerRef}
            name="transformer"
            boundBoxFunc={(oldBox, newBox) => {
              const minDisplay = MIN_ITEM_BOARD_PX * displayScale;
              if (newBox.width < minDisplay || newBox.height < minDisplay) return oldBox;
              return newBox;
            }}
            rotateEnabled={true}
            rotateAnchorOffset={24}
            enabledAnchors={[
              'top-left', 'top-right', 'bottom-left', 'bottom-right',
              'middle-left', 'middle-right', 'top-center', 'bottom-center',
            ]}
            anchorSize={11}
            anchorCornerRadius={6}
            anchorFill="transparent"
            anchorStroke="#3b82f6"
            anchorStrokeWidth={2}
            borderStroke="#3b82f6"
            borderStrokeWidth={1.5}
            borderDash={[5, 3]}
          />
        </Layer>

        <Layer name="selectionLayer" listening={false}>
          <Rect
            ref={selectionRectRef}
            fill="rgba(0,100,255,0.08)"
            stroke="rgba(0,100,255,0.6)"
            strokeWidth={1}
            dash={[4, 3]}
            visible={false}
            listening={false}
          />
        </Layer>
      </Stage>

      {/* Inline text editor textarea */}
      {editingTextId && (
        <textarea
          ref={textareaRef}
          style={textareaStyle}
          defaultValue={items.find((i) => i.id === editingTextId)?.text ?? ''}
          autoFocus
          onBlur={commitTextEdit}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { setEditingTextId(null); }
            // Shift+Enter = new line, Enter alone = commit
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitTextEdit(); }
          }}
        />
      )}

      {/* Context menu */}
      {contextMenu && (
        <ContextMenuOverlay
          x={contextMenu.x}
          y={contextMenu.y}
          itemId={contextMenu.itemId}
          items={items}
          onClose={() => setContextMenu(null)}
          onDuplicate={(id) => { duplicateItem(id); setContextMenu(null); }}
          onDelete={(id) => { removeItem(id); setContextMenu(null); }}
          onLockToggle={(id) => {
            const item = items.find((i) => i.id === id);
            if (item) updateItem(id, { locked: !item.locked });
            setContextMenu(null);
          }}
          onBringForward={(id) => {
            const item = items.find((i) => i.id === id);
            if (item) updateItem(id, { zIndex: item.zIndex + 1 });
            setContextMenu(null);
          }}
          onSendBackward={(id) => {
            const item = items.find((i) => i.id === id);
            if (item) updateItem(id, { zIndex: Math.max(0, item.zIndex - 1) });
            setContextMenu(null);
          }}
        />
      )}
    </div>
  );
};

// ---- CanvasImage ----
interface CanvasImageProps {
  item: CanvasItem;
  image: HTMLImageElement;
  displayScale: number;
  onClick: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
  onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onTransformEnd: (e: Konva.KonvaEventObject<Event>) => void;
  onContextMenu: (e: Konva.KonvaEventObject<PointerEvent>) => void;
  draggable: boolean;
  dragBoundFunc: (pos: { x: number; y: number }) => { x: number; y: number };
}

const CanvasImage: React.FC<CanvasImageProps> = ({
  item, image, displayScale, onClick, onDragEnd, onTransformEnd, onContextMenu, draggable, dragBoundFunc,
}) => {
  const scaleX = item.flipX ? -1 : 1;
  const scaleY = item.flipY ? -1 : 1;
  const dw = item.width * displayScale;
  const dh = item.height * displayScale;
  return (
    <Image
      id={`item-${item.id}`}
      name="canvasItem"
      image={image}
      x={item.x * displayScale}
      y={item.y * displayScale}
      width={dw}
      height={dh}
      rotation={item.rotation}
      opacity={item.opacity}
      offsetX={item.flipX ? dw : 0}
      offsetY={item.flipY ? dh : 0}
      scaleX={scaleX}
      scaleY={scaleY}
      draggable={draggable}
      dragBoundFunc={dragBoundFunc}
      onClick={onClick}
      onTap={onClick}
      onDragEnd={onDragEnd}
      onTransformEnd={onTransformEnd}
      onContextMenu={onContextMenu}
    />
  );
};

// ---- CanvasTextItem ----
interface CanvasTextItemProps {
  item: CanvasItem;
  displayScale: number;
  onClick: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
  onDblClick: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onTransformEnd: (e: Konva.KonvaEventObject<Event>) => void;
  onContextMenu: (e: Konva.KonvaEventObject<PointerEvent>) => void;
  draggable: boolean;
  dragBoundFunc: (pos: { x: number; y: number }) => { x: number; y: number };
}

const CanvasTextItem: React.FC<CanvasTextItemProps> = ({
  item, displayScale, onClick, onDblClick, onDragEnd, onTransformEnd, onContextMenu, draggable, dragBoundFunc,
}) => {
  return (
    <Text
      id={`item-${item.id}`}
      name="canvasItem"
      text={item.text ?? ''}
      x={item.x * displayScale}
      y={item.y * displayScale}
      width={item.width * displayScale}
      height={item.height * displayScale}
      fontSize={(item.fontSize ?? 150) * displayScale}
      fontFamily={item.fontFamily ?? 'Arial'}
      fontStyle={item.fontStyle ?? 'normal'}
      align={item.textAlign ?? 'left'}
      fill={item.fill ?? '#ffffff'}
      rotation={item.rotation}
      opacity={item.opacity}
      wrap="word"
      draggable={draggable}
      dragBoundFunc={dragBoundFunc}
      onClick={onClick}
      onTap={onClick}
      onDblClick={onDblClick}
      onDragEnd={onDragEnd}
      onTransformEnd={onTransformEnd}
      onContextMenu={onContextMenu}
    />
  );
};

// ---- Context Menu Overlay ----
interface ContextMenuOverlayProps {
  x: number;
  y: number;
  itemId: string;
  items: CanvasItem[];
  onClose: () => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onLockToggle: (id: string) => void;
  onBringForward: (id: string) => void;
  onSendBackward: (id: string) => void;
}

const ContextMenuOverlay: React.FC<ContextMenuOverlayProps> = ({
  x, y, itemId, items, onClose, onDuplicate, onDelete, onLockToggle, onBringForward, onSendBackward,
}) => {
  const item = items.find((i) => i.id === itemId);
  const isLocked = !!item?.locked;

  // Close on outside click
  useEffect(() => {
    const handler = () => onClose();
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Clamp to viewport
  const menuWidth = 180;
  const menuHeight = 200;
  const left = Math.min(x, window.innerWidth - menuWidth - 8);
  const top = Math.min(y, window.innerHeight - menuHeight - 8);

  const btn = 'flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-white/10 rounded transition-colors';

  return (
    <div
      style={{ position: 'fixed', left, top, zIndex: 99998, minWidth: menuWidth }}
      className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl py-1 text-white"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button className={btn} onClick={() => onDuplicate(itemId)}>
        <span>⧉</span> Duplicate
        <span className="ml-auto text-gray-500 text-xs">Ctrl+D</span>
      </button>
      <button className={btn} onClick={() => onBringForward(itemId)}>
        <span>↑</span> Bring Forward
      </button>
      <button className={btn} onClick={() => onSendBackward(itemId)}>
        <span>↓</span> Send Backward
      </button>
      <button className={btn} onClick={() => onLockToggle(itemId)}>
        <span>{isLocked ? '🔓' : '🔒'}</span> {isLocked ? 'Unlock' : 'Lock'}
      </button>
      <div className="border-t border-gray-700 my-1" />
      <button className={`${btn} text-red-400 hover:bg-red-500/10`} onClick={() => onDelete(itemId)}>
        <span>✕</span> Delete
        <span className="ml-auto text-gray-500 text-xs">Del</span>
      </button>
    </div>
  );
};

export default GangSheetCanvas;
