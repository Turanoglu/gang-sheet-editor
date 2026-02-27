import React, { useRef, useCallback, useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useEditorStore } from '../../store/editorStore';
import { loadImageFile } from '../../utils/export';
import { inchesToPx, pxToInches, calculateResolution, getResolutionQuality } from '../../types';
import type { Asset, CanvasItem } from '../../types';

// ==================== EDIT IMAGE MODAL ====================
const EditImageModal: React.FC<{
  asset: Asset;
  onClose: () => void;
  onApply: (croppedDataUrl: string, newWidth: number, newHeight: number) => void;
}> = ({ asset, onClose, onApply }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [cropStart, setCropStart] = useState<{ x: number; y: number } | null>(null);
  const [cropEnd, setCropEnd] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Scale image to fit in modal (max 480px)
  const maxDisplay = 480;
  const scale = Math.min(maxDisplay / asset.originalWidth, maxDisplay / asset.originalHeight, 1);
  const displayWidth = Math.round(asset.originalWidth * scale);
  const displayHeight = Math.round(asset.originalHeight * scale);

  const getRelativePos = (e: React.MouseEvent) => {
    const rect = containerRef.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(e.clientX - rect.left, displayWidth)),
      y: Math.max(0, Math.min(e.clientY - rect.top, displayHeight)),
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const pos = getRelativePos(e);
    setCropStart(pos);
    setCropEnd(pos);
    setIsDragging(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setCropEnd(getRelativePos(e));
  };

  const handleMouseUp = () => setIsDragging(false);

  const cropRect = cropStart && cropEnd
    ? {
        x: Math.min(cropStart.x, cropEnd.x),
        y: Math.min(cropStart.y, cropEnd.y),
        w: Math.abs(cropEnd.x - cropStart.x),
        h: Math.abs(cropEnd.y - cropStart.y),
      }
    : null;

  const handleApplyCrop = () => {
    if (!cropRect || cropRect.w < 5 || cropRect.h < 5) {
      alert('Lütfen kırpılacak bir alan seçin.');
      return;
    }
    // Convert display coords to original image coords
    const srcX = cropRect.x / scale;
    const srcY = cropRect.y / scale;
    const srcW = cropRect.w / scale;
    const srcH = cropRect.h / scale;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(srcW);
    canvas.height = Math.round(srcH);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(asset.imageEl, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);
    onApply(canvas.toDataURL('image/png'), Math.round(srcW), Math.round(srcH));
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/70 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl" style={{ maxWidth: '560px', width: '100%' }}>
          {/* Header */}
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-base font-semibold text-gray-800">Edit Image — Crop</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="p-5">
            <p className="text-xs text-gray-500 mb-3">
              Kırpmak istediğin alanı sürükleyerek seç, ardından <strong>Apply Crop</strong>'a tıkla.
            </p>
            <div className="flex justify-center">
              <div
                ref={containerRef}
                className="relative select-none rounded-lg overflow-hidden border border-gray-200"
                style={{ width: displayWidth, height: displayHeight, cursor: 'crosshair' }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                <img
                  src={asset.dataUrl}
                  alt={asset.name}
                  style={{ width: displayWidth, height: displayHeight, display: 'block' }}
                  draggable={false}
                />
                {cropRect && cropRect.w > 2 && cropRect.h > 2 && (
                  <div
                    className="absolute border-2 border-white pointer-events-none"
                    style={{
                      left: cropRect.x,
                      top: cropRect.y,
                      width: cropRect.w,
                      height: cropRect.h,
                      boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
                    }}
                  />
                )}
              </div>
            </div>
            {cropRect && cropRect.w > 2 && (
              <p className="text-center text-xs text-gray-400 mt-2">
                Seçim: {Math.round(cropRect.w / scale)} × {Math.round(cropRect.h / scale)} px
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl flex justify-between items-center">
            <button
              onClick={() => { setCropStart(null); setCropEnd(null); }}
              className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Reset
            </button>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleApplyCrop}
                disabled={!cropRect || cropRect.w < 5 || cropRect.h < 5}
                className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-40"
              >
                Apply Crop
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export const LeftSidebar: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [widthInput, setWidthInput] = useState('');
  const [heightInput, setHeightInput] = useState('');
  const [quantityInput, setQuantityInput] = useState(1);

  const {
    assets,
    items,
    addAsset,
    addItem,
    selectedIds,
    setSelectedIds,
    updateItem,
    duplicateSelectedItems,
    autoFillSheet,
    dpi,
    setItemQuantity,
    applyQuantities,
    removeAsset,
  } = useEditorStore();

  // Get selected item
  const selectedItem = selectedIds.length === 1
    ? items.find((item) => item.id === selectedIds[0])
    : null;

  const selectedAsset = selectedItem ? assets[selectedItem.assetId] : null;

  // Actual count of canvas items for selected asset
  const actualItemCount = selectedItem
    ? items.filter(item => item.assetId === selectedItem.assetId).length
    : 1;

  // Sync width/height inputs only when the SELECTED ITEM changes
  useEffect(() => {
    if (selectedItem) {
      setWidthInput(pxToInches(selectedItem.width, dpi).toFixed(2));
      setHeightInput(pxToInches(selectedItem.height, dpi).toFixed(2));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedItem?.id, dpi]);

  // Sync quantityInput with actual item count when asset changes or items are added/removed
  useEffect(() => {
    setQuantityInput(actualItemCount);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedItem?.assetId, actualItemCount]);

  // Apply crop: replace asset with cropped version
  const handleApplyCrop = useCallback(async (croppedDataUrl: string, newWidth: number, newHeight: number) => {
    if (!editingAsset) return;
    const img = new Image();
    img.onload = () => {
      const updatedAsset: Asset = {
        ...editingAsset,
        dataUrl: croppedDataUrl,
        imageEl: img,
        originalWidth: newWidth,
        originalHeight: newHeight,
      };
      addAsset(updatedAsset);
      setEditingAsset(null);
    };
    img.src = croppedDataUrl;
  }, [editingAsset, addAsset]);

  // Handle file upload
  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        if (!file.type.startsWith('image/')) {
          alert(`File ${file.name} is not an image`);
          continue;
        }

        try {
          const { dataUrl, imageEl, width, height } = await loadImageFile(file);

          const assetId = uuidv4();

          const asset: Asset = {
            id: assetId,
            name: file.name,
            originalWidth: width,
            originalHeight: height,
            imageEl,
            dataUrl,
          };

          addAsset(asset);

          const maxInitialWidth = inchesToPx(6, dpi);
          const maxInitialHeight = inchesToPx(6, dpi);

          let itemWidth = width;
          let itemHeight = height;

          if (itemWidth > maxInitialWidth) {
            const scale = maxInitialWidth / itemWidth;
            itemWidth = maxInitialWidth;
            itemHeight = itemHeight * scale;
          }

          if (itemHeight > maxInitialHeight) {
            const scale = maxInitialHeight / itemHeight;
            itemHeight = maxInitialHeight;
            itemWidth = itemWidth * scale;
          }

          const canvasItem: CanvasItem = {
            id: uuidv4(),
            assetId,
            x: inchesToPx(0.5, dpi),
            y: inchesToPx(0.5, dpi) + i * inchesToPx(0.25, dpi),
            width: itemWidth,
            height: itemHeight,
            rotation: 0,
            lockedAspect: true,
            opacity: 1,
            flipX: false,
            flipY: false,
            zIndex: Math.max(...items.map((item) => item.zIndex), 0) + 1 + i,
          };

          addItem(canvasItem);
        } catch (error) {
          console.error(`Failed to load ${file.name}:`, error);
          alert(`Failed to load ${file.name}`);
        }
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [addAsset, addItem, dpi, items]
  );

  // Handle drag and drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      if (!file.type.startsWith('image/')) {
        alert(`File ${file.name} is not an image`);
        continue;
      }

      try {
        const { dataUrl, imageEl, width, height } = await loadImageFile(file);

        const assetId = uuidv4();

        const asset: Asset = {
          id: assetId,
          name: file.name,
          originalWidth: width,
          originalHeight: height,
          imageEl,
          dataUrl,
        };

        addAsset(asset);

        const maxInitialWidth = inchesToPx(6, dpi);
        const maxInitialHeight = inchesToPx(6, dpi);

        let itemWidth = width;
        let itemHeight = height;

        if (itemWidth > maxInitialWidth) {
          const scale = maxInitialWidth / itemWidth;
          itemWidth = maxInitialWidth;
          itemHeight = itemHeight * scale;
        }

        if (itemHeight > maxInitialHeight) {
          const scale = maxInitialHeight / itemHeight;
          itemHeight = maxInitialHeight;
          itemWidth = itemWidth * scale;
        }

        const canvasItem: CanvasItem = {
          id: uuidv4(),
          assetId,
          x: inchesToPx(0.5, dpi),
          y: inchesToPx(0.5, dpi) + i * inchesToPx(0.25, dpi),
          width: itemWidth,
          height: itemHeight,
          rotation: 0,
          lockedAspect: true,
          opacity: 1,
          flipX: false,
          flipY: false,
          zIndex: Math.max(...items.map((item) => item.zIndex), 0) + 1 + i,
        };

        addItem(canvasItem);
      } catch (error) {
        console.error(`Failed to load ${file.name}:`, error);
        alert(`Failed to load ${file.name}`);
      }
    }
  }, [addAsset, addItem, dpi, items]);

  // Handle width change
  const handleWidthChange = (value: string) => {
    if (!selectedItem) return;
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue <= 0) return;

    const newWidthPx = inchesToPx(numValue, dpi);
    if (selectedItem.lockedAspect) {
      const aspectRatio = selectedItem.width / selectedItem.height;
      const newHeightPx = newWidthPx / aspectRatio;
      updateItem(selectedItem.id, { width: newWidthPx, height: newHeightPx });
      setHeightInput(pxToInches(newHeightPx, dpi).toFixed(2));
    } else {
      updateItem(selectedItem.id, { width: newWidthPx });
    }
    setWidthInput(pxToInches(newWidthPx, dpi).toFixed(2));
  };

  // Handle height change
  const handleHeightChange = (value: string) => {
    if (!selectedItem) return;
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue <= 0) return;

    const newHeightPx = inchesToPx(numValue, dpi);
    if (selectedItem.lockedAspect) {
      const aspectRatio = selectedItem.width / selectedItem.height;
      const newWidthPx = newHeightPx * aspectRatio;
      updateItem(selectedItem.id, { width: newWidthPx, height: newHeightPx });
    } else {
      updateItem(selectedItem.id, { height: newHeightPx });
    }
  };

  // Toggle aspect lock
  const handleToggleAspectLock = () => {
    if (!selectedItem) return;
    updateItem(selectedItem.id, { lockedAspect: !selectedItem.lockedAspect });
  };

  // Get count of items using each asset
  const getAssetItemCount = (assetId: string) => {
    return items.filter(item => item.assetId === assetId).length;
  };

  // Select first item with this asset
  const selectAssetItem = (assetId: string) => {
    const item = items.find(i => i.assetId === assetId);
    if (item) {
      setSelectedIds([item.id]);
    }
  };

  const thumbnails = Object.values(assets);

  return (
    <div className="w-72 bg-white border-r border-gray-200 flex flex-col h-full">
      {/* Edit Image Modal */}
      {editingAsset && (
        <EditImageModal
          asset={editingAsset}
          onClose={() => setEditingAsset(null)}
          onApply={handleApplyCrop}
        />
      )}
      {/* Upload Area */}
      <div className="p-4 border-b border-gray-100">
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all group
            ${isDragOver 
              ? 'border-blue-500 bg-blue-100 scale-105' 
              : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50/50'
            }`}
        >
          <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-gray-100 group-hover:bg-blue-100 
                          flex items-center justify-center transition-colors">
            <svg className="w-5 h-5 text-gray-400 group-hover:text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
          </div>
          <p className="text-xs text-gray-500 mb-2">
            Drag & drop a file here, or click to
          </p>
          <button className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors">
            📤 Upload Image(s)
          </button>
          <p className="text-[10px] text-gray-400 mt-2 leading-relaxed">
            Upload images larger than 300 x 300px.<br />
            Supported formats: png, webp, jpg, jpeg, svg, psd, ai, eps, pdf
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileUpload}
          className="hidden"
        />
      </div>

      {/* Thumbnail Gallery */}
      <div className="flex-1 overflow-y-auto p-3">
        {thumbnails.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">
            No images uploaded yet
          </div>
        ) : (
          <div className="space-y-3">
            {thumbnails.map((asset) => {
              const itemCount = getAssetItemCount(asset.id);
              const isSelected = selectedAsset?.id === asset.id;
              
              return (
                <div
                  key={asset.id}
                  onClick={() => selectAssetItem(asset.id)}
                  className={`relative rounded-xl border-2 p-2 cursor-pointer transition-all
                    ${isSelected 
                      ? 'border-blue-500 bg-blue-50 shadow-md' 
                      : 'border-gray-200 hover:border-blue-300 hover:shadow-sm'
                    }`}
                >
                  {/* Remove button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      // Remove asset and all related items
                      removeAsset(asset.id);
                    }}
                    className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 hover:bg-red-600 
                               text-white rounded-full text-xs flex items-center justify-center 
                               shadow-md transition-colors z-10"
                  >
                    ×
                  </button>

                  {/* Image count badge */}
                  <span className="absolute top-1 left-1 bg-blue-500 text-white text-[10px] 
                                   px-1.5 py-0.5 rounded-full font-medium shadow-sm z-10">
                    {itemCount}
                  </span>

                  {/* Thumbnail */}
                  <div className="bg-gray-50 rounded-lg p-2 mb-2">
                    <img
                      src={asset.dataUrl}
                      alt={asset.name}
                      className="w-full h-24 object-contain"
                    />
                  </div>

                  {/* Edit button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingAsset(asset);
                    }}
                    className="w-full bg-blue-500 hover:bg-blue-600 text-white py-1.5
                               rounded-lg text-xs font-medium transition-colors"
                  >
                    Edit Image
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Selected Item Properties */}
      {selectedItem && (
        <div className="border-t border-gray-200 p-4 bg-gray-50 space-y-4 overflow-y-auto max-h-[50vh] shrink-0">
          {/* Dimensions */}
          <div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Width:</label>
                <div className="flex items-center">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={widthInput}
                    onChange={(e) => setWidthInput(e.target.value)}
                    onFocus={(e) => e.target.select()}
                    onBlur={() => handleWidthChange(widthInput)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleWidthChange(widthInput);
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    className="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg text-sm
                               focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <span className="text-xs text-gray-400 ml-2 font-medium">in</span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Height:</label>
                <div className="flex items-center">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={heightInput}
                    onChange={(e) => setHeightInput(e.target.value)}
                    onFocus={(e) => e.target.select()}
                    onBlur={() => handleHeightChange(heightInput)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleHeightChange(heightInput);
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    className="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg text-sm
                               focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <span className="text-xs text-gray-400 ml-2 font-medium">in</span>
                </div>
              </div>
            </div>
            
            {/* Aspect Ratio */}
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-gray-500">Aspect Ratio:</span>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-600">
                  {(selectedItem.width / selectedItem.height).toFixed(2)}
                </span>
                <button
                  onClick={handleToggleAspectLock}
                  className={`p-1 rounded transition-colors ${
                    selectedItem.lockedAspect 
                      ? 'text-blue-500 bg-blue-50' 
                      : 'text-gray-400 bg-gray-100'
                  }`}
                  title={selectedItem.lockedAspect ? 'Aspect Locked' : 'Aspect Unlocked'}
                >
                  {selectedItem.lockedAspect ? '🔒' : '🔓'}
                </button>
              </div>
            </div>

            {/* Resolution */}
            {(() => {
              const selectedAssetData = assets[selectedItem.assetId];
              if (!selectedAssetData) return null;
              
              const widthInches = pxToInches(selectedItem.width, dpi);
              const heightInches = pxToInches(selectedItem.height, dpi);
              const resolutionW = calculateResolution(selectedAssetData.originalWidth, widthInches);
              const resolutionH = calculateResolution(selectedAssetData.originalHeight, heightInches);
              const avgResolution = Math.round((resolutionW + resolutionH) / 2);
              const quality = getResolutionQuality(avgResolution);

              return (
                <div className="mt-3 p-3 bg-white rounded-lg border border-gray-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-gray-600">Resolution:</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${quality.color} ${quality.textColor}`}>
                      {quality.label}
                    </span>
                  </div>
                  <div className="flex items-center justify-center gap-2">
                    <span className={`text-2xl font-bold ${quality.textColor}`}>
                      {avgResolution}
                    </span>
                    <span className="text-sm text-gray-500">DPI</span>
                  </div>
                  <div className="mt-2 text-[10px] text-gray-400 text-center">
                    Original: {selectedAssetData.originalWidth} × {selectedAssetData.originalHeight}px
                  </div>
                  
                  {/* Resolution Bar */}
                  <div className="mt-2">
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-300 ${
                          avgResolution >= 300 ? 'bg-green-500' :
                          avgResolution >= 200 ? 'bg-blue-500' :
                          avgResolution >= 150 ? 'bg-yellow-500' :
                          avgResolution >= 100 ? 'bg-orange-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${Math.min(100, (avgResolution / 300) * 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between mt-1 text-[9px] text-gray-400">
                      <span>Low</span>
                      <span>300 DPI</span>
                    </div>
                  </div>
                  
                  {/* Warning if resolution is too low */}
                  {avgResolution < 150 && (
                    <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-[10px] text-red-600">
                      ⚠️ Low resolution may result in blurry prints. Consider reducing the image size.
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Image Quantity */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Image Quantity:</label>
            <div className="flex gap-2">
              <input
                type="number"
                min="1"
                value={quantityInput}
                onChange={(e) => setQuantityInput(parseInt(e.target.value) || 1)}
                className="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                onClick={() => {
                  setItemQuantity(selectedItem.assetId, quantityInput);
                  applyQuantities();
                }}
                className="px-3 py-1.5 bg-purple-500 hover:bg-purple-600 text-white rounded-lg
                           text-xs font-medium transition-colors"
                title="Apply quantity to create copies"
              >
                Apply
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={autoFillSheet}
              className="bg-emerald-500 hover:bg-emerald-600 text-white py-2 rounded-lg 
                         text-xs font-medium transition-colors"
            >
              Auto Fill Sheet
            </button>
            <button
              onClick={duplicateSelectedItems}
              className="bg-blue-500 hover:bg-blue-600 text-white py-2 rounded-lg 
                         text-xs font-medium transition-colors"
            >
              Duplicate Image
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default LeftSidebar;

