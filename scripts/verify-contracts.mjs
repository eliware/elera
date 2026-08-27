import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const readJson = async (name) => JSON.parse(await readFile(new URL(`../contracts/${name}`, import.meta.url)));
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const schema = await readJson('routing-bundle.schema.json');
const fixture = await readJson('routing-bundle.fixture.json');
const expected = {
  schema: 'f877cb0e6b11c116a6c6f6d2a6081202287c3204d21c451ae59b2ce99e939a0b',
  fixture: 'cdf1544ab51415409a94cb22eff86bb1d14a66f63a8be1cdacab5cbcc1e48a77'
};
const ajv = new Ajv({ allErrors: true, strict: true, allowUnionTypes: true });
addFormats(ajv);
const validate = ajv.compile(schema);
if (!validate(fixture)) throw new Error(`routing bundle fixture does not match schema: ${ajv.errorsText(validate.errors)}`);
if (digest(schema) !== expected.schema || digest(fixture) !== expected.fixture) throw new Error('routing bundle contract drift detected');
console.log('Contract schema and fixture verified'); 
