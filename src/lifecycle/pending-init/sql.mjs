export const sqlLiteral = (value) => `'${String(value).replaceAll("\\", "\\\\").replaceAll("'", "''")}'`;
export const initializationSql = (password) => `ALTER USER 'root'@'localhost' IDENTIFIED BY ${sqlLiteral(password)};\nFLUSH PRIVILEGES;\n`;
