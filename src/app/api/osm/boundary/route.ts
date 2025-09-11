import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

async function fetchNominatimByQ(q: string) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&polygon_geojson=1&addressdetails=1&limit=1&q=${encodeURIComponent(q)}`;
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'greenspace-detection-app/1.0 (+https://github.com/main-salman)'
    }
  });
  if (!resp.ok) throw new Error(`Nominatim search failed: ${resp.status}`);
  const data = await resp.json();
  if (Array.isArray(data) && data.length > 0) {
    const best = data[0];
    const geojson = best.geojson || best.polygon_geojson;
    if (geojson) {
      return { polygon_geojson: { type: 'Feature', properties: {}, geometry: geojson }, source: 'nominatim-json', display_name: best.display_name };
    }
  }
  return null;
}

async function fetchNominatimGeoJSON(params: { city: string; state?: string | null; country: string; }) {
  const sp = new URLSearchParams();
  sp.set('format', 'geojson');
  sp.set('polygon_geojson', '1');
  sp.set('limit', '1');
  sp.set('city', params.city);
  if (params.state) sp.set('state', params.state);
  sp.set('country', params.country);
  const url = `https://nominatim.openstreetmap.org/search?${sp.toString()}`;
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'greenspace-detection-app/1.0 (+https://github.com/main-salman)'
    }
  });
  if (!resp.ok) throw new Error(`Nominatim geojson failed: ${resp.status}`);
  const data = await resp.json();
  if (data && data.type === 'FeatureCollection' && Array.isArray(data.features) && data.features.length > 0) {
    const f = data.features[0];
    if (f && f.geometry) {
      return { polygon_geojson: f, source: 'nominatim-geojson', display_name: (f.properties && (f.properties.display_name || f.properties.name)) || undefined };
    }
  }
  return null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const city = searchParams.get('city');
  const country = searchParams.get('country');
  const state = searchParams.get('state');

  if (!city || !country) {
    return NextResponse.json({ error: 'City and country are required' }, { status: 400 });
  }

  try {
    const q = [city, state || undefined, country].filter(Boolean).join(', ');
    console.log(`Fetching boundary via Nominatim for ${q}`);

    // Attempt 1: Nominatim JSON with polygon_geojson
    let result = await fetchNominatimByQ(q);

    // Attempt 2: Structured params with format=geojson
    if (!result) {
      result = await fetchNominatimGeoJSON({ city, state, country });
    }

    if (result && result.polygon_geojson) {
      return NextResponse.json(result);
    }

    return NextResponse.json({
      error: 'Boundary not found from OSM. Please try again later or draw manually.',
    }, { status: 404 });

  } catch (error: any) {
    console.error('Error fetching boundary:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch boundary' },
      { status: 500 }
    );
  }
}
