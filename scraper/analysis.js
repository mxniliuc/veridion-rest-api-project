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
    console.log(`Phone Fill Rate: ${((phoneFill / successfulCrawls) * 100).toFixed(2)}%`);
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