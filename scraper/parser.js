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
            return {
                url,
                phones: extractPhones($('body').text()),
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

export function extractPhones(text) {
    const phoneRegex = /((?:\+|00)[17](?: |\-)?|(?:\+|00)[1-9]\d{0,2}(?: |\-)?|(?:\+|00)1\-\d{3}(?: |\-)?)?(?:\(\d{3,4}\)|\d{3,4})(?: |\-)?\d{3,4}(?: |\-)?\d{3,4}/g;
    const matches = text.match(phoneRegex);
    return matches ? [...new Set(matches.map(p => p.trim()))] : [];
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

    // 1. Semantic Search: <address> tag
    let address = $('address').first().text().replace(/\s\s+/g, ' ').trim();
    
    // 2. Footer Heuristic: Look for "Street/Ave" in footer
    if (!address) {
        const footerText = $('footer').text();
        address = footerText.match(addressRegex)?.[0] || null;
    }

    // 3. Google Maps Link Extraction: Extracting address from the URL query
    if (!address) {
        const mapLink = $('a[href*="google.com/maps"], a[href*="maps.app.goo.gl"]').first().attr('href');
        if (mapLink) {
            try {
                const urlObj = new URL(mapLink);
                address = urlObj.searchParams.get('q') || urlObj.searchParams.get('query') || urlObj.searchParams.get('daddr');
            } catch (e) { /* ignore invalid URLs */ }
        }
    }

    // 4. Global Body Fallback
    if (!address) {
        const bodyText = $('body').text();
        address = bodyText.match(addressRegex)?.[0] || null;
    }
    
    return address ? address.trim() : null;
}