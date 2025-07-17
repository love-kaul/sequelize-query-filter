# sequelize-query-filter-builder

Flexible, secure, and type-safe filter builder for Sequelize and raw SQL queries.

## Features

- Validate and coerce filter objects for safe query building
- Supports all major Sequelize operators (`eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `like`, `in`, `between`, etc.)
- Compound logic (`and`, `or`) for complex queries
- Type casting for dates, numbers, booleans, strings
- Build Sequelize `where` objects or raw SQL `WHERE` clauses with named parameters
- **Implicit AND:** If you pass an array of filter objects, it is treated as an implicit `AND` condition

## Installation

```bash
npm install sequelize-query-filter-builder
```

## Usage (ES Modules)

### 1. Build a Sequelize WHERE clause

```javascript
import { buildSequelizeWhere } from 'sequelize-query-filter-builder';

const filter = {
  field: 'status',
  operator: 'eq',
  value: 'active',
  type: 'string'
};

const whereClause = buildSequelizeWhere(filter);
// Use in Sequelize: Model.findAll({ where: whereClause });
```

### 2. Compound filters

```javascript
import { buildSequelizeWhere } from 'sequelize-query-filter-builder';

const filter = {
  and: [
    { field: 'status', operator: 'eq', value: 'active', type: 'string' },
    {
      or: [
        { field: 'amount', operator: 'gt', value: 100, type: 'number' },
        { field: 'amount', operator: 'lt', value: 10, type: 'number' }
      ]
    }
  ]
};

const whereClause = buildSequelizeWhere(filter);
```

### 3. Implicit AND with array of filters

```javascript
import { buildSequelizeWhere } from 'sequelize-query-filter-builder';

const filters = [
  { field: 'status', operator: 'eq', value: 'active', type: 'string' },
  { field: 'amount', operator: 'gt', value: 100, type: 'number' }
];

const whereClause = buildSequelizeWhere(filters);
// Equivalent to: { [Op.and]: [ ... ] }
```

### 4. Raw SQL WHERE clause (named params)

```javascript
import { buildRawQueryFromFilter } from 'sequelize-query-filter-builder';

const filter = {
  field: 'created_at',
  operator: 'between',
  value: ['2023-01-01', '2023-01-31'],
  type: 'date'
};

const { where, params } = buildRawQueryFromFilter(filter);
// db.query(`SELECT * FROM table WHERE ${where}`, { replacements: params });
```

## API

### Filter Object

- `field`: Column name (string)
- `operator`: One of `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `like`, `notLike`, `iLike`, `notILike`, `in`, `notIn`, `between`, `notBetween`, `is`, `not`
- `value`: Value to compare (type depends on `type`)
- `type`: `string`, `number`, `int`, `boolean`, `date`

Compound logic:
- `and`: Array of filter objects
- `or`: Array of filter objects

**Implicit AND:**  
Passing an array of filter objects is treated as an implicit `AND` condition.

### Functions

- `buildSequelizeWhere(filter)`: Returns a Sequelize-compatible `where` object.
- `buildRawQueryFromFilter(filter)`: Returns `{ where, params }` for raw SQL queries (named parameters).

## JSDoc Support

This package uses [JSDoc](https://jsdoc.app/) for inline documentation of its API.  
You can generate HTML documentation by running:

```bash
npx jsdoc index.js
```

Or view type hints and documentation in supported editors.

Main exported functions are documented with JSDoc comments:
- `buildSequelizeWhere(filter)`
- `buildRawQueryFromFilter(filter)`
- `validateFilterObject(filter)`
- `coerceValue(value, type)`

## Extending

Add new operators or types by updating the operator map and allowed types in the source.

## Testing

Run tests with:

```bash
npm test
```

## License

MIT
