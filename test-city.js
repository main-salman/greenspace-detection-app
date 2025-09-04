#!/usr/bin/env node

/**
 * Test script for satellite processing of any city
 * Usage: node test-city.js [city_name]
 * Example: node test-city.js "Punaauia"
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';
const cityName = process.argv[2] || 'Punaauia';

async function testCity() {
  try {
    console.log(`🌍 Testing satellite processing for: ${cityName}`);
    
    // Load cities
    const citiesPath = path.join(__dirname, 'public', 'cities.json');
    const citiesData = JSON.parse(fs.readFileSync(citiesPath, 'utf8'));
    
    // Find city (case insensitive)
    const city = citiesData.find(c => 
      c.city.toLowerCase().includes(cityName.toLowerCase()) ||
      c.country.toLowerCase().includes(cityName.toLowerCase())
    );
    
    if (!city) {
      console.log(`❌ City "${cityName}" not found. Available cities include:`);
      console.log(citiesData.slice(0, 10).map(c => `  - ${c.city}, ${c.country}`).join('\n'));
      return;
    }
    
    console.log(`✅ Found: ${city.city}, ${city.state_province}, ${city.country}`);
    console.log(`📍 Coordinates: ${city.latitude}, ${city.longitude}`);
    
    // Start processing
    const config = {
      city,
      startMonth: '07',
      startYear: 2020,
      endMonth: '07',
      endYear: 2020,
      ndviThreshold: 0.3,
      cloudCoverageThreshold: 20,
      enableVegetationIndices: false,
      enableAdvancedCloudDetection: false
    };
    
    console.log('🚀 Starting satellite processing...');
    const processResponse = await axios.post(`${BASE_URL}/api/process`, config);
    const processingId = processResponse.data.processingId;
    console.log(`✅ Processing started: ${processingId}`);
    
    // Monitor progress
    console.log('📊 Monitoring progress (will show first 30 seconds)...');
    const startTime = Date.now();
    let lastProgress = -1;
    
    while (Date.now() - startTime < 30000) { // 30 seconds
      try {
        const statusResponse = await axios.get(`${BASE_URL}/api/status/${processingId}`);
        const status = statusResponse.data;
        
        if (status.progress !== lastProgress) {
          console.log(`  ${status.progress}% - ${status.status} - ${status.message}`);
          lastProgress = status.progress;
        }
        
        if (status.status === 'completed') {
          console.log('🎉 Processing completed!');
          console.log(`📊 Results: ${JSON.stringify(status.result, null, 2)}`);
          break;
        }
        
        if (status.status === 'failed') {
          console.log(`❌ Processing failed: ${status.message}`);
          break;
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.log(`⚠️  Status check failed: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    
    console.log(`\n✅ Test completed! Processing continues in background.`);
    console.log(`🌐 View results at: http://localhost:3000`);
    console.log(`📊 Check status: curl http://localhost:3000/api/status/${processingId}`);
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

testCity(); 