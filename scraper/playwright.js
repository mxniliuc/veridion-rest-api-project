import { chromium } from 'playwright';
import fs from "fs/promises";

export async function scrapeWithPlaywright(url) {
    const browser = await chromium.launch({ 
        headless: true,
        args: ['--disable-dev-shm-usage', '--no-sandbox', '--disable-http2'] 
    });

    try {
        const context = await browser.newContext({ ignoreHTTPSErrors: true });
        const page = await context.newPage();
        const rawDomain = url.replace(/^(?:https?:\/\/)?(?:www\.)?/i, "");
        const targets = [
            `https://www.${rawDomain}`,
            `http://www.${rawDomain}`,
            `https://${rawDomain}`,
            `http://${rawDomain}`
        ];

        let combinedHTML = "";
        let combinedText = "";

        for (const target of targets) {
            try {
                const response = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 15000 });
                if (response.status() === 403) continue;

                await page.waitForTimeout(2000); // Wait for JS to render contact info
                
                const mainPageData = await page.evaluate( async () => {

                    const links = Array.from(document.querySelectorAll('a'))
                        .map(a => ({ text: a.innerText.toLowerCase(), href: a.href }))
                        .filter(l => l.href.includes(window.location.hostname));

                    // Find the best internal link candidate
                    const deepLink = links.find(l => 
                        l.text.includes('contact') || 
                        l.text.includes('about') || 
                        l.href.includes('contact') || 
                        l.href.includes('about')
                    );

                    return {
                        html: document.documentElement.outerHTML,
                        text: document.body.innerText,
                        deepLink: deepLink ? deepLink.href : null
                    };
                });


                combinedHTML += mainPageData.html;
                combinedText += mainPageData.text;

                // DEEP SCAN: If we found a Contact/About link, visit it immediately
                if (mainPageData.deepLink) {
                    console.log(`  -> Deep scanning: ${mainPageData.deepLink}`);
                    try {
                        await page.goto(mainPageData.deepLink, { waitUntil: 'domcontentloaded', timeout: 10000 });
                        await page.waitForTimeout(1500);
                        const deepPageHTML = await page.content();
                        const deepPageText = await page.evaluate(() => document.body.innerText);
                        
                        combinedHTML += "\n\n" + deepPageHTML;
                        combinedText += "\n --- DEEP PAGE TEXT --- \n" + deepPageText;
                    } catch (e) {
                        console.log(`  - Deep scan failed for ${mainPageData.deepLink}`);
                    }
                }
                break; 
            } catch (e) { continue; }
        }
        await browser.close();
        
        if (!combinedHTML) throw new Error("Unreachable");

        return { 
            success: true, 
            html: combinedHTML, 
            text: combinedText 
        };

    } catch (error) {
        await browser.close();
        return { success: false, error: error.message };
    }
}