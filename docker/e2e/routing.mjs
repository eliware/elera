import { spawn } from 'node:child_process';
import { post } from './http.mjs';
export async function exerciseRouting(environment) { const app = spawn(process.execPath, ['/workspace/sample-app/app.mjs'], { env: environment, stdio: 'inherit' }); await delay(5000); await post('http://elera-0:8080', '/api/v1/traffic/drain'); await delay(3000); await post('http://elera-0:8080', '/api/v1/traffic/undrain'); await delay(3000); app.kill('SIGTERM'); await new Promise((resolve, reject) => { app.once('error', reject); app.once('exit', (code, signal) => code === 0 || signal ? resolve() : reject(new Error(`sample app exited with ${code}`))); }); }
function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
