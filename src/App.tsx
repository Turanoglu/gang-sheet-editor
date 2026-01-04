import { useState, useRef, useCallback, useEffect } from 'react';
import Konva from 'konva';
import { GangSheetCanvas } from './components/Canvas';
import { PropertiesPanel } from './components/PropertiesPanel';
import { Toolbar } from './components/Toolbar';
import { LeftSidebar } from './components/LeftSidebar';
import { Ruler } from './components/Ruler';
import { useEditorStore } from './store/editorStore';
import './App.css';

function App() {
  const stageRef = useRef<Konva.Stage | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 });
  const [displayScale, setDisplayScale] = useState(0.1);

  const { 
    removeSelectedItems, 
    selectedIds, 
    duplicateSelectedItems, 
    undo, 
    redo,
    boardSize,
    dpi,
  } = useEditorStore();

  // Handle container resize
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setContainerSize({ width: rect.width, height: rect.height });
      }
    };

    updateSize();

    const resizeObserver = new ResizeObserver(updateSize);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Delete selected items
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length > 0) {
        e.preventDefault();
        removeSelectedItems();
      }

      // Duplicate with Ctrl/Cmd + D
      if ((e.ctrlKey || e.metaKey) && e.key === 'd' && selectedIds.length > 0) {
        e.preventDefault();
        duplicateSelectedItems();
      }

      // Undo with Ctrl/Cmd + Z
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }

      // Redo with Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y
      if (
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') ||
        ((e.ctrlKey || e.metaKey) && e.key === 'y')
      ) {
        e.preventDefault();
        redo();
      }
    },
    [selectedIds, removeSelectedItems, duplicateSelectedItems, undo, redo]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  // Calculate display dimensions
  const displayWidth = boardSize.width * dpi * displayScale;
  const displayHeight = boardSize.height * dpi * displayScale;

  return (
    <div className="h-screen w-screen flex flex-col bg-gray-100 overflow-hidden">
      {/* Top Header Bar */}
      <div className="h-12 bg-white border-b border-gray-200 flex items-center justify-between px-4 shadow-sm">
        {/* Left - Logo & Quantity */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">GS</span>
            </div>
            <span className="font-semibold text-gray-700">Gang Sheet Builder</span>
          </div>
          
          <div className="flex items-center gap-2 pl-6 border-l border-gray-200">
            <span className="text-sm text-gray-500">Quantity:</span>
            <input
              type="number"
              min="1"
              defaultValue="1"
              className="w-14 px-2 py-1 border border-gray-300 rounded-lg text-sm text-center
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Center - Action Buttons */}
        <div className="flex items-center gap-2">
          <button className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-1.5 rounded-lg 
                             text-sm font-medium transition-colors shadow-sm">
            Save & Add to Cart
          </button>
          <button className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-1.5 rounded-lg 
                             text-sm font-medium transition-colors shadow-sm">
            Save
          </button>
          <button className="bg-red-500 hover:bg-red-600 text-white px-4 py-1.5 rounded-lg 
                             text-sm font-medium transition-colors shadow-sm">
            Close
          </button>
        </div>

        {/* Right - Price & User */}
        <div className="flex items-center gap-4">
          <div className="text-right">
            <span className="text-sm text-gray-500">Price:</span>
            <span className="ml-2 text-lg font-bold text-emerald-600">$29.99 USD</span>
          </div>
          <div className="w-9 h-9 bg-gray-200 rounded-full flex items-center justify-center">
            <span className="text-sm font-medium text-gray-500">UN</span>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <Toolbar stageRef={stageRef} displayScale={displayScale} />

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <LeftSidebar />

        {/* Canvas Area with Rulers */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Horizontal Ruler */}
          <Ruler
            orientation="horizontal"
            length={displayWidth}
            boardSize={boardSize.width}
            dpi={dpi}
            displayScale={displayScale}
          />

          <div className="flex-1 flex overflow-hidden">
            {/* Vertical Ruler */}
            <Ruler
              orientation="vertical"
              length={displayHeight}
              boardSize={boardSize.height}
              dpi={dpi}
              displayScale={displayScale}
            />

            {/* Canvas Container */}
            <div
              ref={containerRef}
              className="flex-1 flex items-center justify-center bg-slate-500 overflow-auto relative"
              style={{
                backgroundImage: `
                  linear-gradient(45deg, #64748b 25%, transparent 25%),
                  linear-gradient(-45deg, #64748b 25%, transparent 25%),
                  linear-gradient(45deg, transparent 75%, #64748b 75%),
                  linear-gradient(-45deg, transparent 75%, #64748b 75%)
                `,
                backgroundSize: '20px 20px',
                backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
              }}
            >
              <div className="shadow-2xl rounded-sm overflow-hidden">
                <GangSheetCanvas
                  containerWidth={containerSize.width}
                  containerHeight={containerSize.height}
                  stageRef={stageRef}
                  displayScale={displayScale}
                  setDisplayScale={setDisplayScale}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel */}
        <PropertiesPanel />
      </div>
    </div>
  );
}

export default App;
