'use client';

import { CityAnnualSummary } from '@/types';
import { safeToFixed, safePercentage } from '@/lib/utils';
import dynamic from 'next/dynamic';

// Dynamic import to prevent SSR issues with Leaflet
const ChangeVisualizationMap = dynamic(() => import('./ChangeVisualizationMap'), {
  ssr: false,
  loading: () => (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading change visualization map...</p>
        </div>
      </div>
    </div>
  )
});

interface SummaryPanelProps {
  summaries: CityAnnualSummary[];
  processingId?: string;
}

export default function SummaryPanel({ summaries, processingId }: SummaryPanelProps) {
  if (!Array.isArray(summaries) || (summaries?.length || 0) === 0) return null;

  // Filter for summaries with valid data to prevent toFixed errors
  const validSummaries = summaries.filter(s => 
    s && 
    s.city && 
    s.city.city && 
    s.city.country &&
    typeof s.baselineYear === 'number' &&
    typeof s.compareYear === 'number'
  );

  // If no valid summaries, show a message
  if (validSummaries.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="text-center text-gray-500">
          <p>No valid summary data available for download.</p>
          <p className="text-sm mt-2">Please ensure all required data fields are present.</p>
        </div>
      </div>
    );
  }



    const downloadCSV = () => {
    try {
      const headers = [
        'city','country','baselineYear','compareYear','baselineVegetation','compareVegetation','percentChange','vegetationPct','cloudExcludedPct','highPct','medPct','lowPct'
      ];
      const rows = validSummaries.map(s => [
        s.city.city, s.city.country, s.baselineYear, s.compareYear,
        safeToFixed(s.baselineVegetation, 3), 
        safeToFixed(s.compareVegetation, 3), 
        safeToFixed(s.percentChange, 3),
        safeToFixed(s.vegetationPct, 3), 
        safeToFixed(s.cloudExcludedPct, 3), 
        safeToFixed(s.highPct, 3), 
        safeToFixed(s.medPct, 3), 
        safeToFixed(s.lowPct, 3)
      ].join(','));
      const csv = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'greenspace_summary.csv'; a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error generating CSV:', error);
      alert('Error generating CSV. Please check the console for details.');
    }
  };

  const downloadDetailedCSV = () => {
    try {
      const headers = [
        'city','country','year','month','ndvi_mean','vegetation_pct','vegetation_hectares'
      ];
      const toRows = (s: CityAnnualSummary, label: 'baseline'|'compare') => {
        const ndvi = label==='baseline' ? (s.monthlyNdviMeanBaseline||[]) : (s.monthlyNdviMeanCompare||[]);
        const veg = label==='baseline' ? (s.monthlyVegBaseline||[]) : (s.monthlyVegCompare||[]);
        const hect = label==='baseline' ? (s.monthlyHectaresBaseline||[]) : (s.monthlyHectaresCompare||[]);
        const year = label==='baseline' ? s.baselineYear : s.compareYear;
        return Array.from({length:12}, (_,i)=>i).map(m => [
          s.city.city, s.city.country, year, m+1,
          (ndvi[m] ?? '').toString(),
          (veg[m] ?? '').toString(),
          (hect[m] ?? '').toString()
        ].join(','));
      };
      const rows = validSummaries.flatMap(s => [...toRows(s, 'baseline'), ...toRows(s, 'compare')]);
      const csv = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'greenspace_detailed_monthly.csv'; a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error generating detailed CSV:', error);
      alert('Error generating detailed CSV. Please check the console for details.');
    }
  };

  const Chart = ({ s }: { s: CityAnnualSummary }) => {
    const months = Array.from({length:12}, (_,i)=>i);
    const ndviBase = s.monthlyNdviMeanBaseline || [];
    const ndviComp = s.monthlyNdviMeanCompare || [];
    const maxNdvi = Math.max(0.01, ...ndviBase, ...ndviComp);
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-gray-600">
          <span>Monthly NDVI mean</span>
          <span>{s.baselineYear} vs {s.compareYear}</span>
        </div>
        <div className="grid grid-cols-12 gap-1">
          {months.map(m => (
            <div key={m} className="flex flex-col h-24 justify-end">
              <div title={`Compare ${s.compareYear}-${m+1}: ${ndviComp[m]?.toFixed?.(2) ?? '—'}`}
                className="bg-blue-400 w-full"
                style={{ height: `${Math.max(0, (ndviComp[m]||0) / maxNdvi * 90)}%` }} />
              <div title={`Baseline ${s.baselineYear}-${m+1}: ${ndviBase[m]?.toFixed?.(2) ?? '—'}`}
                className="bg-green-400 w-full mt-0.5"
                style={{ height: `${Math.max(0, (ndviBase[m]||0) / maxNdvi * 90)}%` }} />
            </div>
          ))}
        </div>
        <div className="text-xs text-gray-500">Bars show NDVI mean by month: blue={s.compareYear}, green={s.baselineYear}</div>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 max-w-none w-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800">📈 Multi‑City Annual Summary</h3>
        <div className="flex items-center gap-2">
          <button onClick={downloadCSV} className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">Download CSV</button>
          <button onClick={downloadDetailedCSV} className="px-3 py-1 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700">Download Detailed CSV</button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-gray-600 border-b">
              <th className="py-2 pr-4">City</th>
              <th className="py-2 pr-4">Baseline %</th>
              <th className="py-2 pr-4">Compare %</th>
              <th className="py-2 pr-4">Change</th>
              <th className="py-2 pr-4">High</th>
              <th className="py-2 pr-4">Med</th>
              <th className="py-2 pr-4">Low</th>
              <th className="py-2 pr-4">Cloud Excl. %</th>
            </tr>
          </thead>
          <tbody>
            {validSummaries.map((s, idx) => (
              <tr key={idx} className="border-b hover:bg-gray-50">
                <td className="py-2 pr-4 whitespace-nowrap font-medium text-gray-800">{s.city.city}, {s.city.country}</td>
                <td className="py-2 pr-4">{safeToFixed(s.baselineVegetation, 1)}%</td>
                <td className="py-2 pr-4">{safeToFixed(s.compareVegetation, 1)}%</td>
                <td className={`py-2 pr-4 ${((Number(s.percentChange) || 0) >= 0) ? 'text-green-600' : 'text-red-600'}`}>{safeToFixed(s.percentChange, 1)}%</td>
                <td className="py-2 pr-4">{safeToFixed(s.highPct, 1)}%</td>
                <td className="py-2 pr-4">{safeToFixed(s.medPct, 1)}%</td>
                <td className="py-2 pr-4">{safeToFixed(s.lowPct, 1)}%</td>
                <td className="py-2 pr-4">{safeToFixed(s.cloudExcludedPct, 1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-8">
        {validSummaries.map((s, idx) => (
          <div key={idx} className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold text-gray-800">{s.city.city}, {s.city.country}</div>
              <div className={`${(s.percentChange ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'} text-sm font-semibold`}>
                {(Number(s.percentChange) || 0) >= 0 ? '▲' : '▼'} {safeToFixed(s.percentChange, 1)}%
              </div>
            </div>
            <Chart s={s} />
            
            {/* Change Visualization */}
            {(s as any).changeVisualization && (
              <div className="mt-4 border-t pt-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-2">🔄 Vegetation Change Analysis</h4>
                <div className="grid grid-cols-3 gap-2 text-xs mb-3">
                  <div className="text-center">
                    <div className="flex items-center justify-center mb-1">
                      <div className="w-3 h-3 bg-green-500 rounded mr-1"></div>
                      <span>Gain</span>
                    </div>
                    <div className="font-semibold">{safeToFixed((s as any).changeVisualization.gainPercentage, 1)}%</div>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center mb-1">
                      <div className="w-3 h-3 bg-red-500 rounded mr-1"></div>
                      <span>Loss</span>
                    </div>
                    <div className="font-semibold">{safeToFixed((s as any).changeVisualization.lossPercentage, 1)}%</div>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center mb-1">
                      <div className="w-3 h-3 bg-purple-500 rounded mr-1"></div>
                      <span>Stable</span>
                    </div>
                    <div className="font-semibold">{safeToFixed((s as any).changeVisualization.stablePercentage, 1)}%</div>
                  </div>
                </div>
                
                {/* Interactive Change Visualization Map */}
                <ChangeVisualizationMap 
                  city={s.city}
                  processingId={processingId || ''}
                  changeVisualization={(s as any).changeVisualization}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}


