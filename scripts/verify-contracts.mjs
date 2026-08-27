import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const readJson = async (name) => JSON.parse(await readFile(new URL(`../contracts/${name}`, import.meta.url)));
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const schema = await readJson('routing-bundle.schema.json');
const fixture = await readJson('routing-bundle.fixture.json');
const expected = {
  schema: '992e7dfe3dfff675fdd232d4fbc1f03f39b980fd4e10edbf4493c20b0f56082d',
  fixture: '15e596cf47b1359f1db8dff7bb78bcbb25d650ca136e19be04d14f8a9cc970a5'
};
const ajv = new Ajv({ allErrors: true, strict: true, allowUnionTypes: true });
addFormats(ajv);
const validate = ajv.compile(schema);
if (!validate(fixture)) throw new Error(`routing bundle fixture does not match schema: ${ajv.errorsText(validate.errors)}`);
if (digest(schema) !== expected.schema || digest(fixture) !== expected.fixture) throw new Error('routing bundle contract drift detected');
console.log('Contract schema and fixture verified'); 
