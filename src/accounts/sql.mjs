export const accountName = (value) => { if (typeof value !== 'string' || !/^[A-Za-z0-9_$-]+$/.test(value)) throw Object.assign(new Error('invalid account name'), { statusCode: 400 }); return value; };
export const identifier = (value) => `\`${String(value).replaceAll('`', '``')}\``;
export const literal = (value) => `'${String(value).replaceAll('\\', '\\\\').replaceAll("'", "''")}'`;
