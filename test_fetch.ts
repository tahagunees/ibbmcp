import axios from 'axios';
import { fetchXlsxRows } from './src/adapters/ckan';

async function testAll() {
  console.log("--- BARAJ ---");
  try {
    const rows = await fetchXlsxRows('https://data.ibb.gov.tr/dataset/86658ecd-f3f7-4ca4-a313-ae6204f21959/resource/af0b3902-cfd9-4096-85f7-e2c3017e4f21/download/istanbul-dams-daily-occupancy-rates.xlsx');
    console.log("Baraj headers:", Object.keys(rows[0] || {}));
    console.log("First row:", rows[0]);
  } catch(e) { console.error((e as Error).message); }

  console.log("\n--- ISBIKE ---");
  try {
    const isbike = await axios.get('https://api.ibb.gov.tr/ispark-bike/GetAllStationStatus');
    console.log("ISBIKE Keys:", Object.keys(isbike.data));
    console.log("ISBIKE sample:", isbike.data.dataList ? isbike.data.dataList[0] : isbike.data);
  } catch(e) { console.error("ISBIKE error:", (e as Error).message); }

  console.log("\n--- HAL FIYATLARI ---");
  try {
    const swagger = await axios.get('https://halfiyatlaripublicdata.ibb.gov.tr/swagger/v1/swagger.json');
    console.log("HAL Endpoints:", Object.keys(swagger.data.paths));
  } catch(e) { console.error("HAL error:", (e as Error).message); }
}

testAll().catch(console.error);
