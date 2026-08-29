import { expect, jest, test } from '@jest/globals';
import { json, readBody } from '../../src/api/http.mjs';

test('writes a JSON response with status and content type', () => {
  const response = { writeHead: jest.fn().mockReturnThis(), end: jest.fn() };
  expect(json(response, 202, { ok: true })).toBeUndefined();
  expect(response.writeHead).toHaveBeenCalledWith(202, { 'content-type': 'application/json' });
  expect(response.end).toHaveBeenCalledWith('{"ok":true}\n');
});

test('reads an empty request body', async () => {
  await expect(readBody({ async *[Symbol.asyncIterator]() {} })).resolves.toEqual({});
});

test('rejects invalid JSON with a bad request', async () => {
  const request = { async *[Symbol.asyncIterator]() { yield '{invalid'; } };
  await expect(readBody(request)).rejects.toMatchObject({ statusCode: 400 });
});

test('reads multiple body chunks', async () => {
  const request = { async *[Symbol.asyncIterator]() { yield '{"name":'; yield '"demo"}'; } };
  await expect(readBody(request)).resolves.toEqual({ name: 'demo' });
});
