import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { promises as fs } from 'fs';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { city_id, country, state_province, city, latitude, longitude, notification_email, polygon_geojson } = body;

    if (!country || !city) {
      return NextResponse.json({ error: 'Country and city are required' }, { status: 400 });
    }

    // Read existing cities
    const rootCitiesPath = path.join(process.cwd(), '..', 'cities.json');
    let cities = [];
    
    try {
      const data = await fs.readFile(rootCitiesPath, 'utf-8');
      cities = JSON.parse(data);
    } catch (error) {
      console.log('Creating new cities.json file');
      cities = [];
    }

    // Find existing city or create new one
    let cityIndex = -1;
    if (city_id) {
      cityIndex = cities.findIndex((c: any) => c.city_id === city_id);
    }

    const cityData = {
      city_id: city_id || uuidv4(),
      country,
      state_province: state_province || '',
      city,
      latitude: latitude || '',
      longitude: longitude || '',
      notification_email: notification_email || '',
      polygon_geojson: polygon_geojson || null,
    };

    if (cityIndex >= 0) {
      // Update existing city
      cities[cityIndex] = cityData;
    } else {
      // Add new city
      cities.push(cityData);
    }

    // Create backup before saving
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(process.cwd(), '..', `cities.json.${timestamp}.bak`);
    
    try {
      const originalData = await fs.readFile(rootCitiesPath, 'utf-8');
      await fs.writeFile(backupPath, originalData);
      console.log(`Created backup: ${backupPath}`);
    } catch (error) {
      console.log('No existing file to backup');
    }

    // Save updated cities
    await fs.writeFile(rootCitiesPath, JSON.stringify(cities, null, 2));

    return NextResponse.json({ 
      message: 'City saved successfully',
      city_id: cityData.city_id 
    });

  } catch (error: any) {
    console.error('Error saving city:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to save city' },
      { status: 500 }
    );
  }
}


