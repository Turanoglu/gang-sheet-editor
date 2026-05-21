import React from 'react';
import { useEditorStore } from '../../store/editorStore';
import { BOARD_SIZES } from '../../types';
import { getCustomerId, getCustomerName, getCustomerEmail, getShopDomain } from '../../services/storageAPI';

interface ToolbarProps {
  isPanMode?: boolean;
  onTogglePanMode?: () => void;
}

// Icon Components
const UndoIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
  </svg>
);

const RedoIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
  </svg>
);

const GridIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 9h16M4 15h16M9 4v16M15 4v16" />
  </svg>
);

const CopyIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
);

const FlipHIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21L3 12l4-9M17 21l4-9-4-9M12 3v18" />
  </svg>
);

const FlipVIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7l9-4 9 4M3 17l9 4 9-4M3 12h18" />
  </svg>
);

const AlignLeftIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h10M4 18h14" />
  </svg>
);

const AlignCenterIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M7 12h10M5 18h14" />
  </svg>
);

const AlignRightIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M10 12h10M6 18h14" />
  </svg>
);

const TrashIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

const ZoomInIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
  </svg>
);

const ZoomOutIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM7 10h6" />
  </svg>
);

const RefreshIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

const HandIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 013 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11" />
  </svg>
);


const MoveToTopIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3h14M12 7v14m0-14l-4 4m4-4l4 4" />
  </svg>
);

const MoveToBottomIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 21h14M12 17V3m0 14l-4-4m4 4l4-4" />
  </svg>
);

export const Toolbar: React.FC<ToolbarProps> = ({ isPanMode = false, onTogglePanMode }) => {
  const {
    boardSize,
    setBoardSize,
    items,
    selectedIds,
    duplicateSelectedItems,
    removeSelectedItems,
    updateItem,
    undo,
    redo,
    autoFillSheet,
    history,
    historyIndex,
    gridVisible,
    toggleGrid,
    zoomIn,
    zoomOut,
    zoomLevel,
    marginInches,
    setMarginInches,
    alignItems,
    moveToTop,
    moveToBottom,
  } = useEditorStore();

  // Get selected items
  const selectedItems = items.filter(item => selectedIds.includes(item.id));

  // Handle board size change
  const handleBoardSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedSize = BOARD_SIZES.find((size) => size.label === e.target.value);
    if (selectedSize) {
      setBoardSize(selectedSize);
    }
  };

  // Handle flip
  const handleFlipX = () => {
    selectedItems.forEach(item => {
      updateItem(item.id, { flipX: !item.flipX });
    });
  };

  const handleFlipY = () => {
    selectedItems.forEach(item => {
      updateItem(item.id, { flipY: !item.flipY });
    });
  };

  const canUndo = historyIndex >= 0;
  const canRedo = historyIndex < history.length - 2;
  const hasSelection = selectedIds.length > 0;

  return (
    <div className="h-12 bg-white border-b border-gray-200 flex items-center px-4 gap-2">
      {/* Board Size Selector */}
      <div className="flex items-center gap-2 pr-3 border-r border-gray-200">
        <select
          value={boardSize.label}
          onChange={handleBoardSizeChange}
          className="bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg border-0 text-sm 
                     focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
        >
          {BOARD_SIZES.map((size) => (
            <option key={size.label} value={size.label}>
              {size.label}
            </option>
          ))}
        </select>
      </div>

      {/* Margin Input */}
      <div className="flex items-center gap-2 pr-3 border-r border-gray-200">
        <label className="text-xs text-gray-500">Margin:</label>
        <input
          type="number"
          step="0.125"
          min="0"
          value={marginInches}
          onChange={(e) => setMarginInches(parseFloat(e.target.value) || 0)}
          className="w-16 px-2 py-1.5 bg-gray-100 rounded-lg border-0 text-sm text-center
                     focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <span className="text-xs text-gray-500">in</span>
      </div>

      {/* Tool Buttons */}
      <div className="flex items-center gap-1 pr-3 border-r border-gray-200">
        <ToolButton
          icon={<HandIcon />}
          title="Pan Tool — sürükleyerek kaydır (Space)"
          onClick={onTogglePanMode}
          active={isPanMode}
        />
        <ToolButton
          icon={<GridIcon />}
          title="Toggle Grid"
          onClick={toggleGrid}
          active={gridVisible}
        />
        <ToolButton icon={<CopyIcon />} title="Duplicate" onClick={duplicateSelectedItems} disabled={!hasSelection} />
      </div>

      {/* Undo / Redo */}
      <div className="flex items-center gap-1 pr-3 border-r border-gray-200">
        <ToolButton icon={<UndoIcon />} title="Undo (Ctrl+Z)" onClick={undo} disabled={!canUndo} />
        <ToolButton icon={<RedoIcon />} title="Redo (Ctrl+Y)" onClick={redo} disabled={!canRedo} />
      </div>

      {/* Flip */}
      <div className="flex items-center gap-1 pr-3 border-r border-gray-200">
        <ToolButton icon={<FlipHIcon />} title="Flip Horizontal" onClick={handleFlipX} disabled={!hasSelection} />
        <ToolButton icon={<FlipVIcon />} title="Flip Vertical" onClick={handleFlipY} disabled={!hasSelection} />
      </div>

      {/* Alignment */}
      <div className="flex items-center gap-1 pr-3 border-r border-gray-200">
        <ToolButton 
          icon={<AlignLeftIcon />} 
          title="Align Left" 
          onClick={() => alignItems('left')}
          disabled={!hasSelection} 
        />
        <ToolButton 
          icon={<AlignCenterIcon />} 
          title="Align Center" 
          onClick={() => alignItems('center')}
          disabled={!hasSelection} 
        />
        <ToolButton 
          icon={<AlignRightIcon />} 
          title="Align Right" 
          onClick={() => alignItems('right')}
          disabled={!hasSelection} 
        />
      </div>

      {/* Move to Top/Bottom */}
      <div className="flex items-center gap-1 pr-3 border-r border-gray-200">
        <ToolButton 
          icon={<MoveToTopIcon />} 
          title="Move to Top" 
          onClick={moveToTop}
          disabled={!hasSelection} 
        />
        <ToolButton 
          icon={<MoveToBottomIcon />} 
          title="Move to Bottom" 
          onClick={moveToBottom}
          disabled={!hasSelection} 
        />
      </div>

      {/* Delete */}
      <div className="flex items-center gap-1 pr-3 border-r border-gray-200">
        <ToolButton 
          icon={<TrashIcon />} 
          title="Delete (Del)" 
          onClick={removeSelectedItems} 
          disabled={!hasSelection}
          danger 
        />
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* My Panel */}
      <div className="flex items-center gap-2 pr-3 border-r border-gray-200">
        <button
          onClick={() => {
            const customerId = getCustomerId();
            const params = new URLSearchParams({ customerId });
            const name = getCustomerName();
            const email = getCustomerEmail();
            const shopDomain = getShopDomain();
            if (name) params.set('customerName', name);
            if (email) params.set('customerEmail', email);
            if (shopDomain) params.set('shopDomain', shopDomain);
            // Use absolute URL so it works from inside Shopify iframe
            const adminUrl = `${window.location.origin}/admin?${params.toString()}`;
            if (window.top && window.top !== window) {
              window.top.open(adminUrl, '_blank');
            } else {
              window.open(adminUrl, '_blank');
            }
          }}
          title="Tasarımlarım ve Siparişlerim"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors bg-gray-100 hover:bg-gray-200 text-gray-700"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          Siparişlerim
        </button>
      </div>

      {/* Zoom */}
      <div className="flex items-center gap-2 pr-3 border-r border-gray-200">
        <ToolButton icon={<ZoomOutIcon />} title="Zoom Out" onClick={zoomOut} />
        <span className="text-xs font-medium text-gray-600 min-w-[50px] text-center">
          {Math.round(zoomLevel * 100)}%
        </span>
        <ToolButton icon={<ZoomInIcon />} title="Zoom In" onClick={zoomIn} />
      </div>

      {/* Auto Build */}
      <div className="flex items-center gap-2">
        <button
          onClick={autoFillSheet}
          disabled={!hasSelection}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
            ${hasSelection
              ? 'bg-blue-500 hover:bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
        >
          <RefreshIcon />
          Auto Build
        </button>
      </div>
    </div>
  );
};

// Tool Button Component
interface ToolButtonProps {
  icon: React.ReactNode;
  title: string;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
  active?: boolean;
}

const ToolButton: React.FC<ToolButtonProps> = ({ icon, title, onClick, disabled = false, danger = false, active = false }) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors
        ${disabled 
          ? 'text-gray-300 cursor-not-allowed' 
          : danger
            ? 'text-gray-500 hover:text-red-500 hover:bg-red-50'
            : active
              ? 'text-blue-500 bg-blue-50 hover:bg-blue-100'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
        }`}
    >
      {icon}
    </button>
  );
};

export default Toolbar;
