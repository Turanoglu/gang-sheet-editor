import React, { useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useEditorStore } from '../../store/editorStore';
import { pxToInches, inchesToPx } from '../../types';
import type { Asset, CanvasItem } from '../../types';
import { loadImageFile } from '../../utils/export';

export const PropertiesPanel: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  
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
    addItem,
  } = useEditorStore();

  // Get selected item info
  const selectedItem = selectedIds.length === 1
    ? items.find((item) => item.id === selectedIds[0])
    : null;

  const selectedAsset = selectedItem ? assets[selectedItem.assetId] : null;

  // Calculate total images
  const totalImages = items.length;

  // Group items by asset for display
  const assetGroups = Object.values(assets).map(asset => ({
    asset,
    items: items.filter(item => item.assetId === asset.id),
  })).filter(group => group.items.length > 0);

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
      {/* Header */}
      <div className="p-4 bg-white border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">
            (1) Active Gang Sheets
          </h2>
        </div>
      </div>

      {/* Active Sheet Info */}
      <div className="p-4 bg-white border-b border-gray-200">
        <div className="flex items-start gap-3">
          {/* Sheet Icon */}
          <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>

          {/* Sheet Details */}
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">{boardSize.label}</span>
              <button className="text-gray-400 hover:text-blue-500 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">New Gang Sheet</p>
            <p className="text-xs text-gray-400">{totalImages} Images</p>
          </div>
        </div>

        {/* Quantity */}
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-gray-500">Qty:</span>
          <input
            type="number"
            min="1"
            defaultValue="1"
            className="w-14 px-2 py-1 border border-gray-300 rounded text-xs text-center
                       focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            onClick={duplicateSelectedItems}
            disabled={selectedIds.length === 0}
            className="ml-auto text-xs text-blue-500 hover:text-blue-600 font-medium"
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
          onClick={() => fileInputRef.current?.click()}
          className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm text-gray-600 
                           hover:bg-white hover:shadow-sm rounded-lg transition-all group">
          <div className="w-8 h-8 bg-gray-100 group-hover:bg-blue-50 rounded-lg flex items-center justify-center transition-colors">
            <svg className="w-4 h-4 text-gray-400 group-hover:text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <span>Add new design</span>
        </button>

        <button 
          onClick={() => {
            // For now, show a message that this feature is coming
            alert('Previous designs feature coming soon! Your designs will be saved in browser storage.');
          }}
          className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm text-gray-600 
                           hover:bg-white hover:shadow-sm rounded-lg transition-all group">
          <div className="w-8 h-8 bg-gray-100 group-hover:bg-blue-50 rounded-lg flex items-center justify-center transition-colors">
            <svg className="w-4 h-4 text-gray-400 group-hover:text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
          </div>
          <span>Open from previous designs</span>
        </button>

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
