import { fetchXlsxRows } from './ckan';

export interface DamOccupancyRate {
  Tarih: string | number;
  [key: string]: string | number; // For various dam names and their percentages
}

const DAMS_XLSX_URL = 'https://data.ibb.gov.tr/dataset/86658ecd-f3f7-4ca4-a313-ae6204f21959/resource/af0b3902-cfd9-4096-85f7-e2c3017e4f21/download/istanbul-dams-daily-occupancy-rates.xlsx';

export async function fetchDamOccupancyRates(): Promise<DamOccupancyRate[]> {
  try {
    const rows = await fetchXlsxRows(DAMS_XLSX_URL);
    return rows as DamOccupancyRate[];
  } catch (error) {
    throw new Error(`Failed to fetch dam occupancy rates: ${(error as Error).message}`);
  }
}

export async function getLatestDamOccupancy(): Promise<DamOccupancyRate> {
  const rates = await fetchDamOccupancyRates();
  if (rates.length === 0) {
    throw new Error("No dam occupancy data found.");
  }
  const latest = rates[rates.length - 1];
  if (!latest) {
    throw new Error("No latest dam occupancy data found.");
  }
  return latest;
}
