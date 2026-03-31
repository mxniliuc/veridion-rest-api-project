import { Client } from '@elastic/elasticsearch';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

const client = new Client({ node: 'http://localhost:9200'});
const INDEX_NAME = 'companies';

function normalizeDomain(url) {
    if (!url) return null;
    return url
        .toLowerCase()
        .replace(/^(https?:\/\/)+/, "") // Handles "https://https//" typos
        .replace(/^www\./, "")
        .split(/[/?#]/)[0]
        .trim();
}

function normalizePhone(phone) {
    if (!phone) return null;
    const parsed = parsePhoneNumberFromString(phone, 'US');
    return parsed ? parsed.formatNational() : phone.replace(/\D/g, "");
}

export const findBestMatch = async ({ name, website, phone, facebook }) => {
    const cleanDomain = normalizeDomain(website);
    
    const phoneSearch = (phone && phone.length < 7) ? phone : normalizePhone(phone);

    const query = {
        index: INDEX_NAME,
        body: {
            size: 1,
            query: {
                bool: {
                    should: [
                        cleanDomain ? { 
                            match: { 
                                domain: { query: cleanDomain, boost: 10 } 
                            } 
                        } : null,
                        
                        facebook ? { 
                            wildcard: { 
                                "socials.facebook": { 
                                    value: `*${facebook.split('/').filter(Boolean).pop()}*`, 
                                    boost: 8 
                                } 
                            } 
                        } : null,
                        
                        phoneSearch ? { 
                            wildcard: { 
                                "phones": { 
                                    value: `*${phoneSearch.replace(/\D/g, "")}*`, 
                                    boost: 6 
                                } 
                            } 
                        } : null,
                        
                        name ? { 
                            match: { 
                                company_commercial_name: { 
                                    query: name, 
                                    fuzziness: "AUTO",
                                    boost: 4 
                                } 
                            } 
                        } : null,

                        name ? { 
                            match: { 
                                company_all_available_names: { 
                                    query: name, 
                                    boost: 1 
                                } 
                            } 
                        } : null
                    ].filter(Boolean)
                }
            }
        }
    };

    const response = await client.search(query);

    if (response.hits.total.value > 0) {
        const hit = response.hits.hits[0];
        return {
            confidence_score: hit._score,
            match_details: hit._source
        };
    }
    return null;
};