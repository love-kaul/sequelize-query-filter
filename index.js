import { Op, where, literal } from 'sequelize';
import moment from 'moment';

// Operator map
const operatorMap = {
  eq: Op.eq,
  ne: Op.ne,
  gt: Op.gt,
  gte: Op.gte,
  lt: Op.lt,
  lte: Op.lte,
  like: Op.like,
  notLike: Op.notLike,
  iLike: Op.iLike,
  notILike: Op.notILike,
  in: Op.in,
  notIn: Op.notIn,
  between: Op.between,
  notBetween: Op.notBetween,
  is: Op.is,
  not: Op.not
};

const typeToPgCast = {
  date: '::date'
};

const allowedTypes = ['string', 'number', 'int', 'boolean', 'date'];
const allowedOperators = Object.keys(operatorMap);

function validateFilterObject(filter) {
  if (typeof filter !== 'object' || filter === null) {
    throw new Error('Each filter must be a non-null object');
  }
  if (filter.and || filter.or) {
    const logic = filter.and ? 'and' : 'or';
    const conditions = filter[logic];
    if (!Array.isArray(conditions)) {
      throw new Error(`"${logic}" must be an array`);
    }
    conditions.forEach(validateFilterObject);
    const allowedKeys = new Set([logic]);
    for (const key of Object.keys(filter)) {
      if (!allowedKeys.has(key)) {
        throw new Error(`Invalid key "${key}" in "${logic}" block`);
      }
    }
    return;
  }
  const expectedKeys = ['field', 'operator', 'value', 'type'];
  const actualKeys = Object.keys(filter).sort();
  const missing = expectedKeys.filter(k => !(k in filter));
  const extra = actualKeys.filter(k => !expectedKeys.includes(k));
  if (missing.length > 0) {
    throw new Error(`Missing required field(s): ${missing.join(', ')}`);
  }
  if (extra.length > 0) {
    throw new Error(`Unexpected field(s): ${extra.join(', ')}`);
  }
  const { field, operator, value, type } = filter;
  if (typeof field !== 'string' || !field.trim()) {
    throw new Error(`"field" must be a non-empty string`);
  }
  if (!allowedOperators.includes(operator)) {
    throw new Error(`Unsupported "operator": ${operator}`);
  }
  if (value === undefined || value === null || (Array.isArray(value) && value.length === 0)) {
    throw new Error(`"value" is required for operator "${operator}"`);
  }
  if (!allowedTypes.includes(type)) {
    throw new Error(`Unsupported "type": ${type}`);
  }
  if (['between', 'notBetween'].includes(operator)) {
    if (!Array.isArray(value) || value.length !== 2) {
      throw new Error(`"${operator}" operator requires a 2-element array`);
    }
  }
  if (['in', 'notIn'].includes(operator)) {
    if (!Array.isArray(value)) {
      throw new Error(`"${operator}" operator requires an array`);
    }
  }
}

function coerceValue(value, type) {
  if (Array.isArray(value)) {return value.map(v => coerceValue(v, type));}
  switch (type) {
    case 'number':
    case 'int':
      const n = Number(value);
      if (isNaN(n)) {throw new Error(`Invalid number: ${value}`);}
      return n;
    case 'boolean':
      return value === 'true' || value === true;
    case 'date':
      const d = moment(value, moment.ISO_8601, true);
      if (!d.isValid()) {throw new Error(`Invalid date: ${value}`);}
      return d.format('YYYY-MM-DD');
    case 'string':
    default:
      return String(value);
  }
}

function buildSequelizeWhere(filter) {
  validateFilterObject(filter);
  if (Array.isArray(filter)) {
    return { [Op.and]: filter.map(buildSequelizeWhere) };
  }
  if (typeof filter !== 'object' || filter === null) {throw new Error('Invalid filter');}
  if (filter.and || filter.or) {
    const logic = filter.and ? Op.and : Op.or;
    const conditions = filter.and || filter.or;
    if (!Array.isArray(conditions)) {throw new Error(`${logic} must be array`);}
    return { [logic]: conditions.map(buildSequelizeWhere) };
  }
  const { field, operator, value, type = 'string' } = filter;
  if (!field || !operator) {throw new Error('Missing field/operator');}
  const op = operatorMap[operator];
  if (!op) {throw new Error(`Unsupported operator: ${operator}`);}
  const cast = typeToPgCast[type] || '';
  const parsed = coerceValue(value, type);
  if (cast) {
    return where(
      literal(`"${field}"${cast}`),
      op,
      Array.isArray(parsed)
        ? parsed.map(val => literal(`'${val}'${cast}`))
        : literal(`'${parsed}'${cast}`)
    );
  }
  return {
    [field]: {
      [op]: parsed
    }
  };
}

let paramIndex = 1;

function escapeIdentifier(name) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {throw new Error(`Invalid identifier: ${name}`);}
  return `"${name}"`;
}

function buildRawFilter(filter, params = []) {
  if (Array.isArray(filter)) {
    const clauses = filter.map(f => buildRawFilter(f, params));
    return `(${clauses.join(' AND ')})`;
  }
  if (typeof filter !== 'object' || filter === null) {throw new Error('Invalid filter');}
  if (filter.and || filter.or) {
    const logic = filter.and ? 'AND' : 'OR';
    const conditions = filter.and || filter.or;
    if (!Array.isArray(conditions)) {throw new Error(`${logic} must be array`);}
    const parts = conditions.map(f => buildRawFilter(f, params));
    return `(${parts.join(` ${logic} `)})`;
  }
  const { field, operator, value, type = 'string' } = filter;
  if (!field || !operator) {throw new Error('Missing field/operator');}
  const safeField = escapeIdentifier(field);
  const castStr = typeToPgCast[type] || '';
  const paramPlaceholder = () => `$${paramIndex++}`;
  if (['between', 'notBetween'].includes(operator)) {
    if (!Array.isArray(value) || value.length !== 2) {throw new Error('Between requires 2 values');}
    const [v1, v2] = coerceValue(value, type);
    const p1 = paramPlaceholder();
    const p2 = paramPlaceholder();
    params.push(v1, v2);
    return `${safeField}${castStr} ${operator === 'between' ? 'BETWEEN' : 'NOT BETWEEN'} ${p1} AND ${p2}`;
  }
  if (['in', 'notIn'].includes(operator)) {
    if (!Array.isArray(value)) {throw new Error(`${operator} requires array`);}
    const coerced = coerceValue(value, type);
    const placeholders = coerced.map(() => paramPlaceholder());
    params.push(...coerced);
    return `${safeField}${castStr} ${operator === 'in' ? 'IN' : 'NOT IN'} (${placeholders.join(', ')})`;
  }
  const sqlOps = {
    eq: '=', ne: '!=', gt: '>', gte: '>=',
    lt: '<', lte: '<=', like: 'LIKE', notLike: 'NOT LIKE',
    iLike: 'ILIKE', notILike: 'NOT ILIKE', is: 'IS', not: 'IS NOT'
  };
  const sqlOp = sqlOps[operator];
  if (!sqlOp) {throw new Error(`Unsupported SQL operator: ${operator}`);}
  const parsed = coerceValue(value, type);
  const placeholder = paramPlaceholder();
  params.push(parsed);
  return `${safeField}${castStr} ${sqlOp} ${placeholder}`;
}

function buildRawQueryFromFilter(filter) {
  validateFilterObject(filter);
  paramIndex = 1;
  const params = [];
  const where = buildRawFilter(filter, params);
  return { where, params };
}

export {
  buildSequelizeWhere,
  buildRawQueryFromFilter,
  validateFilterObject,
  coerceValue
};
