import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const city = searchParams.get('city');
  const country = searchParams.get('country');
  const state = searchParams.get('state');

  if (!city || !country) {
    return NextResponse.json({ error: 'City and country are required' }, { status: 400 });
  }

  try {
    console.log(`Fetching boundary for ${city}, ${state || ''}, ${country}`);
    
    // For now, return a placeholder message since Overpass API is overloaded
    // TODO: Implement proper Overpass API integration when service is stable
    console.log('Overpass API temporarily unavailable, returning placeholder response');
    
    return NextResponse.json({
      error: 'OSM boundary import temporarily unavailable. Please draw the boundary manually using the map controls.',
      placeholder: true,
      message: 'The OpenStreetMap Overpass API is currently overloaded. You can still create city boundaries by using the polygon drawing tools on the map.'
    }, { status: 503 });

  } catch (error: any) {
    console.error('Error fetching boundary:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch boundary' },
      { status: 500 }
    );
  }
}
