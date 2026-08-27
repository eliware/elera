import { readFile } from 'node:fs/promises';
const fixture = JSON.parse(await readFile(new URL('../contracts/routing-bundle.fixture.json', import.meta.url)));
const schema = JSON.parse(await readFile(new URL('../contracts/routing-bundle.schema.json', import.meta.url)));
if (schema.$id !== 'https://eliware.dev/contracts/routing-bundle.schema.json' || fixture.apiVersion !== 'v1' || fixture.writer.some((node) => node.port !== 3306) || fixture.readers.some((node) => node.port !== 3306)) throw new Error('routing bundle contract verification failed');
console.log('Contract fixtures verified');
