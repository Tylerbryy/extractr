import { describe, test, expect } from 'bun:test';

// Test the CSV escape function logic (extracted for testing)
function escapeCsv(value: string): string {
  // Prevent CSV injection (formula injection)
  if (/^[=+\-@\t\r]/.test(value)) {
    value = "'" + value;
  }

  // Quote values containing special characters
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes("'")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

describe('escapeCsv', () => {
  test('returns plain text unchanged', () => {
    expect(escapeCsv('hello')).toBe('hello');
    expect(escapeCsv('simple text')).toBe('simple text');
  });

  test('escapes values with commas', () => {
    expect(escapeCsv('hello, world')).toBe('"hello, world"');
  });

  test('escapes values with double quotes', () => {
    expect(escapeCsv('say "hello"')).toBe('"say ""hello"""');
  });

  test('escapes values with newlines', () => {
    expect(escapeCsv('line1\nline2')).toBe('"line1\nline2"');
  });

  test('prevents formula injection with =', () => {
    expect(escapeCsv('=SUM(A1:A10)')).toBe("\"'=SUM(A1:A10)\"");
  });

  test('prevents formula injection with +', () => {
    expect(escapeCsv('+1234567890')).toBe("\"'+1234567890\"");
  });

  test('prevents formula injection with -', () => {
    expect(escapeCsv('-1+2')).toBe("\"'-1+2\"");
  });

  test('prevents formula injection with @', () => {
    expect(escapeCsv('@SUM(A1)')).toBe("\"'@SUM(A1)\"");
  });

  test('prevents formula injection with tab', () => {
    expect(escapeCsv('\t=cmd|...')).toBe("\"'\t=cmd|...\"");
  });

  test('handles combined special characters', () => {
    const result = escapeCsv('=1+1, "test"');
    expect(result.startsWith('"')).toBe(true);
    expect(result.includes("'=")).toBe(true);
  });
});

describe('CSV output format', () => {
  function formatCsv(data: Record<string, unknown>[]): string {
    if (data.length === 0) return '';
    const firstItem = data[0];
    if (!firstItem) return '';
    const headers = Object.keys(firstItem);
    const csvLines = [headers.map(h => escapeCsv(h)).join(',')];
    data.forEach(row => {
      csvLines.push(headers.map(h => escapeCsv(String(row[h] ?? ''))).join(','));
    });
    return csvLines.join('\n');
  }

  test('generates correct CSV headers', () => {
    const data = [{ name: 'John', age: 30 }];
    const csv = formatCsv(data);
    expect(csv.startsWith('name,age')).toBe(true);
  });

  test('handles empty data', () => {
    expect(formatCsv([])).toBe('');
  });

  test('handles null/undefined values', () => {
    const data = [{ name: 'John', age: null }];
    const csv = formatCsv(data);
    expect(csv).toContain('John');
  });

  test('escapes malicious values in data', () => {
    const data = [{ name: '=HYPERLINK("http://evil.com","Click")' }];
    const csv = formatCsv(data);
    expect(csv.includes("'=")).toBe(true);
  });
});
