'use client';

import { useEffect, useRef, useState } from 'react';
import { ProcessingStatus, City, ProcessingConfig } from '@/types';
import { safeToFixed, safePercentage } from '../lib/utils';

interface NDVIMapProps {
  status: ProcessingStatus;
  city: City;
  config: ProcessingConfig;
}

export default function NDVIMap({ status, city, config }: NDVIMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const [mapDimensions, setMapDimensions] = useState({ width: '100%', height: '600px' });
  const [isMapReady, setIsMapReady] = useState(false);
  const [overlayLayers, setOverlayLayers] = useState<any[]>([]);

  // Responsive map sizing
  useEffect(() => {
    const updateMapDimensions = () => {
      const containerWidth = window.innerWidth;
      if (containerWidth >= 1200) {
        setMapDimensions({ width: '100%', height: '700px' });
      } else if (containerWidth >= 768) {
        setMapDimensions({ width: '100%', height: '600px' });
      } else {
        setMapDimensions({ width: '100%', height: '500px' });
      }
    };

    updateMapDimensions();
    window.addEventListener('resize', updateMapDimensions);
    return () => window.removeEventListener('resize', updateMapDimensions);
  }, []);

  // Initialize map
  useEffect(() => {
    if (typeof window === 'undefined' || !mapRef.current) return;

    const initMap = async () => {
      const L = await import('leaflet');
      
      // Clean up existing map
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
      }

      // Get city coordinates
      const lat = parseFloat(city.latitude);
      const lng = parseFloat(city.longitude);
      
      // Create map with proper zoom level
      if (!mapRef.current) return;
      
      mapInstanceRef.current = L.map(mapRef.current, {
        center: [lat, lng],
        zoom: 12,
        zoomControl: true,
        scrollWheelZoom: true,
        doubleClickZoom: true,
        boxZoom: true,
        keyboard: true,
        dragging: true,
        touchZoom: true
      });

      // Add multiple base layer options
      const baseLayers = {
        'OpenStreetMap': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 19
        }),
        'Satellite': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
          attribution: '© Esri, DigitalGlobe, GeoEye, Earthstar Geographics, CNES/Airbus DS, USDA, USGS, AeroGRID, IGN, and the GIS User Community',
          maxZoom: 19
        }),
        'Terrain': L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenTopoMap contributors',
          maxZoom: 17
        })
      };

      // Add default base layer
      baseLayers['OpenStreetMap'].addTo(mapInstanceRef.current);

      // Add layer control
      const layerControl = L.control.layers(baseLayers, {}, { position: 'topright' });
      layerControl.addTo(mapInstanceRef.current);

      // Add city polygon if available
      if (city.polygon_geojson?.geometry?.coordinates) {
        try {
          const coordinates = city.polygon_geojson.geometry.coordinates[0];
          const latLngs: [number, number][] = coordinates.map((coord: number[]) => [coord[1], coord[0]] as [number, number]);
          
          const cityPolygon = L.polygon(latLngs, {
            color: '#2563eb',
            weight: 2,
            fillOpacity: 0.1,
            fillColor: '#3b82f6'
          }).addTo(mapInstanceRef.current);

          cityPolygon.bindPopup(`
            <div class="p-2">
              <h4 class="font-semibold text-sm">${city.city} City Boundary</h4>
              <p class="text-xs text-gray-600">${city.state}, ${city.country}</p>
            </div>
          `);

          // Fit map to city bounds
          mapInstanceRef.current.fitBounds(cityPolygon.getBounds(), { padding: [20, 20] });
        } catch (error) {
          console.error('Error adding city polygon:', error);
        }
      }

      // Add scale control
      L.control.scale({ position: 'bottomleft' }).addTo(mapInstanceRef.current);

      setIsMapReady(true);
    };

    initMap();

    // Cleanup on unmount
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [city, mapDimensions]);

  // Handle NDVI overlays when processing is complete
  useEffect(() => {
    if (!isMapReady || !mapInstanceRef.current || status.status !== 'completed' || !status.result?.outputFiles) {
      return;
    }

    const addNDVIOverlays = async () => {
      const L = await import('leaflet');
      
      // Clear existing overlay layers
      overlayLayers.forEach(layer => {
        if (mapInstanceRef.current && mapInstanceRef.current.hasLayer(layer)) {
          mapInstanceRef.current.removeLayer(layer);
        }
      });

      const newOverlayLayers: any[] = [];
      const overlayControls: { [key: string]: any } = {};

      // Get bounds from city data or summary
      let overlayBounds: [[number, number], [number, number]];
      
      if (status.result?.summary?.geographic_bounds) {
        const bounds = status.result.summary.geographic_bounds;
        overlayBounds = [
          [bounds.south, bounds.west],
          [bounds.north, bounds.east]
        ];
      } else if (city.polygon_geojson?.geometry?.coordinates) {
        // Calculate bounds from city polygon
        const coordinates = city.polygon_geojson.geometry.coordinates[0];
        const lats = coordinates.map((coord: number[]) => coord[1]);
        const lngs = coordinates.map((coord: number[]) => coord[0]);
        const minLat = Math.min(...lats) - 0.01;
        const maxLat = Math.max(...lats) + 0.01;
        const minLng = Math.min(...lngs) - 0.01;
        const maxLng = Math.max(...lngs) + 0.01;
        overlayBounds = [[minLat, minLng], [maxLat, maxLng]];
      } else {
        // Fallback to city coordinates with buffer
        const lat = parseFloat(city.latitude);
        const lng = parseFloat(city.longitude);
        const buffer = 0.02;
        overlayBounds = [
          [lat - buffer, lng - buffer],
          [lat + buffer, lng + buffer]
        ];
      }

      // Add vegetation highlighted overlay
      const vegetationFile = status.result?.outputFiles?.find(file => 
        file.includes('vegetation_highlighted') && file.endsWith('.png')
      );

      if (vegetationFile) {
        const vegetationLayer = L.imageOverlay(
          `/api/preview?file=${encodeURIComponent(vegetationFile)}`,
          overlayBounds,
          {
            opacity: 0.7,
            crossOrigin: true
          }
        );

        vegetationLayer.bindPopup(`
          <div class="p-3">
            <h4 class="font-semibold text-sm mb-2">🌱 Vegetation Density Map</h4>
            <div class="text-xs space-y-1">
                          <div class="flex items-center gap-2">
              <div class="w-3 h-3 bg-purple-800 rounded" style="opacity: 0.75;"></div>
              <span>High Density (NDVI &gt; 0.55)</span>
            </div>
            <div class="flex items-center gap-2">
              <div class="w-3 h-3 bg-purple-500 rounded" style="opacity: 0.6;"></div>
              <span>Medium Density (0.35-0.55)</span>
            </div>
            <div class="flex items-center gap-2">
              <div class="w-3 h-3 bg-purple-300 rounded" style="opacity: 0.5;"></div>
              <span>Low Density (0.25-0.35)</span>
            </div>
            <div class="flex items-center gap-2">
              <div class="w-3 h-3 bg-purple-100 rounded" style="opacity: 0.3;"></div>
              <span>Subtle Vegetation (0.15-0.25)</span>
            </div>
            </div>
                         <div class="mt-2 pt-2 border-t text-xs text-gray-600">
               Total Vegetation: ${safePercentage(status.result?.vegetationPercentage, 1)}
             </div>
          </div>
        `);

        overlayControls['🌱 Vegetation Density'] = vegetationLayer;
        newOverlayLayers.push(vegetationLayer);
        
        // Add to map by default
        vegetationLayer.addTo(mapInstanceRef.current);
      }

      // Add NDVI visualization overlay
      const ndviFile = status.result?.outputFiles?.find(file => 
        file.includes('ndvi_visualization') && file.endsWith('.png')
      );

      if (ndviFile) {
        const ndviLayer = L.imageOverlay(
          `/api/preview?file=${encodeURIComponent(ndviFile)}`,
          overlayBounds,
          {
            opacity: 0.6,
            crossOrigin: true
          }
        );

        ndviLayer.bindPopup(`
          <div class="p-3">
            <h4 class="font-semibold text-sm mb-2">📊 NDVI Visualization</h4>
            <div class="text-xs space-y-1">
              <div class="flex items-center gap-2">
                <div class="w-3 h-3 bg-gradient-to-r from-purple-600 to-green-400 rounded"></div>
                <span>NDVI Index (-1 to +1)</span>
              </div>
              <div class="text-gray-600">
                Darker = Less vegetation<br/>
                Brighter = More vegetation
              </div>
            </div>
          </div>
        `);

        overlayControls['📊 NDVI Index'] = ndviLayer;
        newOverlayLayers.push(ndviLayer);
      }

      // Update layer control with overlays
      if (Object.keys(overlayControls).length > 0) {
        const layerControl = L.control.layers(
          {
            'OpenStreetMap': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'),
            'Satellite': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'),
            'Terrain': L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png')
          },
          overlayControls,
          { position: 'topright' }
        );
        
        // Remove existing layer control and add new one
        mapInstanceRef.current.eachLayer((layer: any) => {
          if (layer.options && layer.options.position === 'topright' && layer._container?.className?.includes('leaflet-control-layers')) {
            mapInstanceRef.current.removeControl(layer);
          }
        });
        
        layerControl.addTo(mapInstanceRef.current);
      }

      setOverlayLayers(newOverlayLayers);
    };

    addNDVIOverlays();
  }, [isMapReady, status, city, config]);

  // Add comprehensive info panel
  useEffect(() => {
    if (!isMapReady || !mapInstanceRef.current) return;

    const addInfoPanel = async () => {
      const L = await import('leaflet');
      
      const info = new L.Control({ position: 'bottomright' });
      
      info.onAdd = function() {
        const div = L.DomUtil.create('div', 'leaflet-info-panel');
        
        // Style the info panel
        div.style.cssText = `
          background: white;
          padding: 12px;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          max-width: 280px;
          font-family: system-ui, -apple-system, sans-serif;
          border: 1px solid #e5e7eb;
        `;
        
        let content = `
          <h4 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: #1f2937;">
            📍 ${city.city}, ${city.country}
          </h4>
        `;

        if (status.status === 'completed' && status.result) {
          content += `
            <div style="font-size: 12px; color: #4b5563; line-height: 1.4;">
              <div style="margin-bottom: 6px;">
                                 <span style="font-weight: 500;">Vegetation Coverage:</span> ${safePercentage(status.result?.vegetationPercentage, 1)}
               </div>
               ${status.result?.highDensityPercentage ? `
                 <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                   <span style="color: #059669;">🟢 High:</span>
                   <span>${safePercentage(status.result.highDensityPercentage, 1)}</span>
                 </div>
                 <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                   <span style="color: #d97706;">🟡 Medium:</span>
                   <span>${safePercentage(status.result.mediumDensityPercentage, 1)}</span>
                 </div>
                 <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                   <span style="color: #7c3aed;">🟣 Low:</span>
                   <span>${safePercentage(status.result.lowDensityPercentage, 1)}</span>
                 </div>
               ` : ''}
               <div style="padding-top: 6px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #6b7280;">
                 <div>Period: ${config.startMonth}/${config.startYear}</div>
                 <div>NDVI Threshold: ${config.ndviThreshold}</div>
                 <div>Images: ${status.result?.downloadedImages || 0} processed</div>
              </div>
            </div>
          `;
        } else {
          content += `
            <div style="font-size: 12px; color: #6b7280;">
              ${status.status === 'pending' && 'Waiting to start processing...'}
              ${status.status === 'downloading' && 'Downloading satellite images...'}
              ${status.status === 'preprocessing' && 'Processing satellite data...'}
              ${status.status === 'processing' && 'Generating NDVI analysis...'}
              ${status.status === 'failed' && 'Processing failed'}
            </div>
          `;
        }
        
        div.innerHTML = content;
        return div;
      };
      
      info.addTo(mapInstanceRef.current);
    };

    addInfoPanel();
  }, [isMapReady, status, city, config]);

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">
              🗺️ Interactive Vegetation Map
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              NDVI analysis and vegetation density for {city.city}
            </p>
          </div>
          {status.status === 'completed' && (
            <div className="text-right">
              <div className="text-2xl font-bold text-green-600">
                {safePercentage(status.result?.vegetationPercentage, 1)}
              </div>
              <div className="text-xs text-gray-500">Vegetation</div>
            </div>
          )}
        </div>
      </div>
      
      <div className="relative">
        <div 
          ref={mapRef} 
          style={{ 
            width: mapDimensions.width, 
            height: mapDimensions.height,
            minHeight: '400px'
          }}
          className="relative z-0"
        >
          {status.status !== 'completed' && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-50/90 z-10 backdrop-blur-sm">
              <div className="text-center max-w-sm">
                <div className="text-gray-400 mb-3">
                  {status.status === 'processing' ? (
                    <svg className="mx-auto h-12 w-12 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  ) : (
                    <svg className="mx-auto h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                    </svg>
                  )}
                </div>
                <p className="text-gray-600 font-medium">
                  {status.status === 'pending' && 'Ready to Process'}
                  {status.status === 'downloading' && 'Downloading Satellite Data'}
                  {status.status === 'preprocessing' && 'Processing Images'}
                  {status.status === 'processing' && 'Analyzing Vegetation'}
                  {status.status === 'failed' && 'Processing Failed'}
                </p>
                {status.message && (
                  <p className="text-sm text-gray-500 mt-2">{status.message}</p>
                )}
                {status.status !== 'failed' && status.status !== 'pending' && (
                  <div className="mt-3">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-green-500 h-2 rounded-full transition-all duration-300" 
                        style={{ width: `${status.progress || 0}%` }}
                      ></div>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {status.progress || 0}% complete
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        
        {/* Legend */}
        {status.status === 'completed' && (
          <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-sm rounded-lg p-3 shadow-lg border border-gray-200 max-w-xs z-20">
            <h4 className="font-semibold text-sm mb-2">🌱 Vegetation Legend</h4>
            <div className="space-y-1 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-green-500 rounded-sm"></div>
                <span>High Density (&gt; 0.6 NDVI)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-yellow-500 rounded-sm"></div>
                <span>Medium Density (0.4-0.6)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-purple-500 rounded-sm"></div>
                <span>Low Density ({config.ndviThreshold}-0.4)</span>
              </div>
              <div className="pt-1 border-t border-gray-200 text-gray-600">
                <div>Use layer controls to toggle overlays</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 