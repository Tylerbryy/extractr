import { describe, test, expect } from 'bun:test';
import { loadTemplate, listTemplates } from './templates.js';

describe('loadTemplate', () => {
  test('loads built-in hn-frontpage template', async () => {
    const template = await loadTemplate('@hn-frontpage');
    expect(template.name).toBe('Hacker News Frontpage');
    expect(template.container).toBe('.athing');
    expect(template.fields.length).toBeGreaterThan(0);
  });

  test('loads built-in amazon-product template', async () => {
    const template = await loadTemplate('@amazon-product');
    expect(template.name).toBe('Amazon Product');
    expect(template.fields.some(f => f.name === 'title')).toBe(true);
  });

  test('loads built-in reddit-subreddit template', async () => {
    const template = await loadTemplate('@reddit-subreddit');
    expect(template.name).toBe('Reddit Subreddit');
  });

  test('throws for unknown built-in template', async () => {
    await expect(loadTemplate('@nonexistent')).rejects.toThrow('Built-in template not found');
  });

  test('throws for missing local file', async () => {
    await expect(loadTemplate('/nonexistent/path.yaml')).rejects.toThrow('Template file not found');
  });
});

describe('listTemplates', () => {
  test('returns array of template info', () => {
    const templates = listTemplates();
    expect(Array.isArray(templates)).toBe(true);
    expect(templates.length).toBeGreaterThan(0);
  });

  test('each template has required properties', () => {
    const templates = listTemplates();
    for (const tmpl of templates) {
      expect(tmpl).toHaveProperty('id');
      expect(tmpl).toHaveProperty('name');
      expect(tmpl).toHaveProperty('description');
      expect(tmpl).toHaveProperty('example');
    }
  });

  test('includes hn-frontpage template', () => {
    const templates = listTemplates();
    const hn = templates.find(t => t.id === 'hn-frontpage');
    expect(hn).toBeDefined();
    expect(hn?.example).toContain('news.ycombinator.com');
  });
});
