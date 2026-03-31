import { Client } from '@elastic/elasticsearch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const client = new Client({ node: 'http://localhost:9200' });
const INDEX_NAME = 'companies';

async function indexData() {
    const dataPath = path.join(__dirname, '../data/final-enriched-data.json');
    
    if (!fs.existsSync(dataPath)) {
        console.error("❌ Merged data file not found! Run merger.js first.");
        return;
    }

    const dataset = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

    console.log("Connecting to Elasticsearch...");

    if (await client.indices.exists({ index: INDEX_NAME })) {
        await client.indices.delete({ index: INDEX_NAME });
    }

    await client.indices.create({
        index: INDEX_NAME,
        body: {
            mappings: {
                properties: {
                    company_name: { type: 'text' },
                    all_names: { type: 'text' },
                    domain: { type: 'keyword' },
                    phones: { type: 'keyword' },
                    "socials.facebook": { type: 'keyword' },
                    scrape_status: { type: 'keyword' }
                }
            }
        }
    });

    console.log(`Indexing ${dataset.length} documents...`);

    const operations = dataset.flatMap(doc => [{ index: { _index: INDEX_NAME } }, doc]);

    const bulkResponse = await client.bulk({ refresh: true, operations });

    if (bulkResponse.errors) {
        console.error("❌ Errors occurred during indexing");
    } else {
        console.log(`🚀 Success! Indexed ${dataset.length} companies.`);
        console.log(`🔗 Verify at: http://localhost:9200/${INDEX_NAME}/_search`);
    }
}

indexData().catch(console.error);