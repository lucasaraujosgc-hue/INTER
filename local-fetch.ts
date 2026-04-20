import axios from 'axios';

(async () => {
  try {
    const res = await axios.get('https://saogoncalodoscamposba.webiss.com.br/externo/nfse/visualizar/52613515000160/EC5H-GSFC/202600000000006');
    console.log(res.data.substring(0, 1500));
    const lines = res.data.split('\n');
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes('pdf') || lines[i].toLowerCase().includes('imprimir')) {
            console.log('Found:', lines[i].trim());
        }
    }
  } catch(e) {
    console.error(e);
  }
})();
