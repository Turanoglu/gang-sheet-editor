import React from 'react';
import { useSettingsStore, DPI_OPTIONS, EXPORT_FORMAT_OPTIONS } from '../../store/settingsStore';
import { BOARD_SIZES } from '../../types';

export const EditorSettings: React.FC = () => {
  const { editor, updateEditorSettings, resetEditorDefaults } = useSettingsStore();

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Editor Settings</h1>
        <p className="text-gray-500 mt-1">Configure default editor behavior and preferences</p>
      </div>

      <div className="space-y-6">
        {/* Board Defaults */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-lg font-semibold text-gray-700 mb-4">Board Defaults</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">
                Default Board Size
              </label>
              <select
                value={`${editor.defaultBoardSize.width}x${editor.defaultBoardSize.height}`}
                onChange={(e) => {
                  const size = BOARD_SIZES.find(
                    (s) => `${s.width}x${s.height}` === e.target.value
                  );
                  if (size) {
                    updateEditorSettings({ defaultBoardSize: size });
                  }
                }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {BOARD_SIZES.map((size) => (
                  <option key={size.label} value={`${size.width}x${size.height}`}>
                    {size.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">
                Default DPI
              </label>
              <select
                value={editor.defaultDpi}
                onChange={(e) => updateEditorSettings({ defaultDpi: Number(e.target.value) })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {DPI_OPTIONS.map((dpi) => (
                  <option key={dpi} value={dpi}>
                    {dpi} DPI
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Grid Settings */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-lg font-semibold text-gray-700 mb-4">Grid Settings</h3>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-gray-600">Show Grid by Default</label>
                <p className="text-xs text-gray-400">Display grid lines when opening the editor</p>
              </div>
              <button
                onClick={() => updateEditorSettings({ showGridByDefault: !editor.showGridByDefault })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  editor.showGridByDefault ? 'bg-blue-600' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    editor.showGridByDefault ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">
                Grid Size (inches)
              </label>
              <input
                type="number"
                value={editor.gridSizeInches}
                onChange={(e) => updateEditorSettings({ gridSizeInches: Number(e.target.value) })}
                min="0.25"
                max="2"
                step="0.25"
                className="w-32 border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {/* Export Settings */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-lg font-semibold text-gray-700 mb-4">Export Settings</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">
                Export Format
              </label>
              <select
                value={editor.exportFormat}
                onChange={(e) => updateEditorSettings({ exportFormat: e.target.value as 'png' | 'jpeg' })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {EXPORT_FORMAT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">
                Export DPI
              </label>
              <select
                value={editor.exportDpi}
                onChange={(e) => updateEditorSettings({ exportDpi: Number(e.target.value) })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {DPI_OPTIONS.map((dpi) => (
                  <option key={dpi} value={dpi}>
                    {dpi} DPI
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Spacing */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-lg font-semibold text-gray-700 mb-4">Spacing</h3>

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">
              Default Margin (inches)
            </label>
            <input
              type="number"
              value={editor.defaultMarginInches}
              onChange={(e) => updateEditorSettings({ defaultMarginInches: Number(e.target.value) })}
              min="0"
              max="1"
              step="0.125"
              className="w-32 border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-400 mt-1">Space between images during auto-fill</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end">
          <button
            onClick={resetEditorDefaults}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Reset to Defaults
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditorSettings;
