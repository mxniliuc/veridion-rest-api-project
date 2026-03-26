import axios from 'axios';
import * as cheerio from 'cheerio';
import { response } from 'express';
import fs from "fs/promises";

export async function scrapeWithCheerio(url){
    const targetUrl = url.startsWith('http') ? url : `https://${url}`;
    try {
        const response = await axios.get(targetUrl, {
            timeout: 8000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
            }
        });

        const $ = cheerio.load(response.data);
        const text = $('body').text();

        return {
            url,
            phones: extractPhones(text),
            socials: extractSocials($),
            address: extractAddress($),
            success: true
        };
    } catch (error) {
        let failureType = 'Unknown';
        if (error.code === 'ENOTFOUND') failureType = 'Dead Domain/DNS Error';
        if (error.code === 'ECONNABORTED') failureType = 'Timeout';
        if (error.response?.status === 404) failureType = 'Page Missing';
        return { url, success: false, error: failureType, failureType: failureType, code: error };
    }
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
    let address = $('address').first().text().trim();
    
    if (!address) {
        address = $('footer').text().match(/\d+ [\w\s]+ (Street|St|Ave|Avenue|Rd|Road|Suite|Bldg)/i)?.[0] || null;
    }
    
    return address;
}