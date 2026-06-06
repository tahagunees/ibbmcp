import { fetchXlsxRows } from './ckan';

export interface AirQualityMeasurement {
  Tarih: string | number;
  Istasyon: string;
  [key: string]: string | number;
}

const AIR_QUALITY_XLSX_URL = 'https://data.ibb.gov.tr/dataset/86016e78-0cf7-497b-b5b6-76495cb2e26d/resource/463d1264-b61d-44a3-aa9b-5deac4e9ba74/download/hourly-air-quality-data-by-station-in-istanbul.xlsx';

export async function fetchAirQualityData(): Promise<AirQualityMeasurement[]> {
  try {
    const rows = await fetchXlsxRows(AIR_QUALITY_XLSX_URL);
    return rows as AirQualityMeasurement[];
  } catch (error) {
    throw new Error(`Failed to fetch air quality data: ${(error as Error).message}`);
  }
}

export async function getAirQualityForStation(stationName: string): Promise<AirQualityMeasurement[]> {
  const data = await fetchAirQualityData();
  if (data.length === 0) {
    throw new Error("No air quality data found.");
  }
  
  // Try to find the station (case-insensitive)
  const normalizedStationName = stationName.toLowerCase();
  const stationData = data.filter(row => 
    String(row.Istasyon || '').toLowerCase().includes(normalizedStationName) ||
    String(row.Station || '').toLowerCase().includes(normalizedStationName)
  );

  return stationData;
}
