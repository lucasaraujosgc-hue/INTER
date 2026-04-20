import puppeteer from 'puppeteer';

(async () => {
    try {
        console.log('Launching browser...');
        const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        console.log('Browser launched!');
        const page = await browser.newPage();
        await page.goto('https://example.com');
        await page.pdf({ path: 'test.pdf' });
        console.log('PDF generated');
        await browser.close();
    } catch (e) {
        console.error('Error:', e);
    }
})();
