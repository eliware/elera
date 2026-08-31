import { expect, test } from '@jest/globals';
import { createApplicationService } from '../../src/metadata/applications.mjs';

test('creates an application and issues a scoped admin token', async () => {
  const calls = []; const service = createApplicationService({ query: async (sql) => { calls.push(sql); return sql.startsWith('SELECT') ? [[{ application_id: 'app-id' }]] : [[]]; } });
  await expect(service.create({ name: 'billing' })).resolves.toMatchObject({ application: 'billing' });
  await expect(service.issueAdminToken({ application: 'billing', tokenName: 'owner' })).resolves.toMatchObject({ application: 'billing', scopes: ['app:admin'] });
  expect(calls.some((sql) => sql.includes('INSERT INTO'))).toBe(true);
});
test('validates application and token names and missing applications', async () => {
  expect(() => createApplicationService()).toThrow('query function is required');
  const service = createApplicationService({ query: async () => [[]] });
  await expect(service.create({ name: 'bad name' })).rejects.toThrow('application is invalid');
  await expect(service.issueAdminToken({ application: 'billing', tokenName: 'owner' })).rejects.toThrow('application not found');
  const existing = createApplicationService({ query: async () => [[{ application_id: 'app-id' }]] });
  await expect(existing.issueAdminToken({ application: 'billing', tokenName: 'bad.name' })).rejects.toThrow('token is invalid');
});

test('uses the default admin token name and configured metadata database', async () => {
  const calls = [];
  const service = createApplicationService({ database: 'custom_meta', query: async (sql) => { calls.push(sql); return sql.startsWith('SELECT') ? [[{ application_id: 'id' }]] : [[]]; } });
  await service.issueAdminToken({ application: 'billing' });
  expect(calls[0]).toContain('`custom_meta`');
  expect(calls[1]).toContain("'admin'");
});

test('returns application status by ID and rejects unknown IDs', async () => {
  const service = createApplicationService({ query: async (sql) => sql.includes('application_id') ? [[{ application_id: '1', application: 'billing' }]] : [[]] });
  await expect(service.status({ applicationId: '1' })).resolves.toEqual({ application_id: '1', application: 'billing' });
  await expect(createApplicationService({ query: async () => [[]] }).status({ applicationId: 'missing' })).rejects.toMatchObject({ statusCode: 404 });
});
