import fs, { createWriteStream } from "fs";
import csv from "csv-parser";
import path from "path";
import { fileURLToPath } from 'url';
import pLimit from 'p-limit';
import { scrapeWithCheerio, extractSocials, extractPhones } from "./parser.js";
import { performDataAnalysis, logProgress } from "./analysis.js";
import { scrapeWithPlaywright } from "./playwright.js";
import * as cheerio from 'cheerio';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
    // Launch browser ONCE for the entire app
    const browser = await chromium.launch({ headless: true });
    
    const websites = [];
    const filePath = path.join(__dirname, "../data/sample-websites.csv");

    // Read CSV
    const readCsv = () => new Promise(res => {
        fs.createReadStream(filePath).pipe(csv()).on('data', r => websites.push(r.domain)).on('end', res);
    });
    await readCsv();

    const successStream = createWriteStream("../data/return-data.jsonl", { flags: 'a' });
    const errorStream = createWriteStream("../data/failed-crawls.jsonl", { flags: 'a' });

    let completedCount = 0;
    const limit = pLimit(15); // Process 5 sites at a time

    const tasks = websites.map(url => limit(async () => {
        
        let result;
        try {
            // STEP 1: Fast Cheerio check
            result = await scrapeWithCheerio(url);

            // STEP 2: Fallback if Cheerio fails or finds no contact info
            if (!result.success || result.phones.length === 0) {
                const browserRes = await scrapeWithPlaywright(url, browser);
                if (browserRes.success) {
                    const $ = cheerio.load(browserRes.html);
                    result = {
                        url: browserRes.finalUrl || url,
                        phones: extractPhones(browserRes.text, $),
                        socials: extractSocials($),
                        success: true,
                        method: 'Playwright'
                    };
                }
            }

            if (result.success) successStream.write(JSON.stringify(result) + "\n");
            else errorStream.write(JSON.stringify(result) + "\n");

        } catch (error) {
            result = { url, success: false, error: error.message };
            errorStream.write(JSON.stringify(result) + "\n");
        } finally {
            completedCount++;
            logProgress(completedCount, websites.length);
        }
        return result;
    }));

    const finalResults = await Promise.all(tasks);
    
    successStream.end();
    errorStream.end();
    await browser.close();
    
    performDataAnalysis(finalResults.filter(r => r !== undefined));
    console.log("Job Finished.");
}

main().catch(console.error);