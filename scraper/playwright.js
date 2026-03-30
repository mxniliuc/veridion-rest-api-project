import { chromium } from 'playwright';
import fs from "fs/promises";
import axios from 'axios';

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
            `http://${rawDomain}`,       // Then Naked HTTP
            `https://${rawDomain}`,      // Try Naked HTTPS first for these subdomains
            `https://www.${rawDomain}`,  // Then WWW HTTPS
            `http://www.${rawDomain}`    // Then WWW HTTP
        ];

        
        let combinedHTML = "";
        let combinedText = "";

        for (const target of targets) {
            try {
                const response = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 15000 });
                console.log("Trying...", target)

                
                if (!response) {console.log("404");continue;}

                /*await page.evaluate(async () => {
                    window.scrollTo(0, document.body.scrollHeight);
                    // Optional: wait a tiny bit for the scroll-triggered JS to finish
                    await new Promise(resolve => setTimeout(resolve, 1000));
                });*/

                await page.waitForTimeout(2000); // Wait for JS to render contact info

                const pageTitle = await page.title(); 
                const bodyText = await page.evaluate(() => document.body.innerText);
                const isJunk = bodyText.length < 250 || pageTitle.toLowerCase().includes("welcome to nginx");
                

                await page.waitForTimeout(1500);
                
                const mainPageData = await page.evaluate(() => {
                    const currentUrl = window.location.href.split(/[?#]/)[0].replace(/\/$/, "");
                    const isHome = window.location.pathname === "/" || window.location.pathname === "";

                    const allLinks = Array.from(document.querySelectorAll('a'))
                        .map(a => ({ text: a.innerText.toLowerCase(), href: a.href.split(/[?#]/)[0].replace(/\/$/, "") }))
                        .filter(l => l.href.startsWith('http') && l.href.includes(window.location.hostname) && l.href !== currentUrl);

                    // Collect BOTH contact and about links
                    let deepLinks = [];
                    if (isHome) {
                        const contactLink = allLinks.find(l => l.text.includes('contact') || l.href.includes('contact'));
                        const aboutLink = allLinks.find(l => l.text.includes('about') || l.href.includes('about'));
                        
                        if (contactLink) deepLinks.push(contactLink.href);
                        if (aboutLink) deepLinks.push(aboutLink.href);
                    }
                    return {
                        html: document.documentElement.outerHTML,
                        text: document.body.innerText,
                        deepLinks: [...new Set(deepLinks)],
                        isHomePage: isHome
                    };
                });

                console.log(mainPageData.deepLinks)

                combinedHTML += mainPageData.html;
                combinedText += mainPageData.text;

                let homePagePhones = mainPageData.extractedPhones || [];
                let subPagePhones = [];
                // LOOP through all discovered deep links
                
                for (const link of mainPageData.deepLinks) {
                    console.log(`  -> Deep scanning: ${link}`);
                    try {
                        // Using 'networkidle' to combat AJAX/Squarespace loading
                        console.log("entering try block")
                        //await page.goto(link, { waitUntil: 'networkidle', timeout: 20000 });

                        await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 10000 });

                        console.log("go to works")
                        
                        // Force a scroll to trigger any lazy-loaded contact footers
                        //await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
                        
                        await page.waitForTimeout(1500);

                        const subPageHTML = await page.content();
                        const subPageText = await page.evaluate(() => document.body.innerText);
                        
                        combinedHTML += "\n\n\n\n" + subPageHTML;
                        combinedText += "\n --- SUBPAGE --- \n" + subPageText;
                    } catch (e) {
                        console.log(`  ! Failed deep scan for ${link}`);
                    }
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