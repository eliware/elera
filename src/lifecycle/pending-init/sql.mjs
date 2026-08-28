export const sqlLiteral = (value) => `'${String(value).replaceAll("\\", "\\\\").replaceAll("'", "''")}'`;
export const sqlIdentifier = (value) => `\`${String(value).replaceAll("`", "``")}\``;
export const initializationSql = ({ database = 'elera_meta' } = {}) => {
  const statements = [`CREATE DATABASE IF NOT EXISTS ${sqlIdentifier(database)};`];
  statements.push('FLUSH PRIVILEGES;');
  return `${statements.join('\n')}\n`;
};
