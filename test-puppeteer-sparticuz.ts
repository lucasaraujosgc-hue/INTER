import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

(async () => {
    try {
        console.log('Launching browser...');
        const executablePath = await chromium.executablePath();
        const browser = await puppeteer.launch({ 
            executablePath,
            headless: chromium.headless,
            defaultViewport: chromium.defaultViewport,
            args: [...chromium.args, '--no-sandbox']
        });
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
