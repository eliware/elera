export const sqlLiteral = (value) => `'${String(value).replaceAll("\\", "\\\\").replaceAll("'", "''")}'`;
export const sqlIdentifier = (value) => `\`${String(value).replaceAll("`", "``")}\``;
export const initializationSql = ({ rootPassword, database, user, password } = {}) => {
  const statements = [`ALTER USER 'root'@'localhost' IDENTIFIED BY ${sqlLiteral(rootPassword)};`];
  if (database) statements.push(`CREATE DATABASE IF NOT EXISTS ${sqlIdentifier(database)};`);
  if (user) {
    statements.push(`CREATE USER IF NOT EXISTS ${sqlLiteral(user)}@'%' IDENTIFIED BY ${sqlLiteral(password ?? '')};`);
    statements.push(`GRANT ALL PRIVILEGES ON ${sqlIdentifier(database ?? '*')}.* TO ${sqlLiteral(user)}@'%';`);
    statements.push(`CREATE USER IF NOT EXISTS ${sqlLiteral(user)}@'localhost' IDENTIFIED BY ${sqlLiteral(password ?? '')};`);
    statements.push(`GRANT ALL PRIVILEGES ON ${sqlIdentifier(database ?? '*')}.* TO ${sqlLiteral(user)}@'localhost';`);
  }
  statements.push('FLUSH PRIVILEGES;');
  return `${statements.join('\n')}\n`;
};
