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
            `https://${rawDomain}`,      // Try Naked HTTPS first for these subdomains
            `https://www.${rawDomain}`,  // Then WWW HTTPS
            `http://${rawDomain}`,       // Then Naked HTTP
            `http://www.${rawDomain}`    // Then WWW HTTP
        ];

        let combinedHTML = "";
        let combinedText = "";

        for (const target of targets) {
            try {
                const response = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 15000 });
                if (response.status() === 403) continue;

                await page.waitForTimeout(2000); // Wait for JS to render contact info

                const pageTitle = await page.title();
                const bodyText = await page.evaluate(() => document.body.innerText);
const isJunk = bodyText.length < 250 || pageTitle.toLowerCase().includes("welcome to nginx");
                
                if (!response || response.status() >= 400 || isJunk) continue;

                await page.waitForTimeout(1500);
                
                const mainPageData = await page.evaluate(() => {
                    const currentUrl = window.location.href.split(/[?#]/)[0].replace(/\/$/, "");
                    const isHome = window.location.pathname === "/" || window.location.pathname === "";

                    const links = Array.from(document.querySelectorAll('a'))
                        .map(a => ({ text: a.innerText.toLowerCase(), href: a.href.split(/[?#]/)[0].replace(/\/$/, "") }))
                        // FIX: Filter out non-http links (mailto, tel, etc)
                        .filter(l => l.href.startsWith('http') && l.href.includes(window.location.hostname) && l.href !== currentUrl);

                    const found = isHome ? links.find(l => /(contact|about)/.test(l.text) || /(contact|about)/.test(l.href)) : null;
                    
                    return {
                        html: document.documentElement.outerHTML,
                        text: document.body.innerText,
                        deepLink: found ? found.href : null
                    };
                });

                combinedHTML += mainPageData.html;
                combinedText += mainPageData.text;

                if (mainPageData.deepLink) {
                    try {
                        console.log(`Deep scanning for ${mainPageData.deepLink}`)
                        await page.goto(mainPageData.deepLink, { waitUntil: 'networkidle', timeout: 8000 });
                        console.log("go to works");
                        await page.waitForTimeout(1000);
                        console.log("timeout works");
                        combinedHTML += "\n\n" + await page.content();
                        combinedText += "\n --- DEEP PAGE --- \n" + await page.evaluate(() => document.body.innerText);
                        console.log("combined text works");
                    } catch (e) { /* ignore subpage fail */ console.log(`  ! Deep scan timeout for ${mainPageData.deepLink} - pulling partial data.`); combinedHTML += await page.content();
        combinedText += await page.evaluate(() => document.body.innerText);}
                }
                break; // Exit loop on first valid target
            } catch (e) { continue; }
        }
        await browser.close();
        
        if (!combinedHTML) throw new Error("Unreachable or Default Server Page");
        return { success: true, html: combinedHTML, text: combinedText };
    } catch (error) {
        await browser.close();
        return { success: false, error: error.message };
    }
}