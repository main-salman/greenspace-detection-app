'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import type React from 'react';
import { useMap } from 'react-leaflet';

const Map = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false });
const Polygon = dynamic(() => import('react-leaflet').then(m => m.Polygon), { ssr: false });
const FeatureGroup = dynamic(
  () => import('react-leaflet').then(m => m.FeatureGroup),
  { ssr: false }
);
const EditControl: any = dynamic<any>(
  () => import('react-leaflet-draw').then((m: any) => m.EditControl),
  { ssr: false }
);

function MapCenterer({ lat, lon, minZoom = 10 }: { lat?: number; lon?: number; minZoom?: number }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    if (Number.isFinite(lat as number) && Number.isFinite(lon as number)) {
      try { map.invalidateSize?.(); } catch {}
      const targetZoom = Math.max(map.getZoom ? map.getZoom() : 4, minZoom);
      try {
        if ((map as any).flyTo) {
          (map as any).flyTo([lat as number, lon as number], targetZoom, { animate: true });
        } else {
          map.setView([lat as number, lon as number], targetZoom, { animate: true });
        }
      } catch {}
    }
  }, [map, lat, lon, minZoom]);
  return null;
}

interface CityForm {
  city_id?: string;
  country: string;
  state_province?: string;
  city: string;
  latitude?: string;
  longitude?: string;
  notification_email?: string;
  polygon_geojson?: any;
}

export default function AddCityPage() {
  const [form, setForm] = useState<CityForm>({ country: '', city: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [polygon, setPolygon] = useState<[number, number][]>([]);
  const [countries, setCountries] = useState<{ name: string; states?: { name: string }[] }[]>([]);
  const [loadingCountries, setLoadingCountries] = useState(false);

  const center = useMemo(() => ({ lat: 20, lng: 0 }), []);

  useEffect(() => {
    // Initialize from selected polygon_geojson if provided
    if (form.polygon_geojson && form.polygon_geojson.geometry && form.polygon_geojson.geometry.type === 'Polygon') {
      const coords = form.polygon_geojson.geometry.coordinates?.[0] || [];
      setPolygon(coords.map((c: number[]) => [c[1], c[0]]));
    }
  }, [form.polygon_geojson]);

  const updateField = (k: keyof CityForm, v: any) => setForm(f => ({ ...f, [k]: v }));

  // Load countries/states list
  useEffect(() => {
    const load = async () => {
      try {
        setLoadingCountries(true);
        const resp = await fetch('/api/countries-states');
        if (!resp.ok) throw new Error('Failed to load countries');
        const data = await resp.json();
        setCountries(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingCountries(false);
      }
    };
    load();
  }, []);

  const statesForSelectedCountry = useMemo(() => {
    if (!form.country) return [] as string[];
    const country = countries.find(c => c.name === form.country);
    if (!country || !Array.isArray(country.states)) return [] as string[];
    return country.states.map(s => s.name).sort((a, b) => a.localeCompare(b));
  }, [countries, form.country]);

  const importBoundary = async () => {
    setError(null);
    if (!form.city || !form.country) {
      setError('City and Country are required');
      return;
    }
    try {
      setLoading(true);
      const params = new URLSearchParams({ city: form.city, country: form.country });
      if (form.state_province) params.set('state', form.state_province);
      const resp = await fetch(`/api/osm/boundary?${params.toString()}`);
      if (!resp.ok) {
        const errorData = await resp.json();
        if (errorData.placeholder) {
          throw new Error(errorData.message || errorData.error);
        } else {
          throw new Error('Boundary not found');
        }
      }
      const data = await resp.json();
      updateField('polygon_geojson', data.polygon_geojson);
    } catch (e: any) {
      setError(e.message || 'Failed to import boundary');
    } finally {
      setLoading(false);
    }
  };

  const saveCity = async () => {
    setError(null);
    try {
      setLoading(true);
      const payload: any = { ...form };
      // Rebuild polygon from drawn state if present
      if (polygon && polygon.length > 2) {
        payload.polygon_geojson = {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [polygon.map(pt => [pt[1], pt[0]])],
          }
        };
      }
      const resp = await fetch('/api/cities/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) throw new Error(await resp.text());
      alert('Saved!');
    } catch (e: any) {
      setError(e.message || 'Save failed');
    } finally {
      setLoading(false);
    }
  };

  const autofillLatLon = async () => {
    setError(null);
    try {
      // Prefer centroid of drawn/imported polygon
      if (polygon && polygon.length > 2) {
        const latSum = polygon.reduce((acc, p) => acc + p[0], 0);
        const lonSum = polygon.reduce((acc, p) => acc + p[1], 0);
        const lat = latSum / polygon.length;
        const lon = lonSum / polygon.length;
        setForm(f => ({ ...f, latitude: String(lat), longitude: String(lon) }));
        return;
      }

      // Otherwise use OSM Nominatim geocoding
      if (!form.city || !form.country) {
        setError('City and Country are required to autofill coordinates');
        return;
      }
      const q = [form.city, form.state_province, form.country].filter(Boolean).join(', ');
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error('Geocoding request failed');
      const results = await resp.json();
      if (!Array.isArray(results) || results.length === 0) {
        throw new Error('No results found for provided location');
      }
      const best = results[0];
      const lat = Number(best.lat);
      const lon = Number(best.lon);
      setForm(f => ({ ...f, latitude: String(lat), longitude: String(lon) }));
    } catch (e: any) {
      setError(e.message || 'Failed to autofill coordinates');
    }
  };

  const latNum = useMemo(() => parseFloat(form.latitude || ''), [form.latitude]);
  const lonNum = useMemo(() => parseFloat(form.longitude || ''), [form.longitude]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-6 max-w-5xl">
        <h1 className="text-2xl font-bold mb-4">Add / Edit City</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1 space-y-3 bg-white p-4 rounded border">
            <div>
              <label className="text-sm text-gray-600">Country</label>
              <select
                className="w-full border rounded px-2 py-1"
                value={form.country}
                onChange={e => {
                  const next = e.target.value;
                  setForm(f => ({ ...f, country: next, state_province: '' }));
                }}
              >
                <option value="">{loadingCountries ? 'Loading…' : 'Select Country'}</option>
                {countries
                  .map(c => c.name)
                  .sort((a, b) => a.localeCompare(b))
                  .map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-600">State / Province</label>
              <select
                className="w-full border rounded px-2 py-1"
                value={form.state_province || ''}
                onChange={e => updateField('state_province', e.target.value)}
                disabled={!form.country || statesForSelectedCountry.length === 0}
              >
                <option value="">{form.country ? 'Select State / Province' : 'Select Country first'}</option>
                {statesForSelectedCountry.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-600">City</label>
              <input className="w-full border rounded px-2 py-1" value={form.city} onChange={e => updateField('city', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-sm text-gray-600">Latitude</label>
                <input className="w-full border rounded px-2 py-1" value={form.latitude || ''} onChange={e => updateField('latitude', e.target.value)} />
              </div>
              <div>
                <label className="text-sm text-gray-600">Longitude</label>
                <input className="w-full border rounded px-2 py-1" value={form.longitude || ''} onChange={e => updateField('longitude', e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-sm text-gray-600">Notification Email (optional)</label>
              <input className="w-full border rounded px-2 py-1" value={form.notification_email || ''} onChange={e => updateField('notification_email', e.target.value)} />
            </div>
            <div className="flex gap-2">
              <button onClick={importBoundary} disabled={loading} className="px-3 py-1 bg-blue-600 text-white rounded">Import OSM Boundary</button>
              <button onClick={autofillLatLon} disabled={loading} className="px-3 py-1 bg-indigo-600 text-white rounded">Autofill Lat/Lon</button>
              <button onClick={saveCity} disabled={loading} className="px-3 py-1 bg-green-600 text-white rounded">Save</button>
            </div>
            {error && <div className="text-sm text-red-600">{error}</div>}
            {loading && <div className="text-sm text-gray-500">Working…</div>}
          </div>
          <div className="md:col-span-2 bg-white rounded border overflow-hidden">
            <div style={{ height: 500 }}>
              <Map center={center} zoom={4} style={{ height: '100%', width: '100%' }}>
                {Number.isFinite(latNum) && Number.isFinite(lonNum) && (
                  <MapCenterer lat={latNum} lon={lonNum} minZoom={10} />
                )}
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
                <FeatureGroup>
                  <EditControl
                    position="topleft"
                    draw={{
                      polyline: false,
                      rectangle: false,
                      circle: false,
                      circlemarker: false,
                      marker: false,
                      polygon: {
                        allowIntersection: false,
                        showArea: true,
                      },
                    }}
                    edit={{
                      edit: true,
                      remove: true,
                    }}
                    onCreated={(e: any) => {
                      if (e.layer && e.layer.getLatLngs) {
                        const latlngs = e.layer.getLatLngs()[0] || [];
                        setPolygon(latlngs.map((ll: any) => [ll.lat, ll.lng]));
                      }
                    }}
                    onEdited={(e: any) => {
                      const layers = e.layers;
                      layers.eachLayer((layer: any) => {
                        const latlngs = layer.getLatLngs()[0] || [];
                        setPolygon(latlngs.map((ll: any) => [ll.lat, ll.lng]));
                      });
                    }}
                    onDeleted={() => {
                      setPolygon([]);
                    }}
                  />
                  {polygon.length > 0 && (
                    <Polygon positions={polygon as any} pathOptions={{ color: 'purple' }} />
                  )}
                </FeatureGroup>
              </Map>
            </div>
            <div className="p-3 border-t text-sm text-gray-600">Use the drawing controls to create/edit/delete the boundary polygon.</div>
          </div>
        </div>
      </div>
    </div>
  );
}


