
import { chromium } from 'playwright';

export async function scrapeWithPlaywright(url) {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();
    
    const targetUrl = url.startsWith('http') ? url : `https://${url}`;

    try {
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForSelector('body');

        const data = await page.evaluate(() => {
            const bodyText = document.body.innerText;
            const links = Array.from(document.querySelectorAll('a')).map(a => a.href);
            
            return {
                text: bodyText,
                links: links
            };
        });

        return { success: true, ...data };
    } catch (error) {
        return { success: false, error: error.message };
    } finally {
        await browser.close();
    }
}