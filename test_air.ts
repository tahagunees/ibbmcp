import { ckanClient } from './src/adapters/ckan';

async function main() {
    try {
        const pkgRes = await ckanClient.get('/package_search', { params: { q: 'hava kalite', rows: 2 } });
        if (pkgRes.data.result && pkgRes.data.result.results.length > 0) {
            for (const dataset of pkgRes.data.result.results) {
                if (dataset.resources) {
                    for (const r of dataset.resources) {
                        if (r.datastore_active) {
                            console.log(`Resource ${r.name} has datastore. ID: ${r.id}`);
                            const dataRes = await ckanClient.get('/datastore_search', { params: { resource_id: r.id, limit: 1 } });
                            console.log("Data keys:", Object.keys(dataRes.data.result.records[0] || {}));
                        }
                    }
                }
            }
        }
    } catch (e) {
        console.error(e);
    }
}

main().catch(console.error);
