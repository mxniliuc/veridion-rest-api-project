import { chromium } from 'playwright';

let browser;

export async function scrapeWithPlaywright(url, existingBrowser = null) {
    // Reuse the browser instance to save 2 seconds per site
    if (!browser && !existingBrowser) {
        browser = await chromium.launch({ 
            headless: true,
            args: ['--disable-dev-shm-usage', '--no-sandbox', '--disable-http2'] 
        });
    }
    
    const activeBrowser = existingBrowser || browser;
    const context = await activeBrowser.newContext({ 
        ignoreHTTPSErrors: true,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    // SPEED: Block images, css, and fonts
    await page.route('**/*', (route) => {
        const type = route.request().resourceType();
        if (['image', 'font', 'stylesheet', 'media'].includes(type)) route.abort();
        else route.continue();
    });

    try {
        const rawDomain = url.replace(/^(?:https?:\/\/)?(?:www\.)?/i, "");
        const targets = [`http://${rawDomain}`, `https://www.${rawDomain}`];

        let combinedHTML = "";
        let combinedText = "";
        let finalUrl = url;

        for (const target of targets) {
            try {
                const response = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 15000 });
                if (!response) continue;

                // Wait for potential dynamic content/Wix hydration
                await page.waitForTimeout(2000);

                // FOOTER FIX: Scroll to bottom to trigger lazy-loaded elements
                await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
                await page.waitForTimeout(1000);

                const pageTitle = await page.title();
                const bodyText = await page.evaluate(() => document.body.innerText);
                const htmlContent = await page.content();

                // JUNK DETECTION
                const JUNK_PATTERNS = /denied|unavailable|forbidden|nginx|8lm mail|access restricted|404|dns|hosting|attention required|403|taken|sorry|problem|critical|cpanel|porkbun|abnormality|suspended|webmaster/i;
                if ((bodyText.length < 100 || JUNK_PATTERNS.test(pageTitle + bodyText)) && !bodyText.toLowerCase().includes("facility")) {
                    console.log(`Skipping ${target}`)
                    continue; 
                }

                combinedHTML += htmlContent;
                combinedText += bodyText;
                finalUrl = page.url();

                // DEEP SCAN DISCOVERY
                const deepLinks = await page.evaluate(() => {
                    const currentHostname = window.location.hostname;
                    return Array.from(document.querySelectorAll('a'))
                        .map(a => a.href)
                        .filter(href => {
                            try {
                                const urlObj = new URL(href);
                                return urlObj.hostname.includes(currentHostname) && 
                                       /(contact|about|info)/i.test(href);
                            } catch (e) { return false; }
                        });
                });

                const uniqueDeepLinks = [...new Set(deepDeepLinks)].slice(0, 2);

                for (const link of uniqueDeepLinks) {
                    try {
                        await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 10000 });
                        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
                        await page.waitForTimeout(1000);
                        combinedHTML += "\n\n" + await page.content();
                        combinedText += "\n --- SUBPAGE --- \n" + await page.evaluate(() => document.body.innerText);
                    } catch (e) { console.log(`  ! Subpage fail: ${link}`); }
                }

                break; // Found a valid version, stop trying targets
            } catch (e) { continue; }
        }

        await context.close();
        return { success: !!combinedHTML, html: combinedHTML, text: combinedText, finalUrl };
    } catch (error) {
        await context.close();
        return { success: false, error: error.message };
    }
}