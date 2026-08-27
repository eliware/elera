import { expect, test } from '@jest/globals';
import { accountName, identifier, literal } from '../src/accounts/sql.mjs';

test('account SQL helpers validate and quote values', () => { expect(accountName('app_user')).toBe('app_user'); expect(() => accountName('bad name')).toThrow(); expect(() => accountName(null)).toThrow(); expect(identifier('a`b')).toBe('`a``b`'); expect(literal("a'b\\c")).toBe("'a''b\\\\c'"); });
