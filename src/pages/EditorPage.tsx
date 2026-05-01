import { useState, useRef, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import Konva from 'konva';
import { GangSheetCanvas } from '../components/Canvas';
import { PropertiesPanel } from '../components/PropertiesPanel';
import { Toolbar } from '../components/Toolbar';
import { LeftSidebar } from '../components/LeftSidebar';
import { Ruler } from '../components/Ruler';
import { CartDrawer } from '../components/Cart';
import { useEditorStore } from '../store/editorStore';
import { useCartStore } from '../store/cartStore';
import { useOrderStore } from '../store/orderStore';
import type { GangSheetDesign } from '../types/order';
import { getPriceForBoard } from '../types/order';
import { generateCleanExport } from '../utils/export';
import { getCustomerInitials, getCustomerId, getCustomerName } from '../services/storageAPI';

export const EditorPage: React.FC = () => {
  const stageRef = useRef<Konva.Stage | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 });
  const [displayScale, setDisplayScale] = useState(0.1);
  const [quantity, setQuantity] = useState(1);
  const [customerInitials, setCustomerInitials] = useState(() => {
    try { getCustomerId(); return getCustomerInitials(); } catch { return 'GS'; }
  });
  const [editingDesign, setEditingDesign] = useState<GangSheetDesign | null>(null);

  // Pan / Hand tool state
  const [isPanMode, setIsPanMode] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null);

  const {
    removeSelectedItems,
    selectedIds,
    duplicateSelectedItems,
    undo,
    redo,
    boardSize,
    dpi,
    hasOverflow,
    hasOverlap,
    items,
    assets,
    itemQuantities,
    sheets,
    activeSheetId,
    loadDesign,
    addSheet,
    switchSheet,
    zoomLevel,
    setZoomLevel,
  } = useEditorStore();

  // Refs to read latest values inside non-reactive wheel/mouse handlers
  const displayScaleRef = useRef(displayScale);
  useEffect(() => { displayScaleRef.current = displayScale; }, [displayScale]);
  const zoomLevelRef = useRef(zoomLevel);
  useEffect(() => { zoomLevelRef.current = zoomLevel; }, [zoomLevel]);

  // Capture thumbnail of current sheet then switch / add
  const handleSwitchSheet = useCallback((id: string) => {
    const thumb = generateThumbnail('tiny');
    switchSheet(id, thumb || undefined);
  }, [switchSheet]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddSheet = useCallback(() => {
    const thumb = generateThumbnail('tiny');
    addSheet(thumb || undefined);
  }, [addSheet]); // eslint-disable-line react-hooks/exhaustive-deps

  const { addToCart, getItemCount, openCart } = useCartStore();
  const { saveDesign, createOrder, currentDesign, setCurrentDesign } = useOrderStore();

  const cartItemCount = getItemCount();
  const currentPrice = getPriceForBoard(boardSize.width, boardSize.height);

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

  // Update customer initials when SHOPIFY_CUSTOMER postMessage arrives
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type !== 'SHOPIFY_CUSTOMER') return;
      const name: string = (event.data.customerName || '').trim();
      const email: string = (event.data.customerEmail || '');
      if (name) {
        const parts = name.split(/\s+/);
        const initials = parts.length === 1
          ? parts[0].charAt(0).toUpperCase()
          : (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
        if (initials) { setCustomerInitials(initials); return; }
      }
      // Fallback: first char of email
      if (email) setCustomerInitials(email.charAt(0).toUpperCase());
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // Load design from admin panel "Edit in Builder" action
  useEffect(() => {
    if (currentDesign) {
      setEditingDesign(currentDesign);
      loadDesign(currentDesign);
      setCurrentDesign(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Space → pan mode (ignore when typing in inputs)
      if (e.code === 'Space' && !e.repeat &&
          !(e.target instanceof HTMLInputElement) &&
          !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        setIsPanMode(true);
        return;
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length > 0) {
        e.preventDefault();
        removeSelectedItems();
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'd' && selectedIds.length > 0) {
        e.preventDefault();
        duplicateSelectedItems();
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }

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

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    if (e.code === 'Space') {
      setIsPanMode(false);
      setIsPanning(false);
      panStartRef.current = null;
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);

  // Ctrl+Scroll zoom: non-passive wheel listener (must be added via addEventListener)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();

      const curScale = displayScaleRef.current;
      const curZoom  = zoomLevelRef.current;

      // Use the stage element's actual screen position so flex-centering offset is
      // accounted for (scrollLeft alone is 0 when board is smaller than container).
      const stageEl = stageRef.current?.container();
      if (!stageEl) return;
      const stageRect = stageEl.getBoundingClientRect();

      // Board coordinate (in board-pixels) under the mouse
      const boardX = (e.clientX - stageRect.left) / curScale;
      const boardY = (e.clientY - stageRect.top)  / curScale;

      const factor    = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const newZoom   = Math.max(0.05, Math.min(10.0, curZoom * factor));
      const baseScale = curScale / curZoom;
      const newScale  = baseScale * newZoom;

      setZoomLevel(newZoom);

      // Wait two frames so React re-renders + browser layout completes,
      // then read the stage's new position and apply the corrective scroll.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (!containerRef.current) return;
        const containerRect  = containerRef.current.getBoundingClientRect();
        const newStageRect   = stageEl.getBoundingClientRect();

        // Stage left/top in scroll-content coordinates (invariant to scrollLeft/Top)
        const stageInContentX = newStageRect.left - containerRect.left + containerRef.current.scrollLeft;
        const stageInContentY = newStageRect.top  - containerRect.top  + containerRef.current.scrollTop;

        // Set scroll so the board point under mouse stays fixed
        containerRef.current.scrollLeft = stageInContentX + boardX * newScale - (e.clientX - containerRect.left);
        containerRef.current.scrollTop  = stageInContentY + boardY * newScale - (e.clientY - containerRect.top);
      }));
    };

    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);  // intentionally empty — reads values via refs

  // Pan mouse handlers (Space key OR middle mouse button)
  const handlePanMouseDown = useCallback((e: React.MouseEvent) => {
    const isMiddle = e.button === 1;
    if (!isMiddle && !isPanMode) return;
    if (!containerRef.current) return;
    if (isMiddle) e.preventDefault();
    setIsPanning(true);
    panStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      scrollLeft: containerRef.current.scrollLeft,
      scrollTop: containerRef.current.scrollTop,
    };
  }, [isPanMode]);

  const handlePanMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning || !panStartRef.current || !containerRef.current) return;
    const dx = e.clientX - panStartRef.current.x;
    const dy = e.clientY - panStartRef.current.y;
    containerRef.current.scrollLeft = panStartRef.current.scrollLeft - dx;
    containerRef.current.scrollTop  = panStartRef.current.scrollTop  - dy;
  }, [isPanning]);

  const handlePanMouseUp = useCallback(() => {
    setIsPanning(false);
    panStartRef.current = null;
  }, []);

  // Generate clean thumbnail from canvas (without grid, selections, etc.)
  const generateThumbnail = (quality: 'thumbnail' | 'full' | 'tiny' | 'print' = 'thumbnail'): string => {
    if (!stageRef.current) return '';
    try {
      return generateCleanExport({
        stage: stageRef.current,
        boardSize,
        dpi,
        displayScale,
        quality,
      });
    } catch {
      return '';
    }
  };

  // Handle Save & Add to Cart
  const handleSaveAndAddToCart = () => {
    // Build all sheets with the current live state for the active sheet
    const allSheets = sheets.map((s) =>
      s.id === activeSheetId
        ? { ...s, items, assets, boardSize, itemQuantities }
        : s
    );

    // Only process sheets that have at least one item
    const nonEmptySheets = allSheets.filter((s) => s.items.length > 0);

    if (nonEmptySheets.length === 0) {
      alert('Please add at least one image to your gang sheet before adding to cart.');
      return;
    }

    const baseName = editingDesign?.name ?? 'New Gang Sheet';
    const now = new Date();

    // Create a design object for each non-empty sheet
    const designs: GangSheetDesign[] = nonEmptySheets.map((s, idx) => {
      const isActive = s.id === activeSheetId;
      const isEditedSheet = isActive && editingDesign != null;

      // Only the active sheet can have a freshly rendered export;
      // other sheets use the tiny thumbnail saved when the user last switched away.
      const thumbnailUrl = isActive ? generateThumbnail('thumbnail') : (s.thumbnailUrl || '');
      const fullExportUrl = isActive ? generateThumbnail('print') : (s.thumbnailUrl || '');

      const sheetName = nonEmptySheets.length === 1
        ? baseName
        : `${baseName} – ${s.label ?? `Sheet ${idx + 1}`}`;

      return {
        id: isEditedSheet ? editingDesign!.id : uuidv4(),
        name: sheetName,
        boardSize: s.boardSize,
        imageCount: s.items.length,
        createdAt: isEditedSheet ? editingDesign!.createdAt : now,
        updatedAt: now,
        thumbnailUrl,
        fullExportUrl,
        canvasData: JSON.stringify(s.items),
        assetsData: JSON.stringify(s.assets),
      };
    });

    // Save all designs to cloud
    designs.forEach((design) => saveDesign(design));

    // Build cart items (one per sheet) and create a single order
    const customerName = getCustomerName() || 'Customer';
    const orderCartItems = designs.map((design) => ({
      id: '',
      designId: design.id,
      design,
      quantity,
      pricePerUnit: getPriceForBoard(design.boardSize.width, design.boardSize.height),
      addedAt: now,
    }));

    const order = createOrder(customerName, orderCartItems, 'In Cart');

    // Add each sheet to the cart under the same order
    designs.forEach((design) => addToCart(design, quantity, order.id));

    openCart();

    // Brief success notification
    const notification = document.createElement('div');
    notification.className = 'fixed top-20 left-1/2 transform -translate-x-1/2 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-[100] animate-pulse';
    notification.textContent = designs.length > 1
      ? `✓ ${designs.length} gang sheets added to cart!`
      : '✓ Added to cart successfully!';
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 2000);
  };

  // Calculate display dimensions
  const displayWidth = boardSize.width * dpi * displayScale;
  const displayHeight = boardSize.height * dpi * displayScale;

  return (
    <div className="h-screen w-screen flex flex-col bg-gray-100 overflow-hidden">
      {/* Cart Drawer */}
      <CartDrawer />

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
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-14 px-2 py-1 border border-gray-300 rounded-lg text-sm text-center
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Center - Action Buttons */}
        <div className="flex items-center gap-2">
          <button 
            onClick={handleSaveAndAddToCart}
            className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-1.5 rounded-lg 
                       text-sm font-medium transition-colors shadow-sm flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            Save & Add to Cart
          </button>
        </div>

        {/* Right - Price & Cart */}
        <div className="flex items-center gap-4">
          <div className="text-right">
            <span className="text-sm text-gray-500">Price:</span>
            <span className="ml-2 text-lg font-bold text-emerald-600">${currentPrice.toFixed(2)} USD</span>
          </div>
          
          {/* Cart Button */}
          <button 
            onClick={openCart}
            className="relative w-10 h-10 bg-gray-100 hover:bg-gray-200 rounded-full 
                       flex items-center justify-center transition-colors"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            {cartItemCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs 
                               rounded-full flex items-center justify-center font-medium">
                {cartItemCount}
              </span>
            )}
          </button>

          <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
            <span className="text-sm font-bold text-white">{customerInitials}</span>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <Toolbar isPanMode={isPanMode} onTogglePanMode={() => setIsPanMode(v => !v)} />

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
                cursor: isPanning ? 'grabbing' : isPanMode ? 'grab' : undefined,
              }}
              onMouseDown={handlePanMouseDown}
              onMouseMove={handlePanMouseMove}
              onMouseUp={handlePanMouseUp}
              onMouseLeave={handlePanMouseUp}
            >
              {/* Warnings */}
              <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 flex flex-col gap-2 items-center">
                {hasOverflow && (
                  <div className="bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 animate-pulse">
                    <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span className="font-medium text-sm">Images are outside the board boundaries!</span>
                  </div>
                )}
                {hasOverlap && (
                  <div className="bg-amber-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
                    <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M9 12h6m-6 4h6M7 4h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z" />
                    </svg>
                    <span className="font-medium text-sm">Some images are overlapping!</span>
                  </div>
                )}
              </div>
              
              <div className={`relative shadow-2xl rounded-sm overflow-hidden ${hasOverflow ? 'ring-4 ring-red-500 ring-opacity-50' : ''}`}>
                <GangSheetCanvas
                  containerWidth={containerSize.width}
                  containerHeight={containerSize.height}
                  stageRef={stageRef}
                  displayScale={displayScale}
                  setDisplayScale={setDisplayScale}
                />
                {/* Pan overlay: blocks Konva interactions while Space is held */}
                {isPanMode && (
                  <div
                    className="absolute inset-0"
                    style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel */}
        <PropertiesPanel onAddSheet={handleAddSheet} onSwitchSheet={handleSwitchSheet} />
      </div>
    </div>
  );
};

export default EditorPage;

