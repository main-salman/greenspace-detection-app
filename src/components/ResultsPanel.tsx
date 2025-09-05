'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { ProcessingStatus } from '@/types';
import { City } from '@/types';
import SummaryPanel from './SummaryPanel';
import { safeToFixed, safePercentage, safeDecimal } from '@/lib/utils';

// Dynamic import to prevent SSR issues with Leaflet
const VegetationMap = dynamic(() => import('./VegetationMap'), {
  ssr: false,
  loading: () => (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading enhanced interactive map...</p>
        </div>
      </div>
    </div>
  )
});

interface ResultsPanelProps {
  status: ProcessingStatus;
  selectedCity: City | null;
}

export default function ResultsPanel({ status, selectedCity }: ResultsPanelProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  // Get the result from status and MERGE with sensible defaults so missing arrays do not crash UI
  const defaultResult = {
    downloadedImages: 0,
    processedComposites: 0,
    vegetationPercentage: 0,
    highDensityPercentage: 0,
    mediumDensityPercentage: 0,
    lowDensityPercentage: 0,
    outputFiles: [] as string[],
    summary: undefined as any
  };
  const result = { ...defaultResult, ...(status.result || {}) };

  // Get enhanced summary data
  const summary = result.summary;
  const annual = (status.result as any)?.annualComparison as {
    baselineYear: number;
    baselineVegetation: number;
    compareYear: number;
    compareVegetation: number;
    percentChange: number;
  } | undefined;
  const hasEnhancedData = summary && summary.processing_config;

  const handleDownload = (filePath: string) => {
    // Create a download link
    const link = document.createElement('a');
    link.href = `/api/download?file=${encodeURIComponent(filePath)}`;
    link.download = filePath.split('/').pop() || 'download';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImagePreview = (filePath: string) => {
    setSelectedImage(filePath);
  };

  // Always show results section so batch summaries render even without a single selected city

  return (
    <div className="space-y-6" style={{ maxWidth: 'none', width: '100%' }}>
      {/* Summary Stats - Only show when completed */}
      {status.status === 'completed' && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-800">🎉 Enhanced Processing Complete!</h2>
            {hasEnhancedData && (
              <div className="text-sm text-green-600 bg-green-50 px-3 py-1 rounded-full">
                ✨ Enhanced Analysis
              </div>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-blue-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-blue-600">{result.downloadedImages}</div>
              <div className="text-sm text-blue-700">Images Found</div>
            </div>
            
            <div className="bg-purple-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-purple-600">{result.processedComposites}</div>
              <div className="text-sm text-purple-700">Images Processed</div>
            </div>
            
            <div className="bg-green-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-green-600">{safePercentage(result.vegetationPercentage, 1)}</div>
              <div className="text-sm text-green-700">Total Vegetation</div>
            </div>

            {summary && (
              <div className="bg-indigo-50 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-indigo-600">{summary.total_pixels?.toLocaleString() || 'N/A'}</div>
                <div className="text-sm text-indigo-700">Pixels Analyzed</div>
              </div>
            )}
          </div>

          {/* Annual Comparison (if available) */}
          {annual && (
            <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
              <h3 className="font-semibold text-gray-800 mb-4">📆 Annual Comparison</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                <div className="bg-gray-50 rounded-lg p-4 text-center">
                  <div className="text-sm text-gray-600">Baseline {annual.baselineYear}</div>
                  <div className="text-3xl font-bold text-gray-800">{safePercentage(annual.baselineVegetation, 1)}</div>
                </div>
                <div className="text-center">
                  <div className="text-sm text-gray-600">Change</div>
                  <div className={`text-3xl font-bold ${annual.percentChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {annual.percentChange >= 0 ? '▲' : '▼'} {safePercentage(annual.percentChange, 1)}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4 text-center">
                  <div className="text-sm text-gray-600">Compare {annual.compareYear}</div>
                  <div className="text-3xl font-bold text-gray-800">{safePercentage(annual.compareVegetation, 1)}</div>
                </div>
              </div>
            </div>
          )}

          {/* Enhanced Vegetation Density Breakdown */}
          <div className="bg-gradient-to-r from-green-50 to-yellow-50 rounded-lg p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-800">🌱 Enhanced Vegetation Density Analysis</h3>
              {hasEnhancedData && (
                <div className="text-xs text-gray-600 bg-white px-2 py-1 rounded">
                  NDVI Threshold: {summary?.processing_config?.ndvi_threshold}
                </div>
              )}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="text-center">
                <div className="flex items-center justify-center mb-2">
                  <div className="w-4 h-4 bg-green-500 rounded mr-2"></div>
                  <span className="font-medium">High Density</span>
                </div>
                <div className="text-2xl font-bold text-green-600">
                  {safePercentage(result.highDensityPercentage, 1)}
                </div>
                <div className="text-xs text-gray-600">NDVI &gt; 0.7</div>
                <div className="text-xs text-green-700 mt-1">Dense, healthy vegetation</div>
              </div>
              
              <div className="text-center">
                <div className="flex items-center justify-center mb-2">
                  <div className="w-4 h-4 bg-yellow-500 rounded mr-2"></div>
                  <span className="font-medium">Medium Density</span>
                </div>
                <div className="text-2xl font-bold text-yellow-600">
                  {safePercentage(result.mediumDensityPercentage, 1)}
                </div>
                <div className="text-xs text-gray-600">NDVI 0.5-0.7</div>
                <div className="text-xs text-yellow-700 mt-1">Moderate vegetation</div>
              </div>
              
              <div className="text-center">
                <div className="flex items-center justify-center mb-2">
                  <div className="w-4 h-4 bg-green-300 rounded mr-2"></div>
                  <span className="font-medium">Low Density</span>
                </div>
                <div className="text-2xl font-bold text-green-500">
                  {safePercentage(result.lowDensityPercentage, 1)}
                </div>
                <div className="text-xs text-gray-600">
                  NDVI {hasEnhancedData ? summary?.processing_config?.ndvi_threshold : '0.3'}-0.5
                </div>
                <div className="text-xs text-green-600 mt-1">Sparse vegetation</div>
              </div>
            </div>

            {/* Vegetation Coverage Bar */}
            <div className="mt-4">
              <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
                <span>Vegetation Coverage Distribution</span>
                <span>{safePercentage(result.vegetationPercentage, 1)} Total</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                <div className="h-full flex">
                  <div 
                    className="bg-green-500 h-full" 
                    style={{ width: `${(result.highDensityPercentage || 0)}%` }}
                    title={`High Density: ${safePercentage(result.highDensityPercentage, 1)}`}
                  ></div>
                  <div 
                    className="bg-yellow-500 h-full" 
                    style={{ width: `${(result.mediumDensityPercentage || 0)}%` }}
                    title={`Medium Density: ${safePercentage(result.mediumDensityPercentage, 1)}`}
                  ></div>
                  <div 
                    className="bg-green-300 h-full" 
                    style={{ width: `${(result.lowDensityPercentage || 0)}%` }}
                    title={`Low Density: ${safePercentage(result.lowDensityPercentage, 1)}`}
                  ></div>
                </div>
              </div>
            </div>
          </div>

          {/* Vegetation Change Analysis (if available) */}
          {annual && (
            <div className="bg-gradient-to-r from-green-50 to-red-50 border border-gray-200 rounded-lg p-4 mb-6">
              <h3 className="font-semibold text-gray-800 mb-3">🔄 Vegetation Change Analysis ({annual.baselineYear} → {annual.compareYear})</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="text-center">
                  <div className="flex items-center justify-center mb-2">
                    <div className="w-4 h-4 bg-green-500 rounded mr-2"></div>
                    <span className="font-medium">Vegetation Gain</span>
                  </div>
                  <div className="text-2xl font-bold text-green-600">
                    {safePercentage((result as any)?.changeVisualization?.gainPercentage || 0, 1)}
                  </div>
                  <div className="text-xs text-gray-600">New vegetation areas</div>
                </div>
                
                <div className="text-center">
                  <div className="flex items-center justify-center mb-2">
                    <div className="w-4 h-4 bg-red-500 rounded mr-2"></div>
                    <span className="font-medium">Vegetation Loss</span>
                  </div>
                  <div className="text-2xl font-bold text-red-600">
                    {safePercentage((result as any)?.changeVisualization?.lossPercentage || 0, 1)}
                  </div>
                  <div className="text-xs text-gray-600">Lost vegetation areas</div>
                </div>
                
                <div className="text-center">
                  <div className="flex items-center justify-center mb-2">
                    <div className="w-4 h-4 bg-purple-500 rounded mr-2"></div>
                    <span className="font-medium">Stable Vegetation</span>
                  </div>
                  <div className="text-2xl font-bold text-purple-500">
                    {safePercentage((result as any)?.changeVisualization?.stablePercentage || 0, 1)}
                  </div>
                  <div className="text-xs text-gray-600">Unchanged vegetation</div>
                </div>
              </div>

              {/* Net Change Summary */}
              <div className="bg-white rounded-lg p-3 border">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-700">Net Vegetation Change:</span>
                  <div className="flex items-center">
                    {annual.percentChange > 0 ? (
                      <>
                        <span className="text-green-600 font-bold">+{safePercentage(annual.percentChange, 1)}</span>
                        <span className="text-green-600 ml-1">↗️</span>
                      </>
                    ) : annual.percentChange < 0 ? (
                      <>
                        <span className="text-red-600 font-bold">{safePercentage(annual.percentChange, 1)}</span>
                        <span className="text-red-600 ml-1">↘️</span>
                      </>
                    ) : (
                      <>
                        <span className="text-gray-600 font-bold">{safePercentage(annual.percentChange, 1)}</span>
                        <span className="text-gray-600 ml-1">➡️</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  From {safePercentage(annual.baselineVegetation, 1)} to {safePercentage(annual.compareVegetation, 1)} vegetation coverage
                </div>
              </div>
            </div>
          )}

          {/* Processing Information */}
          {hasEnhancedData && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <h3 className="font-semibold text-blue-800 mb-3">📊 Processing Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="space-y-2">
                                         <div className="flex justify-between">
                       <span className="text-gray-600">Date Range:</span>
                       <span className="font-medium">{summary?.processing_config?.date_range}</span>
                     </div>
                     <div className="flex justify-between">
                       <span className="text-gray-600">Cloud Threshold:</span>
                       <span className="font-medium">{summary?.processing_config?.cloud_threshold}%</span>
                     </div>
                     <div className="flex justify-between">
                       <span className="text-gray-600">NDVI Threshold:</span>
                       <span className="font-medium">{summary?.processing_config?.ndvi_threshold}</span>
                     </div>
                  </div>
                </div>
                <div>
                  <div className="space-y-2">
                    {summary.geographic_bounds && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Geographic Bounds:</span>
                          <span className="font-medium text-xs">
                            {safeDecimal(summary.geographic_bounds.north, 3)}°N, {safeDecimal(summary.geographic_bounds.south, 3)}°S
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Coverage Area:</span>
                          <span className="font-medium text-xs">
                            {safeDecimal(summary.geographic_bounds.east, 3)}°E, {safeDecimal(summary.geographic_bounds.west, 3)}°W
                          </span>
                        </div>
                      </>
                    )}
                    {summary.city_info && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Analysis Center:</span>
                        <span className="font-medium text-xs">
                          {safeDecimal(summary.city_info.center_lat, 3)}, {safeDecimal(summary.city_info.center_lon, 3)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Interactive Vegetation Map */}
          {selectedCity && (
            <VegetationMap 
              city={selectedCity}
              result={result}
              isVisible={true}
            />
          )}

          {/* Output Files */}
          <div className="mb-6">
            <h3 className="font-semibold text-gray-800 mb-4">📁 Generated Files</h3>
            
            {(Array.isArray(result.outputFiles) ? result.outputFiles.length : 0) === 0 ? (
              <p className="text-gray-500 text-center py-4">No output files available</p>
            ) : (
              <div className="space-y-3">
                {result.outputFiles.map((filePath, index) => {
                  const fileName = filePath.split('/').pop() || '';
                  const isImage = fileName.toLowerCase().match(/\.(png|jpg|jpeg|tif|tiff)$/);
                  let fileIcon = '📁';
                  let fileDescription = '';
                  
                  if (fileName.includes('vegetation_change')) {
                    fileIcon = '🔄';
                    fileDescription = 'Vegetation change analysis (gain/loss visualization)';
                  } else if (fileName.includes('vegetation_highlighted')) {
                    fileIcon = '🌱';
                    fileDescription = 'Vegetation density overlay map';
                  } else if (fileName.includes('ndvi_visualization')) {
                    fileIcon = '📊';
                    fileDescription = 'NDVI index visualization';
                  } else if (fileName.includes('false_color')) {
                    fileIcon = '🎨';
                    fileDescription = 'False color infrared image';
                  } else if (fileName.includes('.tif')) {
                    fileIcon = '🗺️';
                    fileDescription = 'GeoTIFF data file';
                  } else if (isImage) {
                    fileIcon = '🖼️';
                    fileDescription = 'Processed satellite image';
                  }
                  
                  return (
                    <div key={index} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
                      <div className="flex items-center space-x-3">
                        <span className="text-xl">{fileIcon}</span>
                        <div>
                          <div className="font-medium text-gray-900">{fileName}</div>
                          <div className="text-sm text-gray-500">{fileDescription}</div>
                          <div className="text-xs text-gray-400">{filePath}</div>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        {isImage && (
                          <button
                            onClick={() => handleImagePreview(filePath)}
                            className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                          >
                            Preview
                          </button>
                        )}
                        
                        <button
                          onClick={() => handleDownload(filePath)}
                          className="px-3 py-1 text-sm bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors"
                        >
                          Download
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Batch Summary for Multi-City */}
          {Array.isArray((status as any)?.result?.batchSummaries) && ((status as any).result.batchSummaries?.length || 0) > 0 && (
            <SummaryPanel summaries={(status as any).result.batchSummaries as any} processingId={status.id} />
          )}

          {/* Enhanced Vegetation Analysis Insights */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-6">
            <h3 className="font-semibold text-green-800 mb-3">🌿 Enhanced Vegetation Analysis Insights</h3>
            <div className="text-sm text-green-700 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="font-medium mb-2">Coverage Analysis:</p>
                  <p>
                    <strong>{safePercentage(result.vegetationPercentage, 1)}</strong> of the analyzed area 
                    shows vegetation with enhanced multi-index detection.
                  </p>
                  
                  {result.vegetationPercentage > 60 && (
                    <p className="mt-2">✅ <strong>Excellent:</strong> This city has outstanding green space coverage with abundant urban forestry.</p>
                  )}
                  
                  {result.vegetationPercentage >= 40 && result.vegetationPercentage <= 60 && (
                    <p className="mt-2">🟢 <strong>Good:</strong> This city has solid green space coverage with good urban vegetation distribution.</p>
                  )}
                  
                  {result.vegetationPercentage >= 20 && result.vegetationPercentage < 40 && (
                    <p className="mt-2">🟡 <strong>Moderate:</strong> This city has moderate green space. Consider expanding urban greenery initiatives.</p>
                  )}
                  
                  {result.vegetationPercentage < 20 && (
                    <p className="mt-2">🔴 <strong>Limited:</strong> This city would benefit significantly from increased urban vegetation and green infrastructure.</p>
                  )}
                </div>
                
                <div>
                  <p className="font-medium mb-2">Density Distribution:</p>
                  <div className="space-y-1">
                    <p>🟢 <strong>Dense vegetation:</strong> {safePercentage(result.highDensityPercentage, 1)} (forests, parks)</p>
                    <p>🟡 <strong>Moderate vegetation:</strong> {safePercentage(result.mediumDensityPercentage, 1)} (gardens, lawns)</p>
                    <p>🟢 <strong>Sparse vegetation:</strong> {safePercentage(result.lowDensityPercentage, 1)} (scattered plants)</p>
                  </div>
                  
                  {(result.highDensityPercentage || 0) > 10 && (
                    <p className="mt-2 text-green-800">💚 Excellent dense vegetation coverage indicates healthy urban forests.</p>
                  )}
                </div>
              </div>
              
              <div className="pt-3 border-t border-green-200">
                <p className="text-xs text-green-600">
                  <strong>Enhanced Analysis:</strong> This analysis uses multiple vegetation indices (NDVI, EVI, GNDVI) 
                  with advanced cloud detection and improved thresholds for more accurate vegetation classification.
                  {hasEnhancedData && ` Processed ${summary.images_processed} of ${summary.images_found} available satellite images.`}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
      {selectedImage && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl max-h-[90vh] overflow-auto">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-semibold">Enhanced Image Preview</h3>
              <button
                onClick={() => setSelectedImage(null)}
                className="text-gray-500 hover:text-gray-700 text-xl"
              >
                ×
              </button>
            </div>
            
            <div className="p-4">
              <img
                src={`/api/preview?file=${encodeURIComponent(selectedImage)}`}
                alt="Enhanced processed satellite image"
                className="max-w-full h-auto rounded"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxOCIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkltYWdlIG5vdCBhdmFpbGFibGU8L3RleHQ+PC9zdmc+';
                }}
              />
              
              <div className="mt-4 text-sm text-gray-600">
                <p><strong>File:</strong> {selectedImage.split('/').pop()}</p>
                <p><strong>Path:</strong> {selectedImage}</p>
                <p><strong>Type:</strong> Enhanced satellite imagery with vegetation analysis</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 