import { describe, test, expect } from 'bun:test';
import { validateTemplate, isRegexSafe } from './validator.js';
import type { Template } from './types.js';

describe('validateTemplate', () => {
  test('returns empty array for valid template', () => {
    const template: Template = {
      name: 'Test Template',
      container: '.item',
      fields: [
        { name: 'title', selector: 'h1' }
      ]
    };
    const errors = validateTemplate(template);
    expect(errors).toEqual([]);
  });

  test('requires name', () => {
    const template = {
      container: '.item',
      fields: [{ name: 'title', selector: 'h1' }]
    } as Template;
    const errors = validateTemplate(template);
    expect(errors).toContain('Template must have a name (string)');
  });

  test('requires container', () => {
    const template = {
      name: 'Test',
      fields: [{ name: 'title', selector: 'h1' }]
    } as Template;
    const errors = validateTemplate(template);
    expect(errors).toContain('Template must have a container selector (string)');
  });

  test('requires at least one field', () => {
    const template = {
      name: 'Test',
      container: '.item',
      fields: []
    } as Template;
    const errors = validateTemplate(template);
    expect(errors).toContain('Template must have at least one field');
  });

  test('validates field names', () => {
    const template: Template = {
      name: 'Test',
      container: '.item',
      fields: [{ name: '', selector: 'h1' }]
    };
    const errors = validateTemplate(template);
    expect(errors.some(e => e.includes('must have a name'))).toBe(true);
  });

  test('validates field selectors', () => {
    const template: Template = {
      name: 'Test',
      container: '.item',
      fields: [{ name: 'title', selector: '' }]
    };
    const errors = validateTemplate(template);
    expect(errors.some(e => e.includes('must have a selector'))).toBe(true);
  });

  test('validates field type', () => {
    const template = {
      name: 'Test',
      container: '.item',
      fields: [{ name: 'title', selector: 'h1', type: 'invalid' }]
    } as unknown as Template;
    const errors = validateTemplate(template);
    expect(errors.some(e => e.includes('invalid type'))).toBe(true);
  });

  test('validates transform type', () => {
    const template: Template = {
      name: 'Test',
      container: '.item',
      fields: [{
        name: 'title',
        selector: 'h1',
        transforms: [{ type: 'invalid' as any }]
      }]
    };
    const errors = validateTemplate(template);
    expect(errors.some(e => e.includes('invalid type'))).toBe(true);
  });

  test('validates regex transform requires pattern', () => {
    const template: Template = {
      name: 'Test',
      container: '.item',
      fields: [{
        name: 'title',
        selector: 'h1',
        transforms: [{ type: 'regex' }]
      }]
    };
    const errors = validateTemplate(template);
    expect(errors.some(e => e.includes('requires params.pattern'))).toBe(true);
  });

  test('validates replace transform requires pattern', () => {
    const template: Template = {
      name: 'Test',
      container: '.item',
      fields: [{
        name: 'title',
        selector: 'h1',
        transforms: [{ type: 'replace' }]
      }]
    };
    const errors = validateTemplate(template);
    expect(errors.some(e => e.includes('requires params.pattern'))).toBe(true);
  });

  test('validates nested fields', () => {
    const template: Template = {
      name: 'Test',
      container: '.item',
      fields: [{
        name: 'items',
        selector: '.nested',
        nested: [{ name: '', selector: 'span' }]
      }]
    };
    const errors = validateTemplate(template);
    expect(errors.some(e => e.includes('must have a name'))).toBe(true);
  });

  test('validates pagination', () => {
    const template: Template = {
      name: 'Test',
      container: '.item',
      fields: [{ name: 'title', selector: 'h1' }],
      pagination: { nextSelector: '', maxPages: -1 }
    };
    const errors = validateTemplate(template);
    expect(errors.some(e => e.includes('nextSelector'))).toBe(true);
    expect(errors.some(e => e.includes('maxPages'))).toBe(true);
  });

  test('detects dangerous regex patterns', () => {
    const template: Template = {
      name: 'Test',
      container: '.item',
      fields: [{
        name: 'title',
        selector: 'h1',
        transforms: [{
          type: 'regex',
          params: { pattern: '(.*)+' }
        }]
      }]
    };
    const errors = validateTemplate(template);
    expect(errors.some(e => e.includes('dangerous pattern'))).toBe(true);
  });

  test('detects invalid regex syntax', () => {
    const template: Template = {
      name: 'Test',
      container: '.item',
      fields: [{
        name: 'title',
        selector: 'h1',
        transforms: [{
          type: 'regex',
          params: { pattern: '(unclosed' }
        }]
      }]
    };
    const errors = validateTemplate(template);
    expect(errors.some(e => e.includes('invalid'))).toBe(true);
  });
});

describe('isRegexSafe', () => {
  test('returns true for safe patterns', () => {
    expect(isRegexSafe('\\d+')).toBe(true);
    expect(isRegexSafe('[a-z]+')).toBe(true);
    expect(isRegexSafe('\\w+@\\w+\\.\\w+')).toBe(true);
  });

  test('returns false for dangerous patterns', () => {
    expect(isRegexSafe('(.*)+$')).toBe(false);
    expect(isRegexSafe('(.+)+$')).toBe(false);
  });

  test('returns false for invalid patterns', () => {
    expect(isRegexSafe('(unclosed')).toBe(false);
    expect(isRegexSafe('[unclosed')).toBe(false);
  });

  test('returns false for overly long patterns', () => {
    const longPattern = 'a'.repeat(600);
    expect(isRegexSafe(longPattern)).toBe(false);
  });
});
