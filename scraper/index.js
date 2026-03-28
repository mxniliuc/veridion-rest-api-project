import fs from "fs";
import csv from "csv-parser";
import path from "path";
import { fileURLToPath } from 'url';
import pLimit from 'p-limit';
import { scrapeWithCheerio, extractSocials, extractAddress, extractPhones } from "./parser.js";
import {performDataAnalysis} from "./analysis.js";
import fsp from "fs/promises"; 
import { scrapeWithPlaywright } from "./playwright.js";
import * as cheerio from 'cheerio';

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
    const tasks = websites.map(url => limit(async () => {
    let result = await scrapeWithCheerio(url);

    if (!result.success && (result.failureType === 'Timeout' || result.failureType === 'Unknown')) {

        try{

        const fallbackResult = await scrapeWithPlaywright(url);
        
        if (fallbackResult && fallbackResult.success) {

            const $ = cheerio.load(fallbackResult.html);

            await fsp.appendFile("../data/cheerio-results", `${url} + Playwright`, 'utf-8');
            
            result = {
                url,
                phones: extractPhones(fallbackResult.text, $),
                socials: extractSocials($), 
                address: extractAddress($), 
                success: true
            };
        } } catch(error){
            result = {
                url,
                phones: extractPhones(fallbackResult.text, $),
                socials: extractSocials($), 
                address: extractAddress($), 
                success: false,
                code: error.message
            }
        }
    }

    return result;
}));
    const results = await Promise.all(tasks);
    fsp.writeFile("../data/return-data", JSON.stringify(results, null, 2), 'utf-8');
    const failedResults = results.filter(r => !r.success);
    fsp.writeFile("../data/failed-crawls", JSON.stringify(failedResults, null, 2), 'utf8');
    const stats = performDataAnalysis(results);
} catch (error) {
    console.error("Error reading CSV:", error);
}
