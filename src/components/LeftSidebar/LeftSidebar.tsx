import React, { useRef, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useEditorStore } from '../../store/editorStore';
import { loadImageFile } from '../../utils/export';
import { inchesToPx, pxToInches } from '../../types';
import type { Asset, CanvasItem } from '../../types';

export const LeftSidebar: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const {
    assets,
    items,
    addAsset,
    addItem,
    selectedIds,
    setSelectedIds,
    updateItem,
    duplicateSelectedItems,
    removeSelectedItems,
    autoFillSheet,
    dpi,
  } = useEditorStore();

  // Get selected item
  const selectedItem = selectedIds.length === 1
    ? items.find((item) => item.id === selectedIds[0])
    : null;

  const selectedAsset = selectedItem ? assets[selectedItem.assetId] : null;

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
    } else {
      updateItem(selectedItem.id, { width: newWidthPx });
    }
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
      {/* Upload Area */}
      <div className="p-4 border-b border-gray-100">
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-gray-300 rounded-xl p-4 text-center 
                     hover:border-blue-400 hover:bg-blue-50/50 cursor-pointer transition-all group"
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
                      // Remove all items with this asset
                      const itemsToRemove = items.filter(i => i.assetId === asset.id);
                      itemsToRemove.forEach(item => {
                        setSelectedIds([item.id]);
                        removeSelectedItems();
                      });
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
        <div className="border-t border-gray-200 p-4 bg-gray-50 space-y-4">
          {/* Dimensions */}
          <div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Width:</label>
                <div className="flex items-center">
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={pxToInches(selectedItem.width, dpi).toFixed(2)}
                    onChange={(e) => handleWidthChange(e.target.value)}
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
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={pxToInches(selectedItem.height, dpi).toFixed(2)}
                    onChange={(e) => handleHeightChange(e.target.value)}
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
          </div>

          {/* Image Quantity */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Image Quantity:</label>
            <input
              type="number"
              min="1"
              defaultValue="1"
              className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm 
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
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

