import axios from 'axios';
import fs from 'fs';

(async () => {
    try {
        console.log('Fetching PDF via free api...');
        const url = 'https://saogoncalodoscamposba.webiss.com.br/externo/nfse/visualizar/52613515000160/EC5H-GSFC/202600000000006';
        
        // try PDFCrowd (often has a free endpoint for testing with watermark)
        // or just use gotenberg public instance if one exists.
    } catch (e) {
        console.error(e);
    }
})();
