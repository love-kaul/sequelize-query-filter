import chai from 'chai';
const expect = chai.expect;
const should = chai.should();
import { buildSequelizeWhere, buildRawQueryFromFilter, validateFilterObject, coerceValue } from './index.js';
import { Op } from 'sequelize';

describe('sequelize-filter', () => {
  describe('validateFilterObject', () => {
    it('should throw error for non-object filter', () => {
      expect(() => buildSequelizeWhere(null)).to.throw();
      expect(() => buildSequelizeWhere('string')).to.throw();
    });

    it('should throw error for missing required fields', () => {
      expect(() => buildSequelizeWhere({ field: 'a', operator: 'eq', value: 1 })).to.throw(/Missing required field/);
    });

    it('should throw error for extra fields', () => {
      expect(() => buildSequelizeWhere({ field: 'a', operator: 'eq', value: 1, type: 'number', extra: 1 })).to.throw(/Unexpected field/);
    });

    it('should throw error for unsupported operator', () => {
      expect(() => buildSequelizeWhere({ field: 'a', operator: 'bad', value: 1, type: 'number' })).to.throw(/Unsupported "operator"/);
    });

    it('should throw error for unsupported type', () => {
      expect(() => buildSequelizeWhere({ field: 'a', operator: 'eq', value: 1, type: 'badtype' })).to.throw(/Unsupported "type"/);
    });

    it('should throw error for missing value', () => {
      expect(() => buildSequelizeWhere({ field: 'a', operator: 'eq', type: 'number' })).to.throw(/Missing required field\(s\): value/);
    });

    it('should throw error for between operator with wrong value', () => {
      expect(() => buildSequelizeWhere({ field: 'a', operator: 'between', value: [1], type: 'number' })).to.throw(/requires a 2-element array/);
    });

    it('should throw error for in operator with non-array value', () => {
      expect(() => buildSequelizeWhere({ field: 'a', operator: 'in', value: 1, type: 'number' })).to.throw(/requires an array/);
    });

    it('should validate compound and/or logic', () => {
      const filter = {
        and: [
          { field: 'a', operator: 'eq', value: 1, type: 'number' },
          { field: 'b', operator: 'eq', value: 2, type: 'number' }
        ]
      };
      expect(() => buildSequelizeWhere(filter)).to.not.throw();
    });

    it('should throw error for compound logic with extra keys', () => {
      const filter = { and: [], extra: 1 };
      expect(() => buildSequelizeWhere(filter)).to.throw(/Invalid key/);
    });
  });

  describe('coerceValue', () => {
    it('should coerce number and int types', () => {
      coerceValue('42', 'number').should.equal(42);
      coerceValue('42', 'int').should.equal(42);
    });

    it('should throw error for invalid number', () => {
      expect(() => coerceValue('notnum', 'number')).to.throw(/Invalid number/);
    });

    it('should coerce boolean types', () => {
      coerceValue('true', 'boolean').should.equal(true);
      coerceValue(false, 'boolean').should.equal(false);
    });

    it('should coerce date types', () => {
      coerceValue('2022-06-08', 'date').should.equal('2022-06-08');
    });

    it('should throw error for invalid date', () => {
      expect(() => coerceValue('bad-date', 'date')).to.throw(/Invalid date/);
    });

    it('should coerce string types', () => {
      coerceValue(123, 'string').should.equal('123');
    });
  });

  describe('buildSequelizeWhere', () => {
    it('should build simple eq filter', () => {
      const filter = { field: 'a', operator: 'eq', value: 1, type: 'number' };
      const result = buildSequelizeWhere(filter);
      result.should.have.property('a');
      result.a.should.have.property(Op.eq).equal(1);
    });

    it('should build between filter', () => {
      const filter = { field: 'a', operator: 'between', value: [1, 2], type: 'number' };
      const result = buildSequelizeWhere(filter);
      result.should.have.property('a');
      result.a.should.have.property(Op.between).eql([1, 2]);
    });

    it('should build in filter', () => {
      const filter = { field: 'a', operator: 'in', value: [1, 2], type: 'number' };
      const result = buildSequelizeWhere(filter);
      result.should.have.property('a');
      result.a.should.have.property(Op.in).eql([1, 2]);
    });

    it('should build compound and/or filter', () => {
      const filter = {
        or: [
          { field: 'a', operator: 'eq', value: 1, type: 'number' },
          { field: 'b', operator: 'eq', value: 2, type: 'number' }
        ]
      };
      const result = buildSequelizeWhere(filter);
      result.should.have.property(Op.or);
    });

    it('should build nested compound filter', () => {
      const filter = {
        and: [
          { field: 'a', operator: 'eq', value: 1, type: 'number' },
          {
            or: [
              { field: 'b', operator: 'eq', value: 2, type: 'number' },
              { field: 'c', operator: 'eq', value: 3, type: 'number' }
            ]
          }
        ]
      };
      const result = buildSequelizeWhere(filter);
      result.should.have.property(Op.and);
    });
  });

  describe('buildRawQueryFromFilter', () => {
    it('should build raw query for eq', () => {
      const filter = { field: 'a', operator: 'eq', value: 1, type: 'number' };
      const { where, params } = buildRawQueryFromFilter(filter);
      where.should.include('"a" = :param1');
      params.should.eql({ param1: 1 });
    });

    it('should build raw query for between', () => {
      const filter = { field: 'a', operator: 'between', value: [1, 2], type: 'number' };
      const { where, params } = buildRawQueryFromFilter(filter);
      where.should.include('BETWEEN');
      params.should.eql({ param1: 1, param2: 2 });
    });

    it('should build raw query for in', () => {
      const filter = { field: 'a', operator: 'in', value: [1, 2], type: 'number' };
      const { where, params } = buildRawQueryFromFilter(filter);
      where.should.include('IN');
      params.should.have.property('param1').equal(1);
      params.should.have.property('param2').equal(2);
    });

    it('should build raw query for compound and/or', () => {
      const filter = {
        and: [
          { field: 'a', operator: 'eq', value: 1, type: 'number' },
          {
            or: [
              { field: 'b', operator: 'eq', value: 2, type: 'number' },
              { field: 'c', operator: 'eq', value: 3, type: 'number' }
            ]
          }
        ]
      };
      const { where, params } = buildRawQueryFromFilter(filter);
      where.should.include('AND');
      where.should.include('OR');
      params.should.have.property('param1').equal(1);
      params.should.have.property('param2').equal(2);
      params.should.have.property('param3').equal(3);
    });

    it('should throw error for invalid identifier', () => {
      const filter = { field: 'bad field', operator: 'eq', value: 1, type: 'number' };
      expect(() => buildRawQueryFromFilter(filter)).to.throw(/Invalid identifier/);
    });
  });
});
