import { chromium, type Page, type Browser } from 'playwright';
import type { Template, ExtractorOptions, ExtractedItem } from './types.js';
import { DEFAULTS } from './types.js';
import { validateTemplate, isRegexSafe } from './validator.js';

/**
 * Extracts data from a URL using the provided template.
 * Validates the template before extraction to prevent runtime errors.
 */
export async function extractData(
  url: string,
  template: Template,
  options: ExtractorOptions = {}
): Promise<ExtractedItem[]> {
  // Validate template before extraction
  const validationErrors = validateTemplate(template);
  if (validationErrors.length > 0) {
    throw new Error(`Invalid template: ${validationErrors.join('; ')}`);
  }

  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    const enableJs = template.options?.enableJs ?? true;
    const timeout = template.options?.timeout ?? DEFAULTS.PAGE_TIMEOUT;

    await page.goto(url, {
      waitUntil: enableJs ? 'networkidle' : 'domcontentloaded',
      timeout
    });

    if (template.options?.waitForSelector) {
      await page.waitForSelector(template.options.waitForSelector, {
        timeout: DEFAULTS.SELECTOR_TIMEOUT
      });
    }

    if (template.options?.waitMs) {
      await page.waitForTimeout(template.options.waitMs);
    }

    const allData: ExtractedItem[] = [];
    let pageCount = 0;
    const maxPages = template.pagination?.maxPages ?? DEFAULTS.MAX_PAGES;

    do {
      const pageData = await extractPage(page, template, options);
      allData.push(...pageData);
      pageCount++;

      if (template.pagination && pageCount < maxPages) {
        const hasNext = await page.$(template.pagination.nextSelector);
        if (hasNext) {
          await page.click(template.pagination.nextSelector);
          await page.waitForTimeout(template.pagination.waitMs ?? DEFAULTS.PAGINATION_WAIT_MS);
        } else {
          break;
        }
      } else {
        break;
      }
    } while (pageCount < maxPages);

    return allData;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

async function extractPage(
  page: Page,
  template: Template,
  options: ExtractorOptions
): Promise<ExtractedItem[]> {
  // Serialize fields for browser context, validating regex patterns
  const safeFields = template.fields.map(field => ({
    ...field,
    transforms: field.transforms?.map(t => {
      if (t.params?.pattern && !isRegexSafe(t.params.pattern)) {
        throw new Error(`Unsafe regex pattern in field "${field.name}": ${t.params.pattern}`);
      }
      return t;
    })
  }));

  const data = await page.evaluate(
    ({ container, fields, debug }) => {
      const containers = Array.from(document.querySelectorAll(container));
      const results: Record<string, unknown>[] = [];

      containers.forEach((containerEl) => {
        const item: Record<string, unknown> = {};

        fields.forEach((field: {
          name: string;
          selector: string;
          type?: string;
          attr?: string;
          transforms?: Array<{ type: string; params?: Record<string, unknown> }>;
          fallback?: unknown;
          nested?: unknown[];
        }) => {
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

      function extractField(container: Element, field: {
        name: string;
        selector: string;
        type?: string;
        attr?: string;
        transforms?: Array<{ type: string; params?: Record<string, unknown> }>;
        fallback?: unknown;
        nested?: unknown[];
      }): unknown {
        // Handle nested fields
        if (field.nested && Array.isArray(field.nested)) {
          const nestedItems: Record<string, unknown>[] = [];
          const elements = Array.from(container.querySelectorAll(field.selector));
          elements.forEach(el => {
            const nested: Record<string, unknown> = {};
            (field.nested as Array<{
              name: string;
              selector: string;
              type?: string;
              attr?: string;
              transforms?: Array<{ type: string; params?: Record<string, unknown> }>;
              fallback?: unknown;
              nested?: unknown[];
            }>).forEach((nf) => {
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

        let value: unknown;

        // Extract based on type
        if (field.attr) {
          value = element.getAttribute(field.attr) || '';
        } else if (field.type === 'html') {
          value = element.innerHTML;
        } else {
          value = element.textContent?.trim() || '';
        }

        // Apply transforms
        if (field.transforms && Array.isArray(field.transforms)) {
          value = applyTransforms(value, field.transforms);
        }

        // Type coercion
        value = coerceType(value, field.type);

        return value;
      }

      function applyTransforms(
        value: unknown,
        transforms: Array<{ type: string; params?: Record<string, unknown> }>
      ): unknown {
        let result = value;

        transforms.forEach((transform) => {
          const params = transform.params || {};

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
            case 'replace': {
              const pattern = params.pattern as string;
              const flags = (params.flags as string) || 'g';
              const replacement = (params.replacement as string) || '';
              try {
                result = String(result).replace(new RegExp(pattern, flags), replacement);
              } catch {
                // Invalid regex - return unchanged
              }
              break;
            }
            case 'regex': {
              const pattern = params.pattern as string;
              const group = (params.group as number) || 0;
              try {
                const match = String(result).match(new RegExp(pattern));
                result = match ? (match[group] ?? result) : result;
              } catch {
                // Invalid regex - return unchanged
              }
              break;
            }
            case 'split': {
              const separator = (params.separator as string) || ',';
              result = String(result).split(separator);
              break;
            }
            case 'slice': {
              const start = (params.start as number) || 0;
              const end = params.end as number | undefined;
              result = String(result).slice(start, end);
              break;
            }
            case 'parseInt': {
              const cleaned = String(result).replace(/[^0-9-]/g, '');
              const parsed = parseInt(cleaned, 10);
              result = isNaN(parsed) ? 0 : parsed;
              break;
            }
            case 'parseFloat': {
              const cleaned = String(result).replace(/[^0-9.-]/g, '');
              const parsed = parseFloat(cleaned);
              result = isNaN(parsed) ? 0 : parsed;
              break;
            }
          }
        });

        return result;
      }

      function coerceType(value: unknown, type?: string): unknown {
        if (!type || type === 'text') return value;

        switch (type) {
          case 'number': {
            const cleaned = String(value).replace(/[^0-9.-]/g, '');
            const parsed = parseFloat(cleaned);
            return isNaN(parsed) ? 0 : parsed;
          }
          case 'currency': {
            const cleaned = String(value).replace(/[^0-9.-]/g, '');
            const parsed = parseFloat(cleaned);
            return isNaN(parsed) ? 0 : parsed;
          }
          case 'date': {
            const parsed = new Date(String(value));
            // Check for Invalid Date
            return isNaN(parsed.getTime()) ? null : parsed.toISOString();
          }
          case 'boolean':
            return Boolean(value);
          case 'url': {
            // Make relative URLs absolute
            const strValue = String(value);
            if (strValue && !strValue.startsWith('http')) {
              try {
                return new URL(strValue, window.location.href).href;
              } catch {
                return strValue;
              }
            }
            return strValue;
          }
          default:
            return value;
        }
      }

      return results;
    },
    {
      container: template.container,
      fields: safeFields,
      debug: options.debug
    }
  );

  return data as ExtractedItem[];
}
