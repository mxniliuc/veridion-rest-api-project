import fs from "fs/promises"

export async function scrapeWithPlaywright(url, existingBrowser) {
    const context = await existingBrowser.newContext({ 
        ignoreHTTPSErrors: true,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    });

    // Global interceptor to speed up loading
    await context.route('**/*', (route) => {
        const type = route.request().resourceType();
        if (['image', 'font', 'stylesheet', 'media', 'other'].includes(type)) route.abort();
        else route.continue();
    });

    const page = await context.newPage();
    const rawDomain = url.replace(/^(?:https?:\/\/)?(?:www\.)?/i, "");

    try {
        // 1. RACE protocols
        await Promise.any([
            page.goto(`http://${rawDomain}`, { waitUntil: 'domcontentloaded', timeout: 12000 }),
            page.goto(`https://www.${rawDomain}`, { waitUntil: 'domcontentloaded', timeout: 12000 })
        ]).catch(() => {}); 

        await page.waitForTimeout(1500); // Give JS a moment to render
        
        // 2. STAGE 1 CLEANING: Get raw data for validation
        const bodyText = await page.evaluate(() => document.body.innerText.trim());
        const pageTitle = await page.title();
        const htmlContent = await page.content();

        // 3. ENHANCED JUNK DETECTION
        // Added: \b boundaries for accuracy, and specific tags found in your logs
        const JUNK_PATTERNS = /\bdenied\b|\bunavailable\b|\bforbidden\b|nginx|8lm mail|access restricted|404|dns|hosting|403|suspended|webmaster|search results|did not match any documents|attention required|get this domain|405|not allowed|inconvenience|sorry|not a bot|critical error|not found/i;
        
        // A page is "False" if:
        // - Text is nearly non-existent (Empty shells like harvardpsc.com)
        // - It matches known error strings
        // - It contains H1 headers typical of "Silent 403s"
        const isInternalError = htmlContent.includes("<h1>403 Forbidden</h1>") || htmlContent.includes("<h1>404 Not Found</h1>");
        
        if (bodyText.length < 50 || JUNK_PATTERNS.test(pageTitle + bodyText) || isInternalError) {
            console.log(`Skipped ${url}`)
            await fs.appendFile("../data/html-log", `Skipped ${url}`, 'utf-8');
            await context.close();
            return { success: false, error: "Junk or Empty page detected" };
        }

        // 4. DEEP DISCOVERY (Only if the homepage is valid)
        const deepLinks = await page.evaluate(() => {
            const host = window.location.hostname;
            return [...new Set(Array.from(document.querySelectorAll('a'))
                .map(a => a.href)
                .filter(href => {
                    try {
                        const u = new URL(href);
                        return u.hostname.includes(host) && /(contact|about|info)/i.test(href);
                    } catch(e) { return false; }
                })
            )].slice(0, 2);
        });

        let combinedHTML = htmlContent;
        let combinedText = bodyText;

        // 5. PARALLEL DEEP SCAN
        if (deepLinks.length > 0) {
            const subpageData = await Promise.all(deepLinks.map(async (link) => {
                const subPage = await context.newPage();
                try {
                    await subPage.goto(link, { waitUntil: 'domcontentloaded', timeout: 8000 });
                    const subText = await subPage.evaluate(() => document.body.innerText.trim());
                    // Only return subpage data if it isn't also junk
                    if (subText.length > 100 && !JUNK_PATTERNS.test(subText)) {
                        return {
                            html: await subPage.content(),
                            text: subText
                        };
                    }
                    return null;
                } catch (e) { return null; }
                finally { await subPage.close(); }
            }));

            subpageData.forEach(data => {
                if (data) {
                    combinedHTML += "\n\n" + data.html;
                    combinedText += "\n --- SUBPAGE --- \n" + data.text;
                }
            });
        }

        await fs.appendFile("../data/html-log", "\n", 'utf-8')

        const test = JSON.stringify(url+combinedHTML+combinedText, null, 2);

        await fs.appendFile("../data/html-log", test, 'utf-8')

        await fs.appendFile("../data/html-log", "\n", 'utf-8')

        const finalUrl = page.url();
        await context.close();
        return { success: true, html: combinedHTML, text: combinedText, finalUrl };

    } catch (error) {
        await context.close();
        return { success: false, error: error.message };
    }
}