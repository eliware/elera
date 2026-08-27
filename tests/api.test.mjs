import { expect, test } from '@jest/globals';
import { tokenMatches } from '../src/api/authentication.mjs';
import { readBody } from '../src/api/http.mjs';

test('shared API helpers handle missing authentication and invalid JSON', async () => {
  expect(tokenMatches({ headers: {} }, undefined)).toBe(false);
  expect(await readBody({ async *[Symbol.asyncIterator]() {} })).toEqual({});
  const request = { async *[Symbol.asyncIterator]() { yield '{invalid'; } };
  await expect(readBody(request)).rejects.toMatchObject({ statusCode: 400 });
});
