let startTime = Date.now();

export function logProgress(current, total) {
    const now = Date.now();
    const elapsedMs = now - startTime;
    const elapsedSec = Math.floor(elapsedMs / 1000);
    
    // Calculate speed and ETA
    const processed = current + 1;
    const msPerSite = elapsedMs / processed;
    const remainingSites = total - processed;
    const etaMs = remainingSites * msPerSite;
    
    const formatTime = (ms) => {
        const s = Math.floor(ms / 1000);
        const m = Math.floor(s / 60);
        return `${m}m ${s % 60}s`;
    };

    const percent = ((processed / total) * 100).toFixed(1);
    
    console.log(`[Progress] ${processed}/${total} (${percent}%) | Elapsed: ${formatTime(elapsedMs)} | ETA: ${formatTime(etaMs)}`);
}

export function resetTimer() {
    startTime = Date.now();
}

export function performDataAnalysis(results) {
    const totalAttempted = results.length;
    const successfulCrawls = results.filter(r => r.success).length;
    const failedCrawls = totalAttempted - successfulCrawls;

    const coveragePercent = (successfulCrawls / totalAttempted) * 100;

    const phoneFill = results.filter(r => r.success && r.phones.length > 0).length;
    const socialFill = results.filter(r => r.success && (r.socials.facebook || r.socials.twitter || r.socials.linkedin)).length;
    const addressFill = results.filter(r => r.success && r.address).length;

    console.log("--- Step 1.2: Data Analysis Report ---");
    console.log(`Total Websites: ${totalAttempted}`);
    console.log(`Successful Crawls: ${successfulCrawls} (${coveragePercent.toFixed(2)}%)`);
    console.log(`Failed Crawls: ${failedCrawls}`);
    console.log("--------------------------------------");
    console.log(`Phone Fill Rate: ${((phoneFill / successfulCrawls) * 100).toFixed(2)}% `);
    console.log(`Social Media Fill Rate: ${((socialFill / successfulCrawls) * 100).toFixed(2)}%`);
    console.log(`Address Fill Rate: ${((addressFill / successfulCrawls) * 100).toFixed(2)}%`);
    console.log("--------------------------------------");

    return {
        coverage: coveragePercent,
        fillRates: {
            phone: (phoneFill / successfulCrawls) * 100,
            social: (socialFill / successfulCrawls) * 100,
            address: (addressFill / successfulCrawls) * 100
        }
    };
}