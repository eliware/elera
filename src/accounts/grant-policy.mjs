const privileges = 'SELECT|INSERT|UPDATE|DELETE|DROP|EXECUTE|CREATE|ALTER|INDEX|REFERENCES|SHOW VIEW|TRIGGER|EVENT|LOCK TABLES';
const pattern = new RegExp(`^(${privileges})(,\\s*(${privileges}))*$`, 'i');

export function validateGrantPolicy(grant) {
  if (typeof grant !== 'string' || !pattern.test(grant)) throw Object.assign(new Error('invalid grant policy'), { statusCode: 400 });
  return grant;
}
