import { searchDatasets } from './src/adapters/ckan';

async function main() {
  const queries = ['eczane', 'baraj doluluk', 'hal fiyat', 'isbike', 'hava kalite'];
  for (const q of queries) {
    const res = await searchDatasets(q, 1);
    if (res.results && res.results.length > 0) {
      const first = res.results[0];
      if (first) {
        console.log(`Query: ${q} => Name: ${first.name}`);
      }
    } else {
      console.log(`Query: ${q} => NOT FOUND`);
    }
  }
}

main().catch(console.error);
