#!/usr/bin/env node

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Test configuration for Punaauia
const TEST_CITY_ID = '8792a0b6-f80b-4989-91c0-15f0ec6cb56a';
const POSSIBLE_PORTS = [3000, 3001];
let BASE_URL = 'http://localhost:3000';
let PUNAAUIA_CITY = null;

// Base configuration template (city will be added after loading)
const TEST_CONFIG_TEMPLATE = {
  startMonth: '07',
  startYear: 2020,
  endMonth: '07',
  endYear: 2020,
  ndviThreshold: 0.3,
  cloudCoverageThreshold: 20,
  enableVegetationIndices: false,
  enableAdvancedCloudDetection: false
};

let testResults = {
  timestamp: new Date().toISOString(),
  city: 'Punaauia',
  tests: [],
  errors: [],
  success: false
};

function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
  console.log(`${prefix} [${timestamp}] ${message}`);
  
  testResults.tests.push({
    timestamp,
    type,
    message
  });
  
  if (type === 'error') {
    testResults.errors.push(message);
  }
}

async function checkServerHealth() {
  try {
    log('🔍 Checking server health...');
    
    // Try each possible port
    for (const port of POSSIBLE_PORTS) {
      const testUrl = `http://localhost:${port}`;
      try {
        let response;
        try {
          response = await axios.get(`${testUrl}/api/health`, { timeout: 5000 });
        } catch (healthError) {
          // If /api/health doesn't exist, try the main page
          response = await axios.get(testUrl, { timeout: 5000 });
        }
        
        if (response.status === 200) {
          BASE_URL = testUrl;
          log(`Server is responsive on port ${port}`, 'success');
          return true;
        }
      } catch (error) {
        log(`Port ${port} not responding: ${error.message}`);
      }
    }
    
    log('Server not found on any port', 'error');
    return false;
  } catch (error) {
    log(`Server health check failed: ${error.message}`, 'error');
    return false;
  }
}

async function loadCitiesData() {
  try {
    log('🌍 Loading cities data...');
    const citiesPath = path.join(__dirname, 'public', 'cities.json');
    if (!fs.existsSync(citiesPath)) {
      throw new Error(`Cities file not found at: ${citiesPath}`);
    }
    
    const citiesData = JSON.parse(fs.readFileSync(citiesPath, 'utf8'));
    PUNAAUIA_CITY = citiesData.find(city => city.city_id === TEST_CITY_ID);
    
    if (!PUNAAUIA_CITY) {
      throw new Error(`Punaauia not found in cities data`);
    }
    
    log(`Found Punaauia: ${PUNAAUIA_CITY.city}, ${PUNAAUIA_CITY.country}`, 'success');
    log(`Coordinates: ${PUNAAUIA_CITY.latitude}, ${PUNAAUIA_CITY.longitude}`);
    log(`Has polygon: ${!!PUNAAUIA_CITY.polygon_geojson}`);
    
    return PUNAAUIA_CITY;
  } catch (error) {
    log(`Failed to load cities data: ${error.message}`, 'error');
    throw error;
  }
}

async function testProcessingAPI() {
  try {
    log('🚀 Starting processing test...');
    
    if (!PUNAAUIA_CITY) {
      throw new Error('City data not loaded. Call loadCitiesData() first.');
    }
    
    // Create full config with city object
    const TEST_CONFIG = {
      ...TEST_CONFIG_TEMPLATE,
      city: PUNAAUIA_CITY
    };
    
    log(`Sending config: ${JSON.stringify(TEST_CONFIG, null, 2)}`);
    
    const response = await axios.post(`${BASE_URL}/api/process`, TEST_CONFIG, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (response.status !== 200) {
      const errorText = response.data;
      throw new Error(`Processing API failed: ${response.status} - ${JSON.stringify(errorText)}`);
    }
    
    const result = response.data;
    log(`Processing started with ID: ${result.processingId}`, 'success');
    
    return result.processingId;
  } catch (error) {
    if (error.response) {
      log(`API Response Status: ${error.response.status}`, 'error');
      log(`API Response Data: ${JSON.stringify(error.response.data, null, 2)}`, 'error');
      throw new Error(`Processing API failed: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
    } else {
      log(`Processing API test failed: ${error.message}`, 'error');
      throw error;
    }
  }
}

async function pollProcessingStatus(processingId, maxWaitTime = 600000) { // 10 minutes max
  const startTime = Date.now();
  let lastProgress = -1;
  
  while (Date.now() - startTime < maxWaitTime) {
    try {
      const response = await axios.get(`${BASE_URL}/api/status/${processingId}`);
      
      if (response.status !== 200) {
        log(`Status check failed: ${response.status}`, 'error');
        await new Promise(resolve => setTimeout(resolve, 5000));
        continue;
      }
      
      const status = response.data;
      
      if (status.progress !== lastProgress) {
        log(`Progress: ${status.progress}% - ${status.message}`);
        lastProgress = status.progress;
      }
      
      if (status.status === 'completed') {
        log('Processing completed successfully!', 'success');
        log(`Results: ${JSON.stringify(status.result, null, 2)}`);
        return status;
      }
      
      if (status.status === 'failed') {
        throw new Error(`Processing failed: ${status.message}`);
      }
      
      // Wait 2 seconds before next poll
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      log(`Status polling error: ${error.message}`, 'error');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  
  throw new Error('Processing timed out');
}

async function checkPythonEnvironment() {
  try {
    log('🐍 Checking Python environment...');
    
    const scriptPath = path.join(__dirname, 'python_scripts', 'satellite_processor_optimized.py');
    if (!fs.existsSync(scriptPath)) {
      throw new Error(`Python script not found: ${scriptPath}`);
    }
    
    const venvPath = path.join(__dirname, 'venv', 'bin', 'python');
    if (!fs.existsSync(venvPath)) {
      throw new Error(`Python venv not found: ${venvPath}`);
    }
    
    const requirementsPath = path.join(__dirname, 'python_scripts', 'requirements.txt');
    if (!fs.existsSync(requirementsPath)) {
      throw new Error(`Requirements file not found: ${requirementsPath}`);
    }
    
    log('Python environment files exist', 'success');
    return true;
  } catch (error) {
    log(`Python environment check failed: ${error.message}`, 'error');
    return false;
  }
}

async function saveTestResults() {
  const resultsPath = path.join(__dirname, 'test_results.json');
  try {
    fs.writeFileSync(resultsPath, JSON.stringify(testResults, null, 2));
    log(`Test results saved to: ${resultsPath}`, 'success');
  } catch (error) {
    log(`Failed to save test results: ${error.message}`, 'error');
  }
}

async function runFullTest() {
  try {
    log('🧪 Starting comprehensive Punaauia test...');
    
    // Check server health
    const serverOk = await checkServerHealth();
    if (!serverOk) {
      throw new Error('Server is not responding');
    }
    
    // Check Python environment
    const pythonOk = await checkPythonEnvironment();
    if (!pythonOk) {
      throw new Error('Python environment is not properly set up');
    }
    
    // Load city data
    const cityData = await loadCitiesData();
    
    // Test processing API
    const processingId = await testProcessingAPI();
    
    // Poll for completion
    const finalStatus = await pollProcessingStatus(processingId);
    
    if (finalStatus.status === 'completed') {
      testResults.success = true;
      log('🎉 All tests passed! Punaauia processing works correctly.', 'success');
    }
    
  } catch (error) {
    log(`Test failed: ${error.message}`, 'error');
    testResults.success = false;
  }
  
  await saveTestResults();
  
  // Print summary
  console.log('\n📊 TEST SUMMARY:');
  console.log(`✅ Success: ${testResults.success}`);
  console.log(`❌ Errors: ${testResults.errors.length}`);
  if (testResults.errors.length > 0) {
    console.log('\n🚨 ERRORS:');
    testResults.errors.forEach((error, i) => {
      console.log(`${i + 1}. ${error}`);
    });
  }
  
  process.exit(testResults.success ? 0 : 1);
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  log('Test interrupted by user', 'error');
  await saveTestResults();
  process.exit(1);
});

// Run the test
runFullTest().catch(async (error) => {
  log(`Unexpected error: ${error.message}`, 'error');
  testResults.success = false;
  await saveTestResults();
  process.exit(1);
}); 