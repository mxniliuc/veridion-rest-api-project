import { chromium } from 'playwright';
import fs from "fs/promises";

export async function scrapeWithPlaywright(url) {
    const browser = await chromium.launch({ 
        headless: true,
        args: [
            '--disable-dev-shm-usage', 
            '--no-sandbox',
            '--disable-http2' 
        ] 
    });

    try {
        const context = await browser.newContext({ ignoreHTTPSErrors: true });
        const page = await context.newPage();
        const rawDomain = url.replace(/^(?:https?:\/\/)?(?:www\.)?/i, "");
        
        const targets = [
            `https://www.${rawDomain}`,
            `https://${rawDomain}`,
            `http://www.${rawDomain}`
        ];

        let successData = null;

        for (const target of targets) {
            try {
                await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 15000 });
                
                await page.waitForTimeout(1500); 

                successData = await page.evaluate(() => ({
                    html: document.documentElement.outerHTML,
                    text: document.body.innerText
                }));
                
                if (successData.text.length > 100) break; 
            } catch (e) {
                continue; 
            }
        }

        if (!successData) throw new Error("All URL variations failed");

        return { success: true, ...successData };

    } catch (error) {
        return { success: false, error: error.message };
    } finally {
        await browser.close();
    }
}