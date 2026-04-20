import { execSync } from 'child_process';
try {
    console.log(execSync('cat /etc/os-release').toString());
} catch(e) {
    console.log(e);
}
