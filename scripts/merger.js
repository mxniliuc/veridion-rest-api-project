import fs from 'fs';
import csv from 'csv-parser';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SCRAPED_DATA_PATH = path.join(__dirname, '../data/return-data.jsonl');
const FAILED_DATA_PATH = path.join(__dirname, '../data/failed-crawls.jsonl');
const COMPANY_CSV_PATH = path.join(__dirname, '../data/sample-websites-company-names.csv');
const OUTPUT_PATH = path.join(__dirname, '../data/final-enriched-data.json');

function normalizeDomain(url) {
    if (!url) return "";
    return url.replace(/^(?:https?:\/\/)?(?:www\.)?/i, "").replace(/\/$/, "").split('/')[0].toLowerCase();
}

async function mergeData() {
    const companyMap = new Map();
    const finalData = [];

    await new Promise((resolve) => {
        fs.createReadStream(COMPANY_CSV_PATH)
            .pipe(csv())
            .on('data', (row) => {
                companyMap.set(normalizeDomain(row.domain), row);
            })
            .on('end', resolve);
    });

    const processFile = (filePath, isSuccessFile) => {
        if (!fs.existsSync(filePath)) return;
        
        const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(l => l.trim());
        
        for (const line of lines) {
            const entry = JSON.parse(line);
            const domain = normalizeDomain(entry.url);
            const companyInfo = companyMap.get(domain);

            if (companyInfo) {
                finalData.push({
                    domain: domain,
                    company_name: companyInfo.company_commercial_name,
                    legal_name: companyInfo.company_legal_name || null,
                    all_names: companyInfo.company_all_available_names,

                    phones: entry.phones || [],
                    socials: entry.socials || {},
                    address: entry.address || null,

                    scrape_status: isSuccessFile ? "success" : "failed",
                    error_message: entry.error || entry.code || null,
                    method: entry.methodUsed || entry.method || "unknown",
                    timestamp: new Date().toISOString()
                });

                companyMap.delete(domain);
            }
        }
    };


    console.log("Merging successful crawls...");
    processFile(SCRAPED_DATA_PATH, true);
    
    console.log("Merging failed crawls...");
    processFile(FAILED_DATA_PATH, false);


    for (const [domain, info] of companyMap) {
        finalData.push({
            domain,
            company_name: info.company_commercial_name,
            legal_name: info.company_legal_name || null,
            all_names: info.company_all_available_names,
            scrape_status: "not_attempted",
            phones: [],
            socials: {},
            timestamp: new Date().toISOString()
        });
    }

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(finalData, null, 2));
    console.log(`✅ Total records in final dataset: ${finalData.length}`);
}

mergeData().catch(console.error);