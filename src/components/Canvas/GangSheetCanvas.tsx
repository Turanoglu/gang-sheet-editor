import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import { Stage, Layer, Rect, Line, Image, Transformer } from 'react-konva';
import Konva from 'konva';
import { useEditorStore } from '../../store/editorStore';
import { inchesToPx } from '../../types';

interface GangSheetCanvasProps {
  containerWidth: number;
  containerHeight: number;
  stageRef: React.RefObject<Konva.Stage | null>;
  displayScale: number;
  setDisplayScale: (scale: number) => void;
}

const GRID_SIZE_INCHES = 1; // 1 inch grid

export const GangSheetCanvas: React.FC<GangSheetCanvasProps> = ({
  containerWidth,
  containerHeight,
  stageRef,
  displayScale,
  setDisplayScale,
}) => {
  const transformerRef = useRef<Konva.Transformer>(null);

  const {
    boardSize,
    dpi,
    items,
    assets,
    selectedIds,
    setSelectedIds,
    updateItem,
    clearSelection,
    gridVisible,
    zoomLevel,
    checkOverflow,
    hasOverflow,
  } = useEditorStore();

  // Calculate board dimensions in pixels at 300 DPI
  const boardPxWidth = inchesToPx(boardSize.width, dpi);
  const boardPxHeight = inchesToPx(boardSize.height, dpi);

  // Calculate scale to fit board in container with padding, adjusted by zoom level
  useEffect(() => {
    const padding = 40;
    const scaleX = (containerWidth - padding * 2) / boardPxWidth;
    const scaleY = (containerHeight - padding * 2) / boardPxHeight;
    const baseScale = Math.min(scaleX, scaleY, 1);
    const newScale = baseScale * zoomLevel;
    setDisplayScale(Math.max(0.01, newScale));
  }, [containerWidth, containerHeight, boardPxWidth, boardPxHeight, setDisplayScale, zoomLevel]);

  // Check for overflow when items change
  useEffect(() => {
    checkOverflow();
  }, [items, checkOverflow]);

  // Displayed dimensions
  const displayWidth = boardPxWidth * displayScale;
  const displayHeight = boardPxHeight * displayScale;

  // Generate grid lines
  const gridLines = useMemo(() => {
    const lines: React.ReactElement[] = [];
    const gridSizePx = inchesToPx(GRID_SIZE_INCHES, dpi) * displayScale;

    // Vertical lines
    for (let x = 0; x <= displayWidth; x += gridSizePx) {
      lines.push(
        <Line
          key={`v-${x}`}
          points={[x, 0, x, displayHeight]}
          stroke="#e0e0e0"
          strokeWidth={0.5}
        />
      );
    }

    // Horizontal lines
    for (let y = 0; y <= displayHeight; y += gridSizePx) {
      lines.push(
        <Line
          key={`h-${y}`}
          points={[0, y, displayWidth, y]}
          stroke="#e0e0e0"
          strokeWidth={0.5}
        />
      );
    }

    return lines;
  }, [displayWidth, displayHeight, dpi, displayScale]);

  // Update transformer when selection changes
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

  // Handle stage click (deselect)
  const handleStageClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      // Only deselect if clicking on the stage/background, not on an item
      if (e.target === e.currentTarget || e.target.name() === 'background' || e.target.name() === 'grid') {
        clearSelection();
      }
    },
    [clearSelection]
  );

  // Handle item click (select)
  const handleItemClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>, itemId: string) => {
      e.cancelBubble = true;

      const isShiftKey = 'shiftKey' in e.evt && e.evt.shiftKey;

      if (isShiftKey) {
        // Multi-select with shift
        if (selectedIds.includes(itemId)) {
          setSelectedIds(selectedIds.filter((id) => id !== itemId));
        } else {
          setSelectedIds([...selectedIds, itemId]);
        }
      } else {
        setSelectedIds([itemId]);
      }
    },
    [selectedIds, setSelectedIds]
  );

  // Handle drag end
  const handleDragEnd = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>, itemId: string) => {
      const node = e.target;
      // Convert display coordinates back to board coordinates
      const newX = node.x() / displayScale;
      const newY = node.y() / displayScale;

      updateItem(itemId, {
        x: newX,
        y: newY,
      });
    },
    [displayScale, updateItem]
  );

  // Handle transform end
  const handleTransformEnd = useCallback(
    (e: Konva.KonvaEventObject<Event>, itemId: string) => {
      const node = e.target as Konva.Image;

      // Get the new dimensions accounting for scale
      const scaleX = node.scaleX();
      const scaleY = node.scaleY();

      // Calculate new width/height in board coordinates
      const newWidth = (node.width() * scaleX) / displayScale;
      const newHeight = (node.height() * scaleY) / displayScale;

      // Get new position in board coordinates
      const newX = node.x() / displayScale;
      const newY = node.y() / displayScale;

      // Get rotation
      const newRotation = node.rotation();

      // Reset scale to 1 and update width/height instead
      node.scaleX(1);
      node.scaleY(1);
      node.width(newWidth * displayScale);
      node.height(newHeight * displayScale);

      // Update state with board coordinates
      updateItem(itemId, {
        x: newX,
        y: newY,
        width: newWidth,
        height: newHeight,
        rotation: newRotation,
      });
    },
    [displayScale, updateItem]
  );

  // Create checkered pattern image for background (indicates transparency/empty areas)
  const checkerPattern = useMemo(() => {
    const size = 16;
    const patternCanvas = document.createElement('canvas');
    patternCanvas.width = size;
    patternCanvas.height = size;
    const ctx = patternCanvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#D0D0D0';
      ctx.fillRect(0, 0, size / 2, size / 2);
      ctx.fillRect(size / 2, size / 2, size / 2, size / 2);
      ctx.fillStyle = '#EBEBEB';
      ctx.fillRect(size / 2, 0, size / 2, size / 2);
      ctx.fillRect(0, size / 2, size / 2, size / 2);
    }
    const img = new window.Image();
    img.src = patternCanvas.toDataURL();
    return img;
  }, []);

  // Sort items by zIndex for rendering order
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => a.zIndex - b.zIndex);
  }, [items]);

  return (
    <Stage
      ref={stageRef}
      width={displayWidth}
      height={displayHeight}
      onClick={handleStageClick}
      onTap={handleStageClick}
    >
      {/* Background Layer (checkered pattern for editor visibility; hidden on export) */}
      <Layer name="backgroundLayer">
        <Rect
          name="background"
          x={0}
          y={0}
          width={displayWidth}
          height={displayHeight}
          fillPatternImage={checkerPattern}
          fillPatternRepeat="repeat"
        />
      </Layer>

      {/* Grid Layer */}
      <Layer name="gridLayer">
        {gridVisible && gridLines}
        {/* Border - always visible */}
        <Rect
          name="grid"
          x={0}
          y={0}
          width={displayWidth}
          height={displayHeight}
          stroke={hasOverflow ? "#ef4444" : "#999"}
          strokeWidth={hasOverflow ? 3 : 1}
          listening={false}
        />
      </Layer>

      {/* Items Layer */}
      <Layer name="itemsLayer">
        {sortedItems.map((item) => {
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
            />
          );
        })}

        <Transformer
          ref={transformerRef}
          name="transformer"
          boundBoxFunc={(oldBox, newBox) => {
            // Limit minimum size
            if (newBox.width < 10 || newBox.height < 10) {
              return oldBox;
            }
            return newBox;
          }}
          rotateEnabled={true}
          enabledAnchors={[
            'top-left',
            'top-right',
            'bottom-left',
            'bottom-right',
            'middle-left',
            'middle-right',
            'top-center',
            'bottom-center',
          ]}
        />
      </Layer>
    </Stage>
  );
};

// Separate component for canvas images to handle proper rendering
interface CanvasImageProps {
  item: {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    opacity: number;
    flipX: boolean;
    flipY: boolean;
  };
  image: HTMLImageElement;
  displayScale: number;
  onClick: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
  onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onTransformEnd: (e: Konva.KonvaEventObject<Event>) => void;
}

const CanvasImage: React.FC<CanvasImageProps> = ({
  item,
  image,
  displayScale,
  onClick,
  onDragEnd,
  onTransformEnd,
}) => {
  const imageRef = useRef<Konva.Image>(null);

  // Convert board coordinates to display coordinates
  const displayX = item.x * displayScale;
  const displayY = item.y * displayScale;
  const displayWidth = item.width * displayScale;
  const displayHeight = item.height * displayScale;

  // Handle flip by using negative scale
  const scaleX = item.flipX ? -1 : 1;
  const scaleY = item.flipY ? -1 : 1;

  return (
    <Image
      ref={imageRef}
      id={`item-${item.id}`}
      name="canvasItem"
      image={image}
      x={displayX}
      y={displayY}
      width={displayWidth}
      height={displayHeight}
      rotation={item.rotation}
      opacity={item.opacity}
      offsetX={item.flipX ? displayWidth : 0}
      offsetY={item.flipY ? displayHeight : 0}
      scaleX={scaleX}
      scaleY={scaleY}
      draggable
      onClick={onClick}
      onTap={onClick}
      onDragEnd={onDragEnd}
      onTransformEnd={onTransformEnd}
    />
  );
};

export default GangSheetCanvas;
