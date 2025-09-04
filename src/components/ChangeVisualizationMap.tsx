'use client';

import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, ImageOverlay, LayersControl, Polygon } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { City } from '@/types';

// Fix for default markers in Leaflet with Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface ChangeVisualizationMapProps {
  city: City;
  processingId: string;
  changeVisualization: any;
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

export default function ChangeVisualizationMap({ city, processingId, changeVisualization }: ChangeVisualizationMapProps) {
  const [mounted, setMounted] = useState(false);
  const [mapKey, setMapKey] = useState(0);

  const bounds = getCityBounds(city);
  
  // Calculate center point
  const center: [number, number] = [
    (bounds.north + bounds.south) / 2,
    (bounds.east + bounds.west) / 2
  ];
  
  // Use bounds for overlay
  const overlayBounds: [[number, number], [number, number]] = [
    [bounds.south, bounds.west],
    [bounds.north, bounds.east]
  ];
  
  // Ensure component is mounted before rendering map
  useEffect(() => {
    setMounted(true);
  }, []);
  
  if (!mounted) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading change visualization map...</p>
          </div>
        </div>
      </div>
    );
  }
  
  // Get city polygon coordinates for display
  const cityPolygon = city.polygon_geojson?.geometry?.type === 'Polygon' 
    ? city.polygon_geojson.geometry.coordinates[0].map(coord => [coord[1], coord[0]] as [number, number])
    : null;

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-800 flex items-center">
          🔄 Vegetation Change Map
          <span className="ml-2 text-sm font-normal text-gray-600">
            {city.city}, {city.country}
          </span>
        </h3>
        <p className="text-sm text-gray-600 mt-1">
          Interactive map showing vegetation changes on black & white street map background
        </p>
      </div>
      
      <div style={{ height: '600px', width: '100%' }} className="relative">
        <MapContainer
          key={mapKey}
          center={center}
          zoom={12}
          style={{ height: '100%', width: '100%' }}
          maxZoom={18}
        >
          <LayersControl position="topright">
            <LayersControl.BaseLayer checked name="Black & White Street Map">
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                className="grayscale-map"
              />
            </LayersControl.BaseLayer>
            
            <LayersControl.BaseLayer name="Satellite">
              <TileLayer
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                attribution='&copy; <a href="https://www.esri.com/">Esri</a>'
              />
            </LayersControl.BaseLayer>

            <LayersControl.Overlay checked name="Vegetation Change Analysis">
              <ImageOverlay
                url={`/api/preview?file=${encodeURIComponent(`outputs/${processingId}/${city.city}/vegetation_change.png`)}`}
                bounds={overlayBounds}
                opacity={0.7}
              />
            </LayersControl.Overlay>
          </LayersControl>

          {/* City boundary polygon */}
          {cityPolygon && (
            <Polygon
              positions={cityPolygon}
              pathOptions={{
                color: '#3b82f6',
                weight: 2,
                opacity: 0.8,
                fillOpacity: 0.1,
                dashArray: '5, 5'
              }}
            />
          )}
        </MapContainer>
      </div>
      
      <div className="p-4 bg-gray-50">
        <div className="flex items-center justify-center space-x-6 text-sm">
          <div className="flex items-center">
            <div className="w-4 h-4 bg-green-500 rounded mr-2"></div>
            <span>Vegetation Gain ({changeVisualization?.gainPercentage?.toFixed(1) || '0.0'}%)</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 bg-red-500 rounded mr-2"></div>
            <span>Vegetation Loss ({changeVisualization?.lossPercentage?.toFixed(1) || '0.0'}%)</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 bg-purple-500 rounded mr-2"></div>
            <span>Stable Vegetation ({changeVisualization?.stablePercentage?.toFixed(1) || '0.0'}%)</span>
          </div>
        </div>
        <p className="text-xs text-gray-500 text-center mt-2">
          🗺️ Black & white street map background • Toggle layers using the control in the top-right corner
        </p>
      </div>
    </div>
  );
}
