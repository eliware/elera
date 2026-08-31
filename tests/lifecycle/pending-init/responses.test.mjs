import { expect, jest, test } from '@jest/globals';
import { json } from '../../../src/lifecycle/pending-init/responses.mjs';

test('writes JSON response headers and body', () => {
  const response = { writeHead: jest.fn().mockReturnThis(), end: jest.fn().mockReturnThis() };
  expect(json(response, 202, { ok: true })).toBe(response);
  expect(response.writeHead).toHaveBeenCalledWith(202, { 'content-type': 'application/json' });
  expect(response.end).toHaveBeenCalledWith('{"ok":true}');
});
