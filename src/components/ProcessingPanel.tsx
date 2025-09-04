'use client';

import { ProcessingStatus } from '@/types';
import { useState } from 'react';
import { safeToFixed, safePercentage, formatTimeAgo } from '../lib/utils';

interface ProcessingPanelProps {
  status: ProcessingStatus;
}

export default function ProcessingPanel({ status }: ProcessingPanelProps) {
  const [compareModal, setCompareModal] = useState<{ month: number; baseline?: string; compare?: string } | null>(null);
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return '⏳';
      case 'downloading': return '📡';
      case 'preprocessing': return '🔧';
      case 'processing': return '🎨';
      case 'completed': return '✅';
      case 'failed': return '❌';
      default: return '⏳';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'downloading': return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'preprocessing': return 'text-purple-600 bg-purple-50 border-purple-200';
      case 'processing': return 'text-indigo-600 bg-indigo-50 border-indigo-200';
      case 'completed': return 'text-green-600 bg-green-50 border-green-200';
      case 'failed': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const elapsedTime = formatTimeAgo(status.startTime);

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">🚀 Processing Status</h2>
      
      {/* Status Header */}
      <div className={`rounded-lg p-4 border-2 mb-6 ${getStatusColor(status.status)}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <span className="text-2xl">{getStatusIcon(status.status)}</span>
            <div>
              <h3 className="font-semibold text-lg capitalize">{status.status}</h3>
              <p className="text-sm">{status.message}</p>
            </div>
          </div>
          <div className="text-right text-sm">
            <p>Started {elapsedTime}</p>
            {status.endTime && (
              <p>Completed {formatTimeAgo(status.endTime)}</p>
            )}
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      {status.status !== 'completed' && status.status !== 'failed' && (
        <div className="mb-6">
          <div className="flex justify-between text-sm text-gray-600 mb-2">
            <span>Progress</span>
            <span>{Math.round(status.progress)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className="bg-green-500 h-3 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${status.progress}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* Processing Steps */}
      <div className="space-y-3">
        <h4 className="font-semibold text-gray-700">Processing Steps:</h4>
        
        <div className="space-y-2">
          <div className={`flex items-center space-x-3 p-2 rounded ${
            ['downloading', 'preprocessing', 'processing', 'completed'].includes(status.status) 
              ? 'bg-green-50 text-green-700' 
              : 'bg-gray-50 text-gray-500'
          }`}>
            <span>{status.status === 'downloading' ? '🔄' : '✅'}</span>
            <span>Downloading satellite images</span>
          </div>
          
          <div className={`flex items-center space-x-3 p-2 rounded ${
            ['preprocessing', 'processing', 'completed'].includes(status.status) 
              ? 'bg-green-50 text-green-700' 
              : 'bg-gray-50 text-gray-500'
          }`}>
            <span>{status.status === 'preprocessing' ? '🔄' : status.status === 'downloading' ? '⏳' : '✅'}</span>
            <span>Cloud removal and image compositing</span>
          </div>
          
          <div className={`flex items-center space-x-3 p-2 rounded ${
            ['processing', 'completed'].includes(status.status) 
              ? 'bg-green-50 text-green-700' 
              : 'bg-gray-50 text-gray-500'
          }`}>
            <span>{status.status === 'processing' ? '🔄' : ['downloading', 'preprocessing'].includes(status.status) ? '⏳' : '✅'}</span>
            <span>NDVI calculation and vegetation highlighting</span>
          </div>
          
          <div className={`flex items-center space-x-3 p-2 rounded ${
            status.status === 'completed' 
              ? 'bg-green-50 text-green-700' 
              : 'bg-gray-50 text-gray-500'
          }`}>
            <span>{status.status === 'completed' ? '✅' : '⏳'}</span>
            <span>Generating final results</span>
          </div>
        </div>
      </div>

      {/* Grouped by City: Month Timeline + Live Previews */}
      {Array.isArray((status as any)?.result?.previews) && (((status as any).result?.previews?.length) || 0) > 0 && (
        <div className="mt-6 space-y-8">
          {(() => {
            const previews = (status as any).result?.previews || [];
            const groups: Record<string, typeof previews> = {};
            for (const p of previews) {
              const cityKey = (p as any).cityName || 'Selected City';
              if (!groups[cityKey]) groups[cityKey] = [] as any;
              groups[cityKey].push(p as any);
            }
            const cityNames = Object.keys(groups).sort();
            return cityNames.map((cityName) => {
              const cityPreviews = groups[cityName];
              return (
                <div key={cityName}>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold text-gray-800">{cityName}</h4>
                    <span className="text-xs text-gray-500">1 thumbnail per month (prefer compare, else baseline)</span>
                  </div>
                  <div className="grid grid-cols-12 gap-1 text-center text-xs mb-3">
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                      const hasBaseline = cityPreviews.some((p) => p.month === m && p.type === 'baseline');
                      const hasCompare = cityPreviews.some((p) => p.month === m && p.type === 'compare');
                      const state = hasBaseline && hasCompare ? 'both' : hasBaseline ? 'baseline' : hasCompare ? 'compare' : 'none';
                      const bg = state === 'both' ? 'bg-green-500' : state === 'baseline' ? 'bg-green-300' : state === 'compare' ? 'bg-blue-300' : 'bg-gray-200';
                      return (
                        <div key={m} className="flex flex-col items-center">
                          <div className={`w-full h-2 rounded ${bg}`}></div>
                          <div className="mt-1 text-gray-600">{m}</div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                      const pref = cityPreviews.find(p => p.month === m && p.type === 'compare') || cityPreviews.find(p => p.month === m && p.type === 'baseline');
                      if (!pref) {
                        return (
                          <div key={m} className="border border-dashed border-gray-200 rounded bg-white h-32 flex items-center justify-center text-xs text-gray-400">
                            Month {m}
                          </div>
                        );
                      }
                      const baseline = cityPreviews.find(x => x.month===m && x.type==='baseline')?.image;
                      const compare = cityPreviews.find(x => x.month===m && x.type==='compare')?.image;
                      return (
                        <div key={m} className="border border-gray-200 rounded overflow-hidden bg-gray-50 cursor-pointer" onClick={() => setCompareModal({ month: m, baseline, compare })}>
                          <div className="text-xs text-gray-600 px-2 py-1 border-b flex justify-between"><span>{pref.label}</span><span className={pref.type==='baseline'?'text-green-700':'text-blue-700'}>{pref.type}</span></div>
                          <img
                            src={`/api/preview?file=${encodeURIComponent(pref.image)}`}
                            alt={pref.label}
                            className="w-full h-28 object-cover"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            });
          })()}
        </div>
      )}

      {/* Running annual average */}
      {Array.isArray((status as any)?.result?.previews) && (((status as any).result?.previews?.length) || 0) > 0 && (
        <div className="mt-6">
          <h4 className="font-semibold text-gray-700 mb-2">Running Annual Average</h4>
          {(() => {
            const previews = (status as any).result?.previews || [];
            const byType = (t: 'baseline'|'compare') => Array.from(new Set(previews.filter(p=>p.type===t).map(p=>p.month)))
              .map(m => previews.find(p=>p.type===t && p.month===m))
              .filter(Boolean) as any[];
            const baseVals = byType('baseline').map(p => (p as any).veg || 0);
            const compVals = byType('compare').map(p => (p as any).veg || 0);
            const avg = (arr: number[]) => arr.length ? (arr.reduce((a,b)=>a+b,0)/arr.length) : 0;
            const baseAvg = avg(baseVals);
            const compAvg = avg(compVals);
            const delta = baseAvg !== 0 ? ((compAvg-baseAvg)/baseAvg)*100 : 0;
            return (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gray-50 p-4 rounded text-center">
                  <div className="text-sm text-gray-600">Baseline avg (so far)</div>
                  <div className="text-2xl font-bold text-gray-800">{safePercentage(baseAvg, 1)}</div>
                </div>
                <div className="text-center flex flex-col justify-center">
                  <div className="text-sm text-gray-600">Change (so far)</div>
                                      <div className={`text-2xl font-bold ${delta>=0?'text-green-600':'text-red-600'}`}>{delta>=0?'▲':'▼'} {safePercentage(delta, 1)}</div>
                </div>
                <div className="bg-gray-50 p-4 rounded text-center">
                  <div className="text-sm text-gray-600">Compare avg (so far)</div>
                  <div className="text-2xl font-bold text-gray-800">{safePercentage(compAvg, 1)}</div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Compare Modal */}
      {compareModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full">
            <div className="flex items-center justify-between p-4 border-b">
              <h4 className="font-semibold">Month {compareModal.month} — Baseline vs Compare</h4>
              <button className="text-gray-500 hover:text-gray-700" onClick={() => setCompareModal(null)}>✕</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
              <div className="border-r">
                <div className="text-xs text-gray-600 px-3 py-1 bg-gray-50">Baseline</div>
                {compareModal.baseline ? (
                  <img src={`/api/preview?file=${encodeURIComponent(compareModal.baseline)}`} alt="baseline" className="w-full object-contain" />
                ) : (
                  <div className="p-6 text-sm text-gray-400">No baseline image available for this month.</div>
                )}
              </div>
              <div>
                <div className="text-xs text-gray-600 px-3 py-1 bg-gray-50">Compare</div>
                {compareModal.compare ? (
                  <img src={`/api/preview?file=${encodeURIComponent(compareModal.compare)}`} alt="compare" className="w-full object-contain" />
                ) : (
                  <div className="p-6 text-sm text-gray-400">No compare image available for this month.</div>
                )}
              </div>
            </div>
            <div className="p-4 border-t text-right">
              <button className="px-3 py-1 bg-blue-600 text-white rounded" onClick={() => setCompareModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Results Preview */}
      {status.result && (
        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <h4 className="font-semibold text-gray-700 mb-3">Results Preview:</h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Downloaded Images:</span>
              <span className="font-medium ml-2">{status.result.downloadedImages}</span>
            </div>
            <div>
              <span className="text-gray-600">Processed Composites:</span>
              <span className="font-medium ml-2">{status.result.processedComposites}</span>
            </div>
            <div className="col-span-2">
              <span className="text-gray-600">Vegetation Coverage:</span>
              <span className="font-medium ml-2 text-green-600">
                {safePercentage(status.result?.vegetationPercentage, 1)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Error Display */}
      {status.status === 'failed' && (
        <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <h4 className="font-semibold text-red-700 mb-2">Processing Failed</h4>
          <p className="text-red-600 text-sm">{status.message}</p>
        </div>
      )}
    </div>
  );
} 