import React, { useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useEditorStore } from '../../store/editorStore';
import { pxToInches, inchesToPx } from '../../types';
import type { Asset, CanvasItem } from '../../types';
import { loadImageFile } from '../../utils/export';
import { removeBackground, upscaleImage } from '../../utils/imageProcessing';

export const PropertiesPanel: React.FC<{
  onAddSheet?: () => void;
  onSwitchSheet?: (id: string) => void;
}> = ({ onAddSheet, onSwitchSheet }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [bgRemoving, setBgRemoving] = useState(false);
  const [upscaling, setUpscaling] = useState(false);

  const {
    items,
    selectedIds,
    assets,
    boardSize,
    dpi,
    duplicateSelectedItems,
    clearAllItems,
    autoFillSheet,
    addAsset,
    updateAsset,
    updateItem,
    addItem,
    sheets,
    activeSheetId,
    addSheet,
    switchSheet,
    deleteSheet,
  } = useEditorStore();

  // Get selected item info
  const selectedItem = selectedIds.length === 1
    ? items.find((item) => item.id === selectedIds[0])
    : null;

  const selectedAsset = selectedItem ? assets[selectedItem.assetId] : null;

  const handleRemoveBackground = async () => {
    if (!selectedItem || !selectedAsset) return;
    setBgRemoving(true);
    try {
      const newDataUrl = await removeBackground(selectedAsset.dataUrl);
      const img = new Image();
      await new Promise<void>((resolve) => { img.onload = () => resolve(); img.src = newDataUrl; });
      updateAsset(selectedAsset.id, { dataUrl: newDataUrl, imageEl: img });
    } catch (e) {
      alert('Background removal failed: ' + (e as Error).message);
    } finally {
      setBgRemoving(false);
    }
  };

  const handleUpscale = async () => {
    if (!selectedItem || !selectedAsset) return;
    setUpscaling(true);
    try {
      const { dataUrl: newDataUrl, width: newW, height: newH } = await upscaleImage(selectedAsset.dataUrl);
      const img = new Image();
      await new Promise<void>((resolve) => { img.onload = () => resolve(); img.src = newDataUrl; });
      const scaleX = newW / selectedAsset.originalWidth;
      const scaleY = newH / selectedAsset.originalHeight;
      updateAsset(selectedAsset.id, { dataUrl: newDataUrl, imageEl: img, originalWidth: newW, originalHeight: newH });
      updateItem(selectedItem.id, { width: selectedItem.width * scaleX, height: selectedItem.height * scaleY });
    } catch (e) {
      alert('Upscale failed: ' + (e as Error).message);
    } finally {
      setUpscaling(false);
    }
  };

  // Calculate total images
  const totalImages = items.length;

  // Handle file upload for "Add new design"
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
  };

  return (
    <div className="w-80 bg-gray-50 border-l border-gray-200 flex flex-col h-full">
      {/* Sheet List Header */}
      <div className="p-3 bg-white border-b border-gray-200">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-gray-700">
            ({sheets.length}) Gang Sheet{sheets.length > 1 ? 's' : ''}
          </h2>
          <button
            onClick={() => onAddSheet ? onAddSheet() : addSheet()}
            className="flex items-center gap-1 px-2 py-1 bg-blue-500 hover:bg-blue-600
                       text-white text-xs font-medium rounded-lg transition-colors"
            title="Add new design sheet"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Sheet
          </button>
        </div>

        {/* Sheet tabs */}
        <div className="flex flex-col gap-1 max-h-44 overflow-y-auto">
          {sheets.map((sheet) => {
            const isActive = sheet.id === activeSheetId;
            const sheetItemCount = isActive ? items.length : sheet.items.length;
            return (
              <div
                key={sheet.id}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-all
                  ${isActive
                    ? 'bg-blue-50 border border-blue-400'
                    : 'bg-gray-100 border border-transparent hover:border-blue-300 hover:bg-blue-50/50'
                  }`}
                onClick={() => !isActive && (onSwitchSheet ? onSwitchSheet(sheet.id) : switchSheet(sheet.id))}
              >
                {sheet.thumbnailUrl ? (
                  <img src={sheet.thumbnailUrl} alt={sheet.label}
                       className="w-10 h-8 object-contain rounded bg-white border border-gray-200 shrink-0" />
                ) : (
                  <div className="w-10 h-8 bg-white border border-gray-200 rounded flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-medium truncate ${isActive ? 'text-blue-700' : 'text-gray-700'}`}>
                    {sheet.label}
                  </p>
                  <p className="text-[10px] text-gray-400">
                    {isActive ? boardSize.label : sheet.boardSize.label} · {sheetItemCount} img
                  </p>
                </div>
                {isActive && (
                  <span className="text-[9px] bg-blue-500 text-white px-1.5 py-0.5 rounded-full font-medium shrink-0">
                    Active
                  </span>
                )}
                {sheets.length > 1 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteSheet(sheet.id); }}
                    className="w-4 h-4 flex items-center justify-center text-gray-400
                               hover:text-red-500 transition-colors shrink-0"
                    title="Delete sheet"
                  >×</button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Active Sheet Info */}
      <div className="p-3 bg-white border-b border-gray-200">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span className="font-medium text-gray-700">{boardSize.label}</span>
          <span>{totalImages} images</span>
          <button
            onClick={duplicateSelectedItems}
            disabled={selectedIds.length === 0}
            className="text-blue-500 hover:text-blue-600 font-medium disabled:opacity-40"
          >
            Duplicate
          </button>
        </div>
      </div>

      {/* Selected Image Info */}
      {selectedItem && selectedAsset && (
        <div className="p-4 bg-white border-b border-gray-200">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Selected Image
          </h3>
          
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-500">Left</span>
              <span className="font-medium text-gray-700">{pxToInches(selectedItem.x, dpi).toFixed(2)} in</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Top</span>
              <span className="font-medium text-gray-700">{pxToInches(selectedItem.y, dpi).toFixed(2)} in</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Width</span>
              <span className="font-medium text-gray-700">{pxToInches(selectedItem.width, dpi).toFixed(2)} in</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Height</span>
              <span className="font-medium text-gray-700">{pxToInches(selectedItem.height, dpi).toFixed(2)} in</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Resolution</span>
              <span className="font-medium text-gray-700">{dpi} dpi</span>
            </div>
          </div>

          {/* Image Tools */}
          <div className="mt-3 flex flex-col gap-2">
            <button
              onClick={handleRemoveBackground}
              disabled={bgRemoving || upscaling}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg
                         bg-purple-50 text-purple-700 hover:bg-purple-100 disabled:opacity-50
                         disabled:cursor-not-allowed transition-colors"
            >
              {bgRemoving ? (
                <svg className="w-3.5 h-3.5 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                </svg>
              )}
              {bgRemoving ? 'Removing background...' : 'Remove Background'}
            </button>

            <button
              onClick={handleUpscale}
              disabled={bgRemoving || upscaling}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg
                         bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50
                         disabled:cursor-not-allowed transition-colors"
            >
              {upscaling ? (
                <svg className="w-3.5 h-3.5 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
              )}
              {upscaling ? 'Upscaling...' : 'Upscale 2x'}
            </button>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="p-4 space-y-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileUpload}
          className="hidden"
        />
        
        <button 
          onClick={autoFillSheet}
          disabled={selectedIds.length === 0}
          className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm rounded-lg transition-all group
            ${selectedIds.length === 0 
              ? 'text-gray-400 cursor-not-allowed' 
              : 'text-gray-600 hover:bg-white hover:shadow-sm'
            }`}>
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors
            ${selectedIds.length === 0 
              ? 'bg-gray-100' 
              : 'bg-gray-100 group-hover:bg-blue-50'
            }`}>
            <svg className={`w-4 h-4 ${selectedIds.length === 0 ? 'text-gray-300' : 'text-gray-400 group-hover:text-blue-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
          </div>
          <span>Auto Build {selectedIds.length === 0 && '(select an image)'}</span>
        </button>

        <button 
          onClick={() => {
            if (window.confirm('Are you sure you want to clear all items and start over?')) {
              clearAllItems();
            }
          }}
          className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm text-gray-600 
                           hover:bg-white hover:shadow-sm rounded-lg transition-all group">
          <div className="w-8 h-8 bg-gray-100 group-hover:bg-red-50 rounded-lg flex items-center justify-center transition-colors">
            <svg className="w-4 h-4 text-gray-400 group-hover:text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </div>
          <span>Start Over</span>
        </button>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Footer */}
      <div className="p-4 border-t border-gray-200 bg-white">
        <p className="text-[10px] text-gray-400 text-center">
          Powered by Gang Sheet Editor
        </p>
      </div>
    </div>
  );
};

export default PropertiesPanel;
