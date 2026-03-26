import fs from "fs";
import csv from "csv-parser";
import path from "path";
import { fileURLToPath } from 'url';
import pLimit from 'p-limit';
import { scrapeWithCheerio } from "./parser.js";

const limit = pLimit(50);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runScraper(){
    return new Promise((resolve, reject) => {
        let websites = [];
        const filePath = path.join(__dirname, "../data/sample-websites.csv");

        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (row) => {
                if (row.domain) {
                    websites.push(row.domain);
                }
            })
            .on('end', () => {
                console.log(`Finished loading ${websites.length} sites.`);
                resolve(websites); 
            })
            .on('error', (err) => {
                console.error("Error reading websites file");
                reject(err);
            });
        });
    }

    try {
    const websites = await runScraper();
    const tasks = websites.map(url => 
        limit(() => scrapeWithCheerio(url))
    );
    const results = await Promise.all(tasks);
    console.log(results);
} catch (error) {
    console.error("Error reading CSV:", error);
}
