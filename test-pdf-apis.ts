import axios from 'axios';
import fs from 'fs';

const urlToConvert = 'https://saogoncalodoscamposba.webiss.com.br/externo/nfse/visualizar/52613515000160/EC5H-GSFC/202600000000006';

async function testApiUrl(apiUrl: string, params: object) {
    try {
        const res = await axios.get(apiUrl, { params, responseType: 'arraybuffer', timeout: 8000 });
        if (res.headers['content-type']?.includes('pdf') || res.data?.slice(0, 4)?.toString('utf8') === '%PDF') {
            console.log(`Success with: ${apiUrl}`);
            return true;
        }
        console.log(`Failed with ${apiUrl} - Status: ${res.status}`);
        return false;
    } catch(e: any) {
        console.log(`Failed with ${apiUrl} - Error: ${e.message}`);
        return false;
    }
}

(async () => {
    // List of public PDF generation services (some might work without auth)
    await testApiUrl('https://api.html2pdf.app/v1/generate', { url: urlToConvert, apiKey: '' });
    await testApiUrl('https://www.sejda.com/html-to-pdf', { url: urlToConvert });
    await testApiUrl('https://api.pdfmyurl.com/api', { url: urlToConvert });
})();
