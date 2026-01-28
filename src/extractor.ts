import { chromium, type Page } from 'playwright';
import type { Template, FieldDefinition, ExtractorOptions, ExtractionResult, Transform } from './types.js';

export async function extractData(
  url: string,
  template: Template,
  options: ExtractorOptions = {}
): Promise<any[]> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    const enableJs = template.options?.enableJs ?? true;
    const timeout = template.options?.timeout ?? 30000;

    await page.goto(url, {
      waitUntil: enableJs ? 'networkidle' : 'domcontentloaded',
      timeout
    });

    if (template.options?.waitForSelector) {
      await page.waitForSelector(template.options.waitForSelector, { timeout: 10000 });
    }

    if (template.options?.waitMs) {
      await page.waitForTimeout(template.options.waitMs);
    }

    const allData: any[] = [];
    let pageCount = 0;
    const maxPages = template.pagination?.maxPages ?? 1;

    do {
      const pageData = await extractPage(page, template, options);
      allData.push(...pageData);
      pageCount++;

      if (template.pagination && pageCount < maxPages) {
        const hasNext = await page.$(template.pagination.nextSelector);
        if (hasNext) {
          await page.click(template.pagination.nextSelector);
          await page.waitForTimeout(template.pagination.waitMs ?? 2000);
        } else {
          break;
        }
      } else {
        break;
      }
    } while (pageCount < maxPages);

    return allData;
  } finally {
    await browser.close();
  }
}

async function extractPage(page: Page, template: Template, options: ExtractorOptions): Promise<any[]> {
  const data = await page.evaluate(
    ({ container, fields, debug }) => {
      const containers = Array.from(document.querySelectorAll(container));
      const results: any[] = [];

      containers.forEach((containerEl) => {
        const item: any = {};

        fields.forEach((field) => {
          try {
            const value = extractField(containerEl as Element, field);
            item[field.name] = value;
          } catch (err) {
            if (debug) {
              console.error(`Error extracting field ${field.name}:`, err);
            }
            item[field.name] = field.fallback ?? null;
          }
        });

        results.push(item);
      });

      function extractField(container: Element, field: any): any {
        // Handle nested fields
        if (field.nested) {
          const nestedItems: any[] = [];
          const elements = Array.from(container.querySelectorAll(field.selector));
          elements.forEach(el => {
            const nested: any = {};
            field.nested.forEach((nf: any) => {
              nested[nf.name] = extractField(el, nf);
            });
            nestedItems.push(nested);
          });
          return nestedItems;
        }

        let element: Element | null;
        
        // Handle sibling selector (~)
        if (field.selector.startsWith('~ ')) {
          const parent = container.parentElement;
          element = parent?.querySelector(field.selector.substring(2)) || null;
        } else {
          element = container.querySelector(field.selector);
        }

        if (!element) {
          return field.fallback ?? null;
        }

        let value: any;

        // Extract based on type
        if (field.attr) {
          value = element.getAttribute(field.attr) || '';
        } else if (field.type === 'html') {
          value = element.innerHTML;
        } else {
          value = element.textContent?.trim() || '';
        }

        // Apply transforms
        if (field.transforms) {
          value = applyTransforms(value, field.transforms);
        }

        // Type coercion
        value = coerceType(value, field.type);

        return value;
      }

      function applyTransforms(value: any, transforms: any[]): any {
        let result = value;

        transforms.forEach((transform) => {
          switch (transform.type) {
            case 'trim':
              result = String(result).trim();
              break;
            case 'lowercase':
              result = String(result).toLowerCase();
              break;
            case 'uppercase':
              result = String(result).toUpperCase();
              break;
            case 'replace':
              result = String(result).replace(
                new RegExp(transform.params.pattern, transform.params.flags || 'g'),
                transform.params.replacement || ''
              );
              break;
            case 'regex':
              const match = String(result).match(new RegExp(transform.params.pattern));
              result = match ? match[transform.params.group || 0] : result;
              break;
            case 'split':
              result = String(result).split(transform.params.separator || ',');
              break;
            case 'slice':
              const start = transform.params.start || 0;
              const end = transform.params.end;
              result = String(result).slice(start, end);
              break;
            case 'parseInt':
              result = parseInt(String(result).replace(/[^0-9-]/g, ''));
              break;
            case 'parseFloat':
              result = parseFloat(String(result).replace(/[^0-9.-]/g, ''));
              break;
          }
        });

        return result;
      }

      function coerceType(value: any, type?: string): any {
        if (!type || type === 'text') return value;

        switch (type) {
          case 'number':
            return parseFloat(String(value).replace(/[^0-9.-]/g, '')) || 0;
          case 'currency':
            return parseFloat(String(value).replace(/[^0-9.-]/g, '')) || 0;
          case 'date':
            return new Date(value).toISOString();
          case 'boolean':
            return Boolean(value);
          case 'url':
            // Make relative URLs absolute
            if (value && !value.startsWith('http')) {
              return new URL(value, window.location.href).href;
            }
            return value;
          default:
            return value;
        }
      }

      return results;
    },
    {
      container: template.container,
      fields: template.fields,
      debug: options.debug
    }
  );

  return data;
}
