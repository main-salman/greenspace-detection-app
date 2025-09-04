export interface City {
  city_id: string;
  country: string;
  state_province: string;
  city: string;
  latitude: string;
  longitude: string;
  notification_email: string;
  polygon_geojson: {
    type: string;
    properties: object;
    geometry: {
      type: string;
      coordinates: number[][][];
    };
  };
  // Add optional state field for better compatibility
  state?: string;
}

export interface ProcessingConfig {
  city?: City; // legacy single-city
  cities?: City[]; // new multi-city
  // Legacy fields (kept for compatibility)
  startMonth?: string;
  startYear?: number;
  endMonth?: string;
  endYear?: number;
  ndviThreshold: number;
  cloudCoverageThreshold: number;
  enableVegetationIndices: boolean;
  enableAdvancedCloudDetection: boolean;
  // New annual comparison mode
  annualMode?: boolean;
  baselineYear?: number; // default 2020
  compareYear?: number;  // user-selected
}

export interface GeographicBounds {
  north: number;
  south: number;
  east: number;
  west: number;
  transform?: any;
  crs?: any;
  original_shape?: [number, number];
  processed_shape?: [number, number];
}

export interface ProcessingConfigSummary {
  ndvi_threshold: number;
  cloud_threshold: number;
  highlight_alpha: number;
  date_range: string;
}

export interface CityInfo {
  name: string;
  center_lat: number;
  center_lon: number;
}

export interface VegetationSummary {
  vegetation_percentage: number;
  high_density_percentage: number;
  medium_density_percentage: number;
  low_density_percentage: number;
  total_pixels: number;
  vegetation_pixels: number;
  images_processed: number;
  images_found: number;
  ndvi_threshold: number;
  geographic_bounds?: GeographicBounds;
  city_info?: CityInfo;
  processing_config?: ProcessingConfigSummary;
  baseline_vegetation_2020?: number | null;
  percent_change_vs_2020?: number | null;
  output_files: string[];
}

export interface AnnualComparison {
  baselineYear: number;
  baselineVegetation: number;
  compareYear: number;
  compareVegetation: number;
  percentChange: number; // positive = gain, negative = loss
}

export interface CityAnnualSummary extends AnnualComparison {
  city: City;
  // Monthly arrays length 12 (may be shorter if failures)
  monthlyNdviMeanBaseline?: number[];
  monthlyNdviMeanCompare?: number[];
  monthlyVegBaseline?: number[];
  monthlyVegCompare?: number[];
  // Monthly vegetation hectares (derived from vegetation pixel count)
  monthlyHectaresBaseline?: number[];
  monthlyHectaresCompare?: number[];
  // Annual density shares (averaged across months)
  highPct?: number;
  medPct?: number;
  lowPct?: number;
  // Cloud coverage excluded (averaged across months)
  cloudExcludedPct?: number;
  vegetationPct?: number; // compare year vegetation
}

export interface ProcessingStatus {
  id: string;
  status: 'pending' | 'downloading' | 'preprocessing' | 'processing' | 'completed' | 'failed';
  progress: number;
  message: string;
  // Store as string | number | Date because when persisted and reloaded
  // via file-backed status in the packaged app, these may be ISO strings.
  startTime: Date | string | number;
  endTime?: Date | string | number;
  result?: {
    downloadedImages: number;
    processedComposites: number;
    vegetationPercentage: number;
    highDensityPercentage: number;
    mediumDensityPercentage: number;
    lowDensityPercentage: number;
    ndviThreshold?: number;
    outputFiles: string[];
    summary?: VegetationSummary; // Enhanced summary data (single run)
    annualComparison?: AnnualComparison; // Annual comparison summary when annualMode
    changeVisualization?: any; // Change visualization data
    previews?: { label: string; image: string; month: number; year: number; type: 'baseline' | 'compare'; veg?: number; cloud?: number; highPct?: number; medPct?: number; lowPct?: number; cityName?: string }[]; // monthly previews
    batchSummaries?: CityAnnualSummary[]; // multi-city summaries
  };
}

export interface SatelliteData {
  sentinel1Items: number;
  sentinel2Items: number;
  totalDownloaded: number;
}

export interface VegetationResult {
  ndviRange: [number, number];
  vegetationPixels: number;
  totalPixels: number;
  vegetationPercentage: number;
  highDensityPercentage: number;  // NDVI > 0.7 (enhanced thresholds)
  mediumDensityPercentage: number; // NDVI 0.5-0.7
  lowDensityPercentage: number;    // NDVI threshold-0.5
  ndviThreshold: number;
  outputPath: string;
}

// Legacy interface for backwards compatibility
export interface ProcessingResult {
  downloadedImages: number;
  processedComposites: number;
  vegetationPercentage: number;
  highDensityPercentage: number;
  mediumDensityPercentage: number;
  lowDensityPercentage: number;
  outputFiles: string[];
  summary?: VegetationSummary; // Add satellite bounds data
  changeVisualization?: any; // Change visualization data
  annualComparison?: any; // Annual comparison data
  previews?: any[]; // Preview data
  batchSummaries?: any[]; // Batch processing summaries
} 