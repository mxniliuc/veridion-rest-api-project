import axios from 'axios';
import * as cheerio from 'cheerio';
import { response } from 'express';
import fs from "fs/promises";
import https from 'https';

const standardAgent = new https.Agent({
    rejectUnauthorized: true, 
});

const permissiveAgent = new https.Agent({
    rejectUnauthorized: false,
    minVersion: 'TLSv1',
    ciphers: 'DEFAULT:@SECLEVEL=1'       
});


export async function scrapeWithCheerio(url) {
   const rawDomain = url.replace(/^(?:https?:\/\/)?(?:www\.)?/i, "");
    
    const protocols = [
        { name: 'HTTPS-WWW', url: `https://www.${rawDomain}`, agent: permissiveAgent }, 
        { name: 'HTTPS-Naked', url: `https://${rawDomain}`, agent: permissiveAgent }, 
        { name: 'HTTP-WWW', url: `http://www.${rawDomain}`, agent: null }
    ];

    let lastError = null;

    for (const step of protocols) {
        try {
            const response = await axios.get(step.url, {
                timeout: 8000, // Faster timeout per attempt to keep the loop moving
                httpsAgent: step.agent,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Referer': 'https://www.google.com/'
                }
            });

            const $ = cheerio.load(response.data);

            const output1 = JSON.stringify($('body').text(), null, 2);

            await fs.appendFile("../data/cheerio-results", url+output1+"\n", 'utf-8');

            return {
                url,
                phones: extractPhones($('body').text(), $),
                socials: extractSocials($),
                address: extractAddress($),
                success: true,
                methodUsed: step.name 
            };
        } catch (error) {
            lastError = error;
            if (error.response?.status === 404) break;
            // Silent continue to next protocol
        }
    }

    let failureType = 'Unknown';
    if (lastError.code === 'ENOTFOUND') failureType = 'Dead Domain/DNS Error';
    else if (lastError.code === 'ECONNABORTED') failureType = 'Timeout';
    else if (lastError.response?.status === 404) failureType = 'Page Missing';
    else if (lastError.code === 'EPROTO' || lastError.message.includes('SSL')) failureType = 'SSL Handshake Failure';

    return { 
        url, 
        success: false, 
        error: failureType, 
        failureType: failureType, 
        code: lastError.message 
    };
}

export function extractPhones(text, $) {
    // This regex looks for:
    // 1. Optional +1 or 1 and a separator
    // 2. 3 digits (optional parenthesis)
    // 3. 3 digits
    // 4. 4 digits
    // Supports: 555-555-5555, (555) 555-5555, 555 555 5555, 555.555.5555
    const phoneRegex = /(?:\+?1[-. ]?)?\(?([0-9]{3})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})/g;
    
    let allMatches = [];

    // Search body text
    const bodyMatches = text.match(phoneRegex);
    if (bodyMatches) allMatches.push(...bodyMatches);

    if ($) {
        // Search footer text specifically
        const footerText = $('footer').text() || $('[class*="footer"]').text();
        const footerMatches = footerText.match(phoneRegex);
        if (footerMatches) allMatches.push(...footerMatches);
        
        // Search tel: metadata
        $('a[href^="tel:"]').each((i, el) => {

            let tel = $(el).attr('href').replace('tel:', '').trim();
            // Clean up common metadata formats to standard aaa-aaa-aaaa
            if (/^\d{10}$/.test(tel)) {
                tel = tel.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
            }
            allMatches.push(tel);
        });
    }

    // Filter out short noise and standardize
    return [...new Set(allMatches.map(p => p.trim()).filter(p => p.length >= 10))];
}

export function extractSocials($) {
    const socials = { facebook: null, twitter: null, linkedin: null };
    
    $('a').each((i, el) => {
        const href = $(el).attr('href');
        if (!href) return;

        if (href.includes('facebook.com/')) socials.facebook = href;
        if (href.includes('twitter.com/')) socials.twitter = href;
        if (href.includes('linkedin.com/company/')) socials.linkedin = href;
    });
    
    return socials;
}

export function extractAddress($) {
    const addressRegex = /\d{1,5}\s+([a-zA-Z0-9\s\.,#-]+)\s+(Street|St|Ave|Avenue|Rd|Road|Suite|Bldg|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Circle|Cir|Pkwy|Parkway)/i;

    let address = $('address').first().text().replace(/\s\s+/g, ' ').trim();
    
    if (!address) {
        const footerText = $('footer').text();
        address = footerText.match(addressRegex)?.[0] || null;
    }

    if (!address) {
        const mapLink = $('a[href*="google.com/maps"], a[href*="maps.app.goo.gl"]').first().attr('href');
        if (mapLink) {
            try {
                const urlObj = new URL(mapLink);
                address = urlObj.searchParams.get('q') || urlObj.searchParams.get('query') || urlObj.searchParams.get('daddr');
            } catch (e) {  }
        }
    }

    if (!address) {
        const bodyText = $('body').text();
        address = bodyText.match(addressRegex)?.[0] || null;
    }
    
    return address ? address.trim() : null;
}