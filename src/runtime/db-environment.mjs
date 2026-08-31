export function supervisorDbEnvironment(environment = process.env) {
  return {
    ...environment,
    MYSQL_HOST: '127.0.0.1',
    MYSQL_PORT: '3306',
    MYSQL_SOCKET: '/run/mysqld/mysqld.sock',
    MYSQL_USER: 'root',
    MYSQL_PASSWORD: '',
    MYSQL_DATABASE: 'elera_meta',
  };
}
