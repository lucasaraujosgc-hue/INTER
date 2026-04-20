import { execSync } from 'child_process';
try {
    console.log(execSync('ldd /root/.cache/puppeteer/chrome/linux-147.0.7727.57/chrome-linux64/chrome').toString());
} catch(e) {
    console.log('Error', (e as any).message);
}
