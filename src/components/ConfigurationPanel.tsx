'use client';

import React from 'react';
import { ProcessingConfig, City } from '@/types';

interface ConfigurationPanelProps {
  selectedCity: City | null;
  selectedCities?: City[];
  config: Partial<ProcessingConfig>;
  onConfigChange: (config: Partial<ProcessingConfig>) => void;
  onStartProcessing: () => void;
  isProcessing: boolean;
}

export default function ConfigurationPanel({
  selectedCity,
  selectedCities = [],
  config,
  onConfigChange,
  onStartProcessing,
  isProcessing
}: ConfigurationPanelProps) {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 10 }, (_, i) => currentYear - i);

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-xl font-semibold mb-4 text-gray-800">Processing Configuration</h2>
      
      {(!selectedCity && selectedCities.length === 0) && (
        <div className="text-center py-8 text-gray-500">
          Please select a city first
        </div>
      )}

      {(selectedCity || selectedCities.length > 0) && (
        <div className="space-y-6">
          <div className="bg-blue-50 p-4 rounded-lg">
            <h3 className="font-medium text-blue-900">{selectedCities.length > 0 ? `Selected Cities (${selectedCities.length})` : 'Selected City'}</h3>
            {selectedCities.length > 0 ? (
              <p className="text-blue-700 text-sm">Batch mode enabled. Annual comparison will run for all selected cities.</p>
            ) : (
              <p className="text-blue-700">{selectedCity?.city}, {selectedCity?.state_province}, {selectedCity?.country}</p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Annual Mode */}
            <div className="md:col-span-2">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={config.annualMode ?? true}
                  onChange={(e) => onConfigChange({ ...config, annualMode: e.target.checked })}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Analyze whole year (best cloud-free monthly composites averaged)</span>
              </label>
              <p className="text-xs text-gray-500 mt-1">When enabled, the app selects the least-cloudy images per month, composites them, and averages the year.</p>
            </div>

            {/* Year Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Baseline Year</label>
              <select
                value={config.baselineYear ?? 2020}
                onChange={(e) => onConfigChange({ ...config, baselineYear: parseInt(e.target.value) })}
                className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full"
              >
                {years.map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Comparison Year</label>
              <select
                value={config.compareYear ?? currentYear}
                onChange={(e) => onConfigChange({ ...config, compareYear: parseInt(e.target.value) })}
                className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full"
              >
                {years.map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* NDVI Threshold */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                NDVI Threshold: {config.ndviThreshold || 0.3}
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={config.ndviThreshold || 0.3}
                onChange={(e) => onConfigChange({ ...config, ndviThreshold: parseFloat(e.target.value) })}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>0.0 (No vegetation)</span>
                <span>1.0 (Dense vegetation)</span>
              </div>
            </div>

            {/* Cloud Coverage */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Max Cloud Coverage: {config.cloudCoverageThreshold || 20}%
              </label>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={config.cloudCoverageThreshold || 20}
                onChange={(e) => onConfigChange({ ...config, cloudCoverageThreshold: parseInt(e.target.value) })}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>0% (Clear skies only)</span>
                <span>100% (Include cloudy images)</span>
              </div>
            </div>
          </div>

          {/* NDVI Color Legend */}
          <div className="bg-green-50 p-4 rounded-lg">
            <h4 className="font-medium text-green-900 mb-3">Vegetation Density Color Coding</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-green-500 rounded"></div>
                <span>High Density (NDVI &gt; 0.6)</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-yellow-500 rounded"></div>
                <span>Medium Density (NDVI 0.4-0.6)</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-purple-500 rounded"></div>
                <span>Low Density (NDVI 0.2-0.4)</span>
              </div>
            </div>
          </div>

          {/* Advanced Options */}
          <div>
            <h4 className="font-medium text-gray-700 mb-3">Advanced Options</h4>
            <div className="space-y-3">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={config.enableVegetationIndices || false}
                  onChange={(e) => onConfigChange({ ...config, enableVegetationIndices: e.target.checked })}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Enable additional vegetation indices</span>
              </label>
              
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={config.enableAdvancedCloudDetection || false}
                  onChange={(e) => onConfigChange({ ...config, enableAdvancedCloudDetection: e.target.checked })}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Enable advanced cloud detection</span>
              </label>
            </div>
          </div>

          {/* Processing Note */}
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
            <div className="flex">
              <div className="ml-3">
                <p className="text-sm text-yellow-700">
                  <strong>Note:</strong> Processing will only analyze areas within the city's polygon boundaries. 
                  Larger date ranges may take longer to process but provide more comprehensive results.
                </p>
              </div>
            </div>
          </div>

          {/* Start Processing Button */}
          <button
            onClick={onStartProcessing}
            disabled={isProcessing}
            className={`w-full py-3 px-6 rounded-lg font-medium text-white transition-colors ${
              isProcessing
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500'
            }`}
          >
            {isProcessing ? 'Processing...' : 'Start Annual Comparison'}
          </button>
        </div>
      )}
    </div>
  );
} 