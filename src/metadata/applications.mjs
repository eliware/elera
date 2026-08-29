import { createHash, randomBytes } from 'node:crypto';
import { generate as generateSnowflake } from '@eliware/snowflake';
import { literal } from '../accounts/sql.mjs';

const name = (value, label) => {
  if (typeof value !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,62}$/.test(value)) throw Object.assign(new Error(`${label} is invalid`), { statusCode: 400 });
  return value;
};
const hash = (value) => createHash('sha256').update(value).digest('hex');

export function createApplicationService({ query, database = 'elera_meta' } = {}) {
  if (typeof query !== 'function') throw new TypeError('query function is required');
  const q = (sql, params) => query(sql.replaceAll('elera_meta', `\`${database}\``), params);
  return {
    async create({ name: applicationName }) {
      name(applicationName, 'application');
      const applicationId = String(generateSnowflake());
      await q(`INSERT INTO elera_meta.applications (application_id, name) VALUES (${literal(applicationId)}, ${literal(applicationName)})`, []);
      return { applicationId, application: applicationName };
    },
    async issueAdminToken({ application, tokenName = 'admin' }) {
      name(application, 'application'); name(tokenName, 'token');
      const [apps] = await q(`SELECT application_id FROM elera_meta.applications WHERE name=${literal(application)}`);
      if (!apps[0]) throw Object.assign(new Error('application not found'), { statusCode: 404 });
      const tokenId = String(generateSnowflake());
      const token = `elera_${randomBytes(32).toString('base64url')}`;
      await q(`INSERT INTO elera_meta.scoped_tokens (token_id, name, token_hash, application_name, identity_name, scopes_json) VALUES (${literal(tokenId)}, ${literal(tokenName)}, ${literal(hash(token))}, ${literal(application)}, NULL, ${literal(JSON.stringify(['app:admin']))})`, []);
      return { tokenId, token, application, applicationId: apps[0].application_id, scopes: ['app:admin'] };
    },
  };
}
