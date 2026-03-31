The Pipeline Architecture

The project is divided into three distinct phases:
1. Data Extraction: A high-speed, parallelized scraper using Playwright and Cheerio.
2. Data Processing: A merging script that joins scraped data with official company registry names.
3. Data Retrieval: A REST API backed by Elasticsearch using a weighted heuristic matching algorithm.

Tech Stack

Runtime: 
1. Node.js (ES Modules)
2. Scraping: Playwright (Browser automation), Cheerio (Fast HTML parsing)
3. Storage/Search: Elasticsearch 8.x (via Docker)
4. REST API: Express.js
5. Validation: libphonenumber-js

Step 1: Data Extraction & Analysis

The Scraper (/scraper)
Built for speed and resilience. It handles the "Scaling" requirement by:

1. Concurrency: Utilizing p-limit to process 15+ websites simultaneously.
2. Resource Blocking: Aborting requests for images, fonts, and CSS to reduce bandwidth and latency.
3. Protocol Racing: Concurrently attempting http, https, and www variations to find the fastest resolving path.4. Junk Filtering: Advanced Regex and structural checks to skip "403 Forbidden" shells and parked domains.

Data Analysis

Based on the crawl of sample-websites.csv:

1. Coverage: ~90% (Successfully resolved vs. dead/parked domains).
2. Fill Rates: High extraction rates for Socials and Phones due to deep-scanning subpages (About/Contact).

Step 2: Data Retrieval & Matching

The Storing Part (merger.js & indexer.js)

I merged the scraped data with sample-websites-company-names.csv. To ensure the API is scalable, data is indexed into Elasticsearch.

Mappings: Company names are stored as text for fuzzy matching, while domains and socials are keyword for exact lookups.

The Matching Algorithm (/api)
The API uses a Weighted Boolean Query to solve the "Match Rate" challenge. Since inputs in API-input-sample.csv are often messy, the algorithm ranks results based on confidence:


 Bonus: Accuracy Measurement
 Accuracy is measured using the Elasticsearch _score. This allows the API to return a confidence level with every match:
 
 1. Verified (Score > 15): Match confirmed via unique digital identifiers (Domain/Social).
 2. Probabilistic (Score 5-15): High-confidence match based on Phone + Name.
 3. Partial (Score < 5): Best-guess match based on fuzzy name similarity.🚦 
 
 Getting Started
1. Prerequisites
 Docker
 Node.js v18+

2. Setup Elasticsearch

docker run -p 9200:9200 -e "discovery.type=single-node" -e "xpack.security.enabled=false" docker.elastic.co/elasticsearch/elasticsearch:8.12.0

3. Install & Index

npm install
node api/merger.js
node api/indexer.js

4. Run the API

node api/server.js

5. Test the API

Use Postman with a similar body format for querying against the live endpoint

{
  "name": "GenFree LLC",
  "phone": "(252) 446-1839",
  "website": "genfreellc.com",
  "facebook": "https://www.facebook.com/100137179118600"
}

Deliverables Summary

High Coverage: Advanced Playwright logic to bypass common bot-detection and empty shells.
Scalable Search: Sub-100ms query times using Elasticsearch.
Robust Matching: Handles typos, broken URLs, and conflicting data through weighted heuristics.