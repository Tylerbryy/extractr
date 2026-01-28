import { describe, test, expect } from 'bun:test';
import { validateUrl } from './extractor.js';
import { ExtractionError, RETRYABLE_ERRORS } from './types.js';

describe('validateUrl', () => {
  test('accepts valid https URLs', () => {
    const result = validateUrl('https://example.com');
    expect(result.valid).toBe(true);
    expect(result.normalized).toBe('https://example.com/');
  });

  test('accepts valid http URLs', () => {
    const result = validateUrl('http://example.com');
    expect(result.valid).toBe(true);
    expect(result.normalized).toBe('http://example.com/');
  });

  test('adds https protocol if missing', () => {
    const result = validateUrl('example.com');
    expect(result.valid).toBe(true);
    expect(result.normalized).toBe('https://example.com/');
  });

  test('handles URLs with paths', () => {
    const result = validateUrl('https://example.com/path/to/page');
    expect(result.valid).toBe(true);
    expect(result.normalized).toBe('https://example.com/path/to/page');
  });

  test('handles URLs with query strings', () => {
    const result = validateUrl('https://example.com/search?q=test');
    expect(result.valid).toBe(true);
    expect(result.normalized).toBe('https://example.com/search?q=test');
  });

  test('trims whitespace', () => {
    const result = validateUrl('  https://example.com  ');
    expect(result.valid).toBe(true);
    expect(result.normalized).toBe('https://example.com/');
  });

  test('rejects empty string', () => {
    const result = validateUrl('');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('empty');
  });

  test('rejects whitespace-only string', () => {
    const result = validateUrl('   ');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('empty');
  });

  test('rejects null/undefined', () => {
    const result = validateUrl(null as unknown as string);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('non-empty string');
  });

  test('rejects invalid URLs', () => {
    const result = validateUrl('not a valid url :::');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid URL');
  });

  test('allows localhost with port', () => {
    const result = validateUrl('http://localhost:3000');
    expect(result.valid).toBe(true);
  });
});

describe('ExtractionError', () => {
  test('creates error with code and context', () => {
    const error = new ExtractionError('Test error', 'TEST_CODE', { foo: 'bar' });
    expect(error.message).toBe('Test error');
    expect(error.code).toBe('TEST_CODE');
    expect(error.context).toEqual({ foo: 'bar' });
    expect(error.recoverable).toBe(false);
  });

  test('creates recoverable error', () => {
    const error = new ExtractionError('Test', 'TEST', {}, true);
    expect(error.recoverable).toBe(true);
  });

  test('has correct name', () => {
    const error = new ExtractionError('Test', 'TEST');
    expect(error.name).toBe('ExtractionError');
  });

  test('is instanceof Error', () => {
    const error = new ExtractionError('Test', 'TEST');
    expect(error instanceof Error).toBe(true);
  });
});

describe('RETRYABLE_ERRORS', () => {
  test('includes common network errors', () => {
    expect(RETRYABLE_ERRORS).toContain('net::ERR_CONNECTION_RESET');
    expect(RETRYABLE_ERRORS).toContain('net::ERR_TIMED_OUT');
    expect(RETRYABLE_ERRORS).toContain('Navigation timeout');
  });

  test('is an array of strings', () => {
    expect(Array.isArray(RETRYABLE_ERRORS)).toBe(true);
    expect(RETRYABLE_ERRORS.length).toBeGreaterThan(0);
    RETRYABLE_ERRORS.forEach(err => {
      expect(typeof err).toBe('string');
    });
  });
});
