import { execSync } from 'child_process';
try {
    console.log(execSync('sudo apt-get update && sudo apt-get install -y chromium').toString());
} catch(e: any) {
    console.log("Error:", e.message);
    try {
        console.log(execSync('apt-get update && apt-get install -y chromium').toString());
    } catch(err: any) {
        console.log("Error directly:", err.message);
    }
}
