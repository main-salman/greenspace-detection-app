'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { safeToFixed, safePercentage, safeDecimal } from '@/lib/utils';

interface AlignmentTestResult {
  iteration: number;
  alignment_score: number;
  misalignment_meters: number;
  is_acceptable: boolean;
  screenshot_path: string;
}

interface TestProgress {
  test_id: string;
  message: string;
  progress: number;
  data?: any;
  timestamp: number;
}

interface TestStatus {
  status: 'starting' | 'running' | 'completed' | 'failed';
  city: string;
  province: string;
  country: string;
  tolerance: number;
  start_time: number;
  progress?: TestProgress;
  results?: AlignmentTestResult[];
  error?: string;
}

const AlignmentTester: React.FC = () => {
  const [testStatus, setTestStatus] = useState<TestStatus | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [currentTestId, setCurrentTestId] = useState<string | null>(null);
  const [config, setConfig] = useState({
    city: 'Toronto',
    province: 'Ontario',
    country: 'Canada',
    tolerance: 1.0
  });
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [selectedIteration, setSelectedIteration] = useState<number>(0);
  
  const pollInterval = useRef<NodeJS.Timeout | null>(null);

  // Auto-start alignment test when component mounts
  useEffect(() => {
    // Start the test automatically after a brief delay to allow API to initialize
    const autoStartTimer = setTimeout(() => {
      if (!isRunning && !currentTestId) {
        startAlignmentTest();
      }
    }, 2000);

    return () => clearTimeout(autoStartTimer);
  }, [isRunning, currentTestId]);

  // Poll for test status updates
  useEffect(() => {
    if (currentTestId && isRunning) {
      pollInterval.current = setInterval(async () => {
        try {
          const response = await fetch(`http://localhost:5001/api/alignment/status/${currentTestId}`);
          const data = await response.json();
          
          if (data.success) {
            setTestStatus(data.test);
            
            if (data.test.status === 'completed' || data.test.status === 'failed') {
              setIsRunning(false);
              if (pollInterval.current) {
                clearInterval(pollInterval.current);
              }
              
              // Load screenshots if test completed
              if (data.test.status === 'completed' && Array.isArray(data.test.results)) {
                loadScreenshots(data.test.results.length);
              }
            }
          }
        } catch (error) {
          console.error('Error polling test status:', error);
        }
      }, 2000);
    }

    return () => {
      if (pollInterval.current) {
        clearInterval(pollInterval.current);
      }
    };
  }, [currentTestId, isRunning]);

  const loadScreenshots = async (iterations: number) => {
    const screenshotUrls = [];
    for (let i = 0; i < iterations; i++) {
      screenshotUrls.push(`http://localhost:5001/api/alignment/screenshot/${currentTestId}/${i}`);
    }
    setScreenshots(screenshotUrls);
  };

  const startAlignmentTest = async () => {
    try {
      setIsRunning(true);
      setTestStatus(null);
      setScreenshots([]);
      setSelectedIteration(0);

      const response = await fetch('http://localhost:5001/api/alignment/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      });

      const data = await response.json();
      
      if (data.success) {
        setCurrentTestId(data.test_id);
      } else {
        setIsRunning(false);
        alert('Failed to start test: ' + data.error);
      }
    } catch (error) {
      setIsRunning(false);
      console.error('Error starting test:', error);
      alert('Error starting test: ' + error);
    }
  };

  const stopTest = () => {
    setIsRunning(false);
    setCurrentTestId(null);
    if (pollInterval.current) {
      clearInterval(pollInterval.current);
    }
  };

  const resetTest = () => {
    setTestStatus(null);
    setScreenshots([]);
    setSelectedIteration(0);
    setCurrentTestId(null);
    setIsRunning(false);
  };

  const getStatusIcon = () => {
    if (!testStatus) return null;
    
    switch (testStatus.status) {
      case 'completed':
        const finalResult = (Array.isArray(testStatus.results) && testStatus.results.length > 0)
          ? testStatus.results[testStatus.results.length - 1]
          : undefined;
        return finalResult?.is_acceptable ? 
          <CheckCircle className="w-6 h-6 text-green-500" /> :
          <XCircle className="w-6 h-6 text-red-500" />;
      case 'failed':
        return <XCircle className="w-6 h-6 text-red-500" />;
      case 'running':
      case 'starting':
        return <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />;
      default:
        return <AlertCircle className="w-6 h-6 text-yellow-500" />;
    }
  };

  const getProgressPercent = () => {
    return testStatus?.progress?.progress || 0;
  };

  const getFinalMisalignment = () => {
    if (!testStatus?.results) return null;
    const finalResult = testStatus.results[testStatus.results.length - 1];
    return finalResult?.misalignment_meters;
  };

  return (
    <div className="w-full max-w-6xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          🎯 Satellite-OSM Alignment Tester
        </h2>
        <p className="text-gray-600">
          Automated testing system to achieve perfect (≤1m) alignment between satellite imagery and OpenStreetMap
        </p>
      </div>

      {/* Configuration */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg">
        <h3 className="text-lg font-semibold mb-3">Test Configuration</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
            <input
              type="text"
              value={config.city}
              onChange={(e) => setConfig({ ...config, city: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isRunning}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Province/State</label>
            <input
              type="text"
              value={config.province}
              onChange={(e) => setConfig({ ...config, province: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isRunning}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
            <input
              type="text"
              value={config.country}
              onChange={(e) => setConfig({ ...config, country: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isRunning}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tolerance (meters)</label>
            <input
              type="number"
              step="0.1"
              min="0.1"
              max="10"
              value={config.tolerance}
              onChange={(e) => setConfig({ ...config, tolerance: parseFloat(e.target.value) })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isRunning}
            />
          </div>
        </div>
      </div>

      {/* Control Buttons */}
      <div className="mb-6 flex gap-3">
        <button
          onClick={startAlignmentTest}
          disabled={isRunning}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Play className="w-4 h-4" />
          Start Alignment Test
        </button>
        
        {isRunning && (
          <button
            onClick={stopTest}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
          >
            <Pause className="w-4 h-4" />
            Stop Test
          </button>
        )}
        
        <button
          onClick={resetTest}
          disabled={isRunning}
          className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RotateCcw className="w-4 h-4" />
          Reset
        </button>
      </div>

      {/* Status Display */}
      {testStatus && (
        <div className="mb-6 p-4 bg-blue-50 rounded-lg">
          <div className="flex items-center gap-3 mb-3">
            {getStatusIcon()}
            <h3 className="text-lg font-semibold">
              Test Status: {testStatus.status.charAt(0).toUpperCase() + testStatus.status.slice(1)}
            </h3>
          </div>
          
          {testStatus.progress && (
            <div className="mb-3">
              <div className="flex justify-between text-sm text-gray-600 mb-1">
                <span>{testStatus.progress.message}</span>
                <span>{safePercentage(getProgressPercent(), 1)}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${getProgressPercent()}%` }}
                />
              </div>
            </div>
          )}

          {testStatus.status === 'completed' && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="font-medium">Total Iterations:</span>
                <br />
                {testStatus.results?.length || 0}
              </div>
              <div>
                <span className="font-medium">Final Misalignment:</span>
                <br />
                <span className={getFinalMisalignment()! <= config.tolerance ? 'text-green-600' : 'text-red-600'}>
                  {safeDecimal(getFinalMisalignment(), 3)}m
                </span>
              </div>
              <div>
                <span className="font-medium">Target Tolerance:</span>
                <br />
                ≤{config.tolerance}m
              </div>
              <div>
                <span className="font-medium">Result:</span>
                <br />
                <span className={getFinalMisalignment()! <= config.tolerance ? 'text-green-600' : 'text-red-600'}>
                  {getFinalMisalignment()! <= config.tolerance ? '✅ SUCCESS' : '❌ NEEDS WORK'}
                </span>
              </div>
            </div>
          )}

          {testStatus.error && (
            <div className="mt-3 p-3 bg-red-100 border border-red-300 rounded-md">
              <p className="text-red-700">{testStatus.error}</p>
            </div>
          )}
        </div>
      )}

      {/* Results Table */}
      {testStatus?.results && testStatus.results.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3">Iteration Results</h3>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-300">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-gray-300 px-4 py-2 text-left">Iteration</th>
                  <th className="border border-gray-300 px-4 py-2 text-left">Misalignment (m)</th>
                  <th className="border border-gray-300 px-4 py-2 text-left">Alignment Score</th>
                  <th className="border border-gray-300 px-4 py-2 text-left">Status</th>
                  <th className="border border-gray-300 px-4 py-2 text-left">Screenshot</th>
                </tr>
              </thead>
              <tbody>
                {testStatus.results.map((result) => (
                  <tr key={result.iteration} className="hover:bg-gray-50">
                    <td className="border border-gray-300 px-4 py-2">{result.iteration + 1}</td>
                    <td className="border border-gray-300 px-4 py-2">
                      <span className={result.misalignment_meters <= config.tolerance ? 'text-green-600' : 'text-red-600'}>
                        {safeDecimal(result.misalignment_meters, 3)}
                      </span>
                    </td>
                                          <td className="border border-gray-300 px-4 py-2">{safeDecimal(result.alignment_score, 1)}</td>
                    <td className="border border-gray-300 px-4 py-2">
                      {result.is_acceptable ? (
                        <span className="text-green-600">✅ Acceptable</span>
                      ) : (
                        <span className="text-red-600">❌ Needs correction</span>
                      )}
                    </td>
                    <td className="border border-gray-300 px-4 py-2">
                      <button
                        onClick={() => setSelectedIteration(result.iteration)}
                        className="text-blue-600 hover:text-blue-800 underline"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Screenshot Viewer */}
      {screenshots.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3">
            Screenshot - Iteration {selectedIteration + 1}
          </h3>
          <div className="mb-3">
            <select
              value={selectedIteration}
              onChange={(e) => setSelectedIteration(parseInt(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-md"
            >
              {screenshots.map((_, index) => (
                <option key={index} value={index}>
                  Iteration {index + 1}
                </option>
              ))}
            </select>
          </div>
          <div className="border border-gray-300 rounded-lg overflow-hidden">
            <img
              src={screenshots[selectedIteration]}
              alt={`Alignment test iteration ${selectedIteration + 1}`}
              className="w-full h-auto"
              onError={(e) => {
                e.currentTarget.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkltYWdlIG5vdCBhdmFpbGFibGU8L3RleHQ+PC9zdmc+';
              }}
            />
          </div>
        </div>
      )}

      {/* Help Section */}
      <div className="mt-8 p-4 bg-yellow-50 rounded-lg">
        <h3 className="text-lg font-semibold mb-2">📋 How It Works</h3>
        <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
          <li>Downloads Sentinel-2 satellite imagery with proper coordinate reference system handling</li>
          <li>Reprojects imagery to Web Mercator (OSM standard) coordinate system</li>
          <li>Creates test maps overlaying satellite imagery on OpenStreetMap base</li>
          <li>Takes automated screenshots and analyzes alignment using computer vision</li>
          <li>Iteratively corrects misalignment until target tolerance is achieved</li>
          <li>Validates alignment using roads, intersections, and landmarks as reference points</li>
        </ul>
        <p className="mt-2 text-sm text-gray-600">
          <strong>Goal:</strong> Achieve perfect alignment (≤1m misalignment) between satellite imagery and OSM features.
        </p>
      </div>
    </div>
  );
};

export default AlignmentTester;