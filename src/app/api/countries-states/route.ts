import { NextResponse } from 'next/server';
import path from 'path';
import { promises as fs } from 'fs';

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'countries_states.json');
    const data = await fs.readFile(filePath, 'utf-8');
    const countries = JSON.parse(data);
    return NextResponse.json(countries);
  } catch (error) {
    console.error('Error reading countries_states.json:', error);
    return NextResponse.json({ error: 'Failed to load countries and states' }, { status: 500 });
  }
}


