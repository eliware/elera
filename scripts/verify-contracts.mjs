import { readFile } from 'node:fs/promises';
import { validateBundle } from '@eliware/elera-lib';

const readJson = async (name) => JSON.parse(await readFile(new URL(`../contracts/${name}`, import.meta.url)));
const fixture = await readJson('routing-bundle.fixture.json');
try { validateBundle(fixture); } catch (error) { throw new Error(`routing bundle fixture does not match @eliware/elera-lib: ${error.message}`, { cause: error }); }
console.log('Canonical @eliware/elera-lib routing bundle contract and supervisor fixture verified');
