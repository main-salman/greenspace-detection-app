'use client';

import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, ImageOverlay, LayersControl, Rectangle, Polygon, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { City, ProcessingResult } from '@/types';

// Fix for default markers in Leaflet with Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface VegetationMapProps {
  city: City;
  result: ProcessingResult;
  isVisible: boolean;
}

interface CityBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

function getCityBounds(city: City): CityBounds {
  try {
    // Try to get bounds from polygon if available
    if (city.polygon_geojson?.geometry?.type === 'Polygon') {
      const coordinates = city.polygon_geojson.geometry.coordinates[0];
      const lons = coordinates.map(coord => coord[0]);
      const lats = coordinates.map(coord => coord[1]);
      
      return {
        north: Math.max(...lats),
        south: Math.min(...lats),
        east: Math.max(...lons),
        west: Math.min(...lons)
      };
    }
  } catch (error) {
    console.warn('Error parsing polygon bounds:', error);
  }
  
  // Fallback to city coordinates with buffer
  const lat = parseFloat(city.latitude);
  const lon = parseFloat(city.longitude);
  const buffer = 0.05; // ~5km buffer
  
  return {
    north: lat + buffer,
    south: lat - buffer,
    east: lon + buffer,
    west: lon - buffer
  };
}

// Calculate satellite image bounds that are more aligned with actual data extent
function getSatelliteImageBounds(cityBounds: CityBounds): [[number, number], [number, number]] {
  // Expand bounds slightly to match typical satellite imagery extents
  // This mimics how the notebook's Nominatim bounds work
  const latSpan = cityBounds.north - cityBounds.south;
  const lonSpan = cityBounds.east - cityBounds.west;
  
  // Add 20% padding to match satellite image coverage
  const latPadding = latSpan * 0.2;
  const lonPadding = lonSpan * 0.2;
  
  return [
    [cityBounds.south - latPadding, cityBounds.west - lonPadding],
    [cityBounds.north + latPadding, cityBounds.east + lonPadding]
  ];
}

// Component to fit map bounds after initial render
function FitBounds({ bounds }: { bounds: CityBounds }) {
  const map = useMap();
  
  useEffect(() => {
    const leafletBounds = L.latLngBounds(
      [bounds.south, bounds.west],
      [bounds.north, bounds.east]
    );
    map.fitBounds(leafletBounds, { padding: [20, 20] });
  }, [map, bounds]);
  
  return null;
}

export default function VegetationMap({ city, result, isVisible }: VegetationMapProps) {
  const [mapKey, setMapKey] = useState(0);
  const [mounted, setMounted] = useState(false);
  
  // CRITICAL FIX: Use geographic bounds from satellite processing result instead of city bounds
  const bounds = result.summary?.geographic_bounds ? {
    north: result.summary.geographic_bounds.north,
    south: result.summary.geographic_bounds.south,
    east: result.summary.geographic_bounds.east,
    west: result.summary.geographic_bounds.west
  } : getCityBounds(city);
  
  // Calculate center point
  const center: [number, number] = [
    (bounds.north + bounds.south) / 2,
    (bounds.east + bounds.west) / 2
  ];
  
  // CRITICAL FIX: Use actual satellite image bounds instead of arbitrary padding
  const overlayBounds: [[number, number], [number, number]] = [
    [bounds.south, bounds.west],
    [bounds.north, bounds.east]
  ];
  
  // Ensure component is mounted before rendering map
  useEffect(() => {
    setMounted(true);
  }, []);
  
  // Force re-render when visibility changes
  useEffect(() => {
    if (isVisible && mounted) {
      setMapKey(prev => prev + 1);
    }
  }, [isVisible, mounted]);
  
  if (!isVisible || !mounted) {
    return null;
  }
  
  return (
    <div className="bg-white rounded-lg shadow-md overflow-x-auto" style={{ maxWidth: 'none' }}>
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-800 flex items-center">
          🗺️ Interactive Vegetation Map
          <span className="ml-2 text-sm font-normal text-gray-600">
            {city.city}, {city.country}
          </span>
        </h3>
        <p className="text-sm text-gray-600 mt-1">
          Toggle between vegetation highlighting and NDVI visualization overlays
        </p>
      </div>
      
      <div style={{ height: '1152px', width: '2400px', minWidth: '2400px' }} className="relative">
        <MapContainer
          key={mapKey}
          center={center}
          zoom={11}
          style={{ height: '100%', width: '2400px', minWidth: '2400px' }}
          zoomControl={true}
        >
          <FitBounds bounds={bounds} />
          
          {/* Base tile layers */}
          <LayersControl position="topright">
            <LayersControl.BaseLayer checked name="Grayscale Map">
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                className="grayscale-map"
              />
            </LayersControl.BaseLayer>
            
            <LayersControl.BaseLayer name="OpenStreetMap">
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
            </LayersControl.BaseLayer>
            
            <LayersControl.BaseLayer name="Satellite">
              <TileLayer
                attribution='&copy; <a href="https://www.esri.com/">Esri</a>'
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              />
            </LayersControl.BaseLayer>
            
            {/* Sentinel False Color Image - Enhanced for vegetation */}
            {result.outputFiles.find(file => file.includes('false_color_base')) && (
              <LayersControl.BaseLayer name="🛰️ Sentinel (Vegetation Enhanced)">
                <ImageOverlay
                  url={`/${result.outputFiles.find(file => file.includes('false_color_base'))}`}
                  bounds={overlayBounds}
                  opacity={1.0}
                />
              </LayersControl.BaseLayer>
            )}
            
            {/* Sentinel Natural Color Image */}
            {result.outputFiles.find(file => file.includes('natural_color_base')) && (
              <LayersControl.BaseLayer name="🛰️ Sentinel (Natural Color)">
                <ImageOverlay
                  url={`/${result.outputFiles.find(file => file.includes('natural_color_base'))}`}
                  bounds={overlayBounds}
                  opacity={1.0}
                />
              </LayersControl.BaseLayer>
            )}
            
            {/* City boundary polygon */}
            {city.polygon_geojson?.geometry?.type === 'Polygon' && (
              <Polygon
                positions={city.polygon_geojson.geometry.coordinates[0].map(coord => [coord[1], coord[0]])}
                pathOptions={{
                  color: '#3B82F6',
                  weight: 2,
                  fillOpacity: 0.0,
                  dashArray: '5, 5'
                }}
              />
            )}
            
            {/* Vegetation overlays */}
            {Array.isArray(result.outputFiles) && (result.outputFiles?.length || 0) > 0 && (
              <>
                {result.outputFiles.find(file => file.includes('vegetation_highlighted')) && (
                  <LayersControl.Overlay checked name="💜 Purple Vegetation Density">
                    <ImageOverlay
                      url={`/${result.outputFiles.find(file => file.includes('vegetation_highlighted'))}`}
                      bounds={overlayBounds}
                      opacity={0.7}
                    />
                  </LayersControl.Overlay>
                )}
                
                {result.outputFiles.find(file => file.includes('ndvi_visualization')) && (
                  <LayersControl.Overlay name="📊 NDVI Color Map">
                    <ImageOverlay
                      url={`/${result.outputFiles.find(file => file.includes('ndvi_visualization'))}`}
                      bounds={overlayBounds}
                      opacity={0.6}
                    />
                  </LayersControl.Overlay>
                )}
              </>
            )}
          </LayersControl>
        </MapContainer>
      </div>
      
      {/* Map Legend */}
      <div className="p-4 bg-gray-50 border-t border-gray-200">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <h4 className="font-medium text-gray-700 mb-2">🌱 Vegetation Density</h4>
            <div className="space-y-1">
                          <div className="flex items-center">
              <div className="w-4 h-4 bg-purple-800 rounded mr-2 opacity-75"></div>
              <span>High Density (NDVI &gt; 0.55)</span>
            </div>
            <div className="flex items-center">
              <div className="w-4 h-4 bg-purple-500 rounded mr-2 opacity-60"></div>
              <span>Medium Density (NDVI 0.35-0.55)</span>
            </div>
            <div className="flex items-center">
              <div className="w-4 h-4 bg-purple-300 rounded mr-2 opacity-50"></div>
              <span>Low Density (NDVI 0.25-0.35)</span>
            </div>
            <div className="flex items-center">
              <div className="w-4 h-4 bg-purple-100 rounded mr-2 opacity-30"></div>
              <span>Subtle Vegetation (NDVI 0.15-0.25)</span>
            </div>
            </div>
          </div>
          
          <div>
            <h4 className="font-medium text-gray-700 mb-2">🗺️ Map Controls</h4>
            <div className="space-y-1 text-gray-600">
              <div>• Use layer control (top-right) to toggle overlays</div>
              <div>• Switch between street and satellite base maps</div>
              <div>• Zoom and pan to explore vegetation patterns</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 