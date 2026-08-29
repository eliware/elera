import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const readJson = async (name) => JSON.parse(await readFile(new URL(`../contracts/${name}`, import.meta.url)));
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const schema = await readJson('routing-bundle.schema.json');
const fixture = await readJson('routing-bundle.fixture.json');
const expected = {
  schema: 'dd5eaec0a2330dda347b6f54e8db97e482f09574015df4566615736c49dde5bb',
  fixture: '3e66883c4fc55f547173e10ca359924b1963f0ce9359a64895b66c1d7e31516f'
};
const ajv = new Ajv({ allErrors: true, strict: true, allowUnionTypes: true });
addFormats(ajv);
const validate = ajv.compile(schema);
if (!validate(fixture)) throw new Error(`routing bundle fixture does not match schema: ${ajv.errorsText(validate.errors)}`);
if (digest(schema) !== expected.schema || digest(fixture) !== expected.fixture) throw new Error('routing bundle contract drift detected');
console.log('Contract schema and fixture verified'); 
