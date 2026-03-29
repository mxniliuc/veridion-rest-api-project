import axios from 'axios';
import * as cheerio from 'cheerio';
import { response } from 'express';
import fs from "fs/promises";
import https from 'https';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

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
                phones: finalPhones,
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
            const $el = $(el);
            
            // 1. Get the literal number from the href (metadata)
            let telMetadata = $el.attr('href').replace('tel:', '').trim();
            if (telMetadata) allMatches.push(telMetadata);

            // 2. Get the visible text associated with this specific link
            // This catches cases where the href is just digits but the text is formatted
            const linkText = $el.text().trim();
            const textMatch = linkText.match(phoneRegex);
            if (textMatch) {
                allMatches.push(...textMatch);
            }
        });

        $('a, button, span').each((i, el) => {
            const $el = $(el);
            // Check title, aria-label, and data-attributes
            const attributesToCheck = [
                $el.attr('title'), 
                $el.attr('aria-label'), 
                $el.attr('data-phone'), 
                $el.attr('data-tel'),
                $el.attr('tel')
            ];

            attributesToCheck.forEach(attr => {
                if (attr) {
                    const match = attr.match(phoneRegex);
                    if (match) allMatches.push(...match);
                }
            });
        });
    }

    const validatedNumbers = allMatches.map(raw => {
        // We assume 'US' but the library handles '+' prefixes automatically
        const parsed = parsePhoneNumberFromString(raw, 'US');
        
        // Only return if it's a valid phone number length and format
        if (parsed && parsed.isValid()) {
            return parsed.formatNational(); // Standardizes to (305) 356-7440
        }
        return null;
    }).filter(Boolean); // Remove nulls

    return [...new Set(validatedNumbers)];
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