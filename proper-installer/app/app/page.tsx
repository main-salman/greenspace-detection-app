'use client';

import { useState, useEffect } from 'react';
import { City, ProcessingConfig, ProcessingStatus } from '@/types';
import CitySelector from '@/components/CitySelector';
import ConfigurationPanel from '@/components/ConfigurationPanel';
import ProcessingPanel from '@/components/ProcessingPanel';
import ResultsPanel from '@/components/ResultsPanel';


export default function Home() {

  const [cities, setCities] = useState<City[]>([]);
  const [selectedCity, setSelectedCity] = useState<City | null>(null);
  const [selectedCities, setSelectedCities] = useState<City[]>([]);
  const [config, setConfig] = useState<Partial<ProcessingConfig>>({
    annualMode: true,
    baselineYear: 2020,
    compareYear: new Date().getFullYear(),
    ndviThreshold: 0.3,
    cloudCoverageThreshold: 20,
    enableVegetationIndices: false,
    enableAdvancedCloudDetection: false,
  });
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  // Load cities from root cities.json via API to avoid path confusion
  useEffect(() => {
    fetch('/api/cities')
      .then(response => response.json())
      .then(data => setCities(data))
      .catch(error => console.error('Error loading cities:', error));
  }, []);

  // Cleanup old output directories on app startup
  useEffect(() => {
    const cleanupOldOutputs = async () => {
      try {
        const response = await fetch('/api/cleanup?maxAgeHours=0', { method: 'POST' });
        const result = await response.json();
        if (result.success) {
          console.log(`Cleanup completed: ${result.message}`);
          if (result.errors.length > 0) {
            console.warn('Cleanup errors:', result.errors);
          }
        } else {
          console.error('Cleanup failed:', result.error);
        }
      } catch (error) {
        console.error('Failed to trigger cleanup:', error);
      }
    };

    cleanupOldOutputs();
  }, []); // Run once on component mount

  // Update config when city is selected
  useEffect(() => {
    if (selectedCity) {
      setConfig(prev => ({ ...prev, city: selectedCity }));
    }
  }, [selectedCity]);

  const handleStartProcessing = async () => {
    if (!selectedCity && selectedCities.length === 0) {
      alert('Please select at least one city');
      return;
    }

    const fullConfig: ProcessingConfig = {
      city: selectedCity || undefined,
      cities: selectedCities.length ? selectedCities : undefined,
      // legacy fields retained but unused in annual mode
      startMonth: config.startMonth,
      startYear: config.startYear,
      endMonth: config.endMonth,
      endYear: config.endYear,
      ndviThreshold: config.ndviThreshold || 0.3,
      cloudCoverageThreshold: config.cloudCoverageThreshold || 20,
      enableVegetationIndices: config.enableVegetationIndices || false,
      enableAdvancedCloudDetection: config.enableAdvancedCloudDetection || false,
      annualMode: config.annualMode ?? true,
      baselineYear: config.baselineYear ?? 2020,
      compareYear: config.compareYear ?? new Date().getFullYear(),
    };

    try {
      // Use current window location to avoid port conflicts
      const baseUrl = window.location.origin;
      const response = await fetch(`${baseUrl}/api/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(fullConfig),
      });

      if (!response.ok) {
        throw new Error('Failed to start processing');
      }

      const result = await response.json();
      
      // Start polling for status updates
      setIsPolling(true);
      pollProcessingStatus(result.processingId);
    } catch (error) {
      console.error('Error starting processing:', error);
      alert('Failed to start processing. Please try again.');
    }
  };

  const pollProcessingStatus = async (processingId: string) => {
    const baseUrl = window.location.origin;
    // Immediately fetch once so UI shows first status
    try {
      const first = await fetch(`${baseUrl}/api/status/${processingId}`, { cache: 'no-store' });
      if (first.ok) {
        const st = await first.json();
        setProcessingStatus(st);
      }
    } catch {}

    // Prefer SSE stream; fallback if no messages within 3s or on error
    try {
      const es = new EventSource(`${baseUrl}/api/status/stream/${processingId}`);
      let gotMessage = false;
      const fallback = () => {
        if (gotMessage) return;
        try { es.close(); } catch {}
        const poll = async () => {
          try {
            const resp = await fetch(`${baseUrl}/api/status/${processingId}`, { cache: 'no-store' });
            if (!resp.ok) return;
            const status: ProcessingStatus = await resp.json();
            setProcessingStatus(status);
            if (status.status !== 'completed' && status.status !== 'failed') {
              setTimeout(poll, 2000);
            } else {
              setIsPolling(false);
            }
          } catch (e) {
            console.error('Error polling status:', e);
            setIsPolling(false);
          }
        };
        poll();
      };

      const timeout = setTimeout(fallback, 3000);
      es.onmessage = (e) => {
        gotMessage = true;
        clearTimeout(timeout);
        try {
          const status: any = JSON.parse(e.data);
          setProcessingStatus(status);
          if (status.status === 'completed' || status.status === 'failed') {
            es.close();
            setIsPolling(false);
          }
        } catch (err) {
          console.warn('Bad SSE payload', err);
        }
      };
      es.onerror = () => fallback();
    } catch (e) {
      console.warn('SSE unavailable, using polling');
    }
  };

  const isProcessing = processingStatus?.status && 
    ['pending', 'downloading', 'preprocessing', 'processing'].includes(processingStatus.status);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            🌍 Greenspace Detection Platform
          </h1>
          <p className="text-lg text-gray-600">
            Analyze satellite imagery to detect and visualize vegetation in cities worldwide
          </p>
        </div>

        {/* Main Content */}
        <div className="max-w-none mx-auto px-4">
          <div className="space-y-8">
            <div className="space-y-8">
              {/* City Selection & Configuration */}
              <div className="space-y-6">
                <CitySelector
                  cities={cities}
                  selectedCity={selectedCity}
                  onCitySelect={setSelectedCity}
                  multiSelect={true}
                  selectedCities={selectedCities}
                  onCitiesChange={setSelectedCities}
                />
                
                <ConfigurationPanel
                  selectedCity={selectedCity}
                  selectedCities={selectedCities}
                  config={config}
                  onConfigChange={setConfig}
                  onStartProcessing={handleStartProcessing}
                  isProcessing={!!isProcessing}
                />
              </div>

              {/* Processing Status & Results */}
              <div className="space-y-6">
                {processingStatus && (
                  <ProcessingPanel status={processingStatus} />
                )}
                
                {processingStatus?.status === 'completed' && (
                  <ResultsPanel status={processingStatus as any} selectedCity={selectedCity} />
                )}
                
                {!processingStatus && (
                  <div className="bg-white rounded-lg shadow-md p-8 text-center">
                    <div className="text-gray-400 mb-4">
                      <svg className="mx-auto h-24 w-24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 002 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-medium text-gray-500 mb-2">
                      Ready to Process
                    </h3>
                    <p className="text-gray-400">
                      Select a city and configure your settings to begin satellite image analysis
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-12 text-center text-gray-500 text-sm">
          <p>
            Powered by Sentinel satellite imagery and NDVI analysis. Processing uses polygon boundaries for accurate city-specific vegetation detection with precise geographic alignment.
          </p>
        </div>
      </div>
    </div>
  );
}