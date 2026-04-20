import axios from 'axios';
axios.get('https://saogoncalodoscamposba.webiss.com.br/ws/nfse.asmx?WSDL')
  .then(res => console.log(res.data))
  .catch(err => console.error(err.message));
