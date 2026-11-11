import fs from 'fs';
import puppeteer from 'puppeteer-core';

/** Localiza um Chrome/Chromium disponível (Docker: /usr/bin/chromium; local: variável de ambiente). */
function chromePath(): string {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean) as string[];
  const found = candidates.find(p => fs.existsSync(p));
  if (!found) throw new Error('Nenhum Chrome/Chromium encontrado para gerar PDF. Defina PUPPETEER_EXECUTABLE_PATH.');
  return found;
}

export async function launchBrowser() {
  return puppeteer.launch({
    executablePath: chromePath(),
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
}

export async function htmlToPdf(html: string): Promise<Buffer> {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load', timeout: 20000 });
    const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '8mm', bottom: '8mm', left: '8mm', right: '8mm' } });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

export async function urlToPdf(url: string, hideSelectors = '.hidden-print, .btn, hr.separator, #alertaMensagem'): Promise<Buffer> {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 20000 });
    await page.evaluate((sel: string) => {
      const style = document.createElement('style');
      style.textContent = `${sel} { display: none !important; } @media print { body { -webkit-print-color-adjust: exact; background: white; } }`;
      document.head.appendChild(style);
    }, hideSelectors);
    const pdf = await page.pdf({ format: 'A4', printBackground: true });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
