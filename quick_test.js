const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';
const TEST_CITY_ID = '8792a0b6-f80b-4989-91c0-15f0ec6cb56a';

async function quickTest() {
  try {
    console.log('🧪 Quick status tracking test...');
    
    // Load city data
    const citiesPath = path.join(__dirname, 'public', 'cities.json');
    const citiesData = JSON.parse(fs.readFileSync(citiesPath, 'utf8'));
    const city = citiesData.find(c => c.city_id === TEST_CITY_ID);
    
    if (!city) {
      throw new Error('Punaauia not found');
    }
    
    console.log(`✅ Found ${city.city}, ${city.country}`);
    
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
    
    console.log('🚀 Starting processing...');
    const processResponse = await axios.post(`${BASE_URL}/api/process`, config);
    const processingId = processResponse.data.processingId;
    console.log(`✅ Started processing: ${processingId}`);
    
    // Wait a moment, then check status
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log('📊 Checking status...');
    const statusResponse = await axios.get(`${BASE_URL}/api/status/${processingId}`);
    console.log(`✅ Status retrieved:`, statusResponse.data);
    
    // Check again after 10 seconds
    await new Promise(resolve => setTimeout(resolve, 10000));
    const statusResponse2 = await axios.get(`${BASE_URL}/api/status/${processingId}`);
    console.log(`✅ Status after 10s:`, statusResponse2.data);
    
    console.log('🎉 Status tracking is working!');
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

quickTest(); 