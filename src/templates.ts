import { parse } from 'yaml';
import type { Template } from './types.js';
import { validateTemplate } from './validator.js';

interface BuiltinTemplate extends Template {
  example: string;
}

const BUILTIN_TEMPLATES: Record<string, BuiltinTemplate> = {
  'hn-frontpage': {
    name: 'Hacker News Frontpage',
    description: 'Extract stories from Hacker News frontpage',
    example: 'https://news.ycombinator.com',
    container: '.athing',
    fields: [
      {
        name: 'title',
        selector: '.titleline > a',
        type: 'text'
      },
      {
        name: 'url',
        selector: '.titleline > a',
        type: 'url',
        attr: 'href'
      },
      {
        name: 'points',
        selector: '~ tr .score',
        type: 'number',
        transforms: [
          { type: 'regex', params: { pattern: '(\\d+)', group: 1 } },
          { type: 'parseInt' }
        ]
      },
      {
        name: 'author',
        selector: '~ tr .hnuser',
        type: 'text'
      }
    ]
  },
  'amazon-product': {
    name: 'Amazon Product',
    description: 'Extract product details from Amazon',
    example: 'https://amazon.com/s?k=laptop',
    container: '[data-component-type="s-search-result"]',
    fields: [
      {
        name: 'title',
        selector: 'h2 a span',
        type: 'text'
      },
      {
        name: 'price',
        selector: '.a-price-whole',
        type: 'currency',
        transforms: [{ type: 'trim' }]
      },
      {
        name: 'rating',
        selector: '.a-icon-star-small .a-icon-alt',
        type: 'number',
        transforms: [
          { type: 'regex', params: { pattern: '([\\d.]+)', group: 1 } },
          { type: 'parseFloat' }
        ]
      },
      {
        name: 'url',
        selector: 'h2 a',
        type: 'url',
        attr: 'href'
      }
    ]
  },
  'reddit-subreddit': {
    name: 'Reddit Subreddit',
    description: 'Extract posts from a subreddit',
    example: 'https://reddit.com/r/programming',
    container: 'shreddit-post',
    fields: [
      {
        name: 'title',
        selector: '[slot="title"]',
        type: 'text'
      },
      {
        name: 'author',
        selector: '[slot="authorName"]',
        type: 'text'
      },
      {
        name: 'score',
        selector: 'shreddit-post',
        type: 'number',
        attr: 'score'
      },
      {
        name: 'url',
        selector: '[slot="title"]',
        type: 'url',
        attr: 'href'
      }
    ]
  }
};

export async function loadTemplate(templatePath: string, _isLocal?: boolean): Promise<Template> {
  // Built-in template (@ prefix takes precedence)
  if (templatePath.startsWith('@')) {
    const templateName = templatePath.substring(1);
    const template = BUILTIN_TEMPLATES[templateName];
    if (!template) {
      const available = Object.keys(BUILTIN_TEMPLATES).join(', ');
      throw new Error(`Built-in template not found: ${templateName}. Available: ${available}`);
    }
    return template;
  }

  // Local file
  const file = Bun.file(templatePath);
  if (!await file.exists()) {
    throw new Error(`Template file not found: ${templatePath}`);
  }

  const content = await file.text();
  const parsed = parse(content);

  // Runtime validation of YAML content
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Template file must contain a valid YAML object');
  }

  const template = parsed as Template;

  // Validate template structure
  const errors = validateTemplate(template);
  if (errors.length > 0) {
    throw new Error(`Invalid template: ${errors.join('; ')}`);
  }

  return template;
}

export function listTemplates() {
  return Object.entries(BUILTIN_TEMPLATES).map(([id, tmpl]) => ({
    id,
    name: tmpl.name,
    description: tmpl.description || '',
    example: tmpl.example
  }));
}
