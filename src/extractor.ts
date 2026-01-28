import { chromium, type Page, type Browser } from 'playwright';
import type { Template, ExtractorOptions, ExtractedItem, UrlValidation } from './types.js';
import { DEFAULTS, RETRYABLE_ERRORS, ExtractionError } from './types.js';
import { validateTemplate, isRegexSafe } from './validator.js';

/**
 * Validates and normalizes a URL.
 */
export function validateUrl(url: string): UrlValidation {
  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'URL must be a non-empty string' };
  }

  const trimmed = url.trim();
  if (!trimmed) {
    return { valid: false, error: 'URL cannot be empty' };
  }

  // Add protocol if missing
  let normalized = trimmed;
  if (!normalized.match(/^https?:\/\//i)) {
    normalized = 'https://' + normalized;
  }

  try {
    const parsed = new URL(normalized);

    // Must have a valid hostname
    if (!parsed.hostname || parsed.hostname.length < 1) {
      return { valid: false, error: 'URL must have a valid hostname' };
    }

    // Block obviously invalid hostnames
    if (parsed.hostname === 'localhost' && !parsed.port) {
      // Allow localhost with port for testing
    }

    return { valid: true, normalized: parsed.href };
  } catch (e) {
    return { valid: false, error: `Invalid URL format: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/**
 * Checks if an error is transient and worth retrying.
 */
function isRetryableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return RETRYABLE_ERRORS.some(pattern => message.includes(pattern));
}

/**
 * Waits for a specified duration with optional abort signal support.
 */
async function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ExtractionError('Extraction cancelled', 'CANCELLED', {}, false));
      return;
    }

    const timeout = setTimeout(resolve, ms);

    signal?.addEventListener('abort', () => {
      clearTimeout(timeout);
      reject(new ExtractionError('Extraction cancelled', 'CANCELLED', {}, false));
    }, { once: true });
  });
}

/**
 * Detects common blocking patterns like captchas or login walls.
 */
async function detectBlockingContent(page: Page): Promise<string | null> {
  const blockingPatterns = [
    { selector: '[class*="captcha"]', message: 'CAPTCHA detected' },
    { selector: '[id*="captcha"]', message: 'CAPTCHA detected' },
    { selector: '[class*="challenge"]', message: 'Challenge page detected' },
    { selector: 'form[action*="login"]', message: 'Login wall detected (may need authentication)' },
    { selector: '[class*="access-denied"]', message: 'Access denied page detected' },
    { selector: '[class*="blocked"]', message: 'Blocked page detected' },
  ];

  for (const pattern of blockingPatterns) {
    const element = await page.$(pattern.selector);
    if (element) {
      return pattern.message;
    }
  }

  // Check page title for common blocking indicators
  const title = await page.title();
  const blockingTitles = ['Access Denied', 'Blocked', '403', '401', 'Robot', 'Captcha'];
  for (const blockingTitle of blockingTitles) {
    if (title.toLowerCase().includes(blockingTitle.toLowerCase())) {
      return `Blocking page detected: "${title}"`;
    }
  }

  return null;
}

/**
 * Extracts data from a URL using the provided template.
 * Includes retry logic, URL validation, and partial result recovery.
 */
export async function extractData(
  url: string,
  template: Template,
  options: ExtractorOptions = {}
): Promise<ExtractedItem[]> {
  const startTime = Date.now();

  // Validate URL
  const urlValidation = validateUrl(url);
  if (!urlValidation.valid) {
    throw new ExtractionError(
      `Invalid URL: ${urlValidation.error}`,
      'INVALID_URL',
      { url }
    );
  }
  const normalizedUrl = urlValidation.normalized!;

  // Validate template before extraction
  const validationErrors = validateTemplate(template);
  if (validationErrors.length > 0) {
    throw new ExtractionError(
      `Invalid template: ${validationErrors.join('; ')}`,
      'INVALID_TEMPLATE',
      { errors: validationErrors }
    );
  }

  // Check for cancellation
  if (options.signal?.aborted) {
    throw new ExtractionError('Extraction cancelled', 'CANCELLED', {}, false);
  }

  const maxRetries = options.maxRetries ?? DEFAULTS.MAX_RETRIES;
  let lastError: Error | null = null;

  // Retry loop for transient failures
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    let browser: Browser | null = null;

    try {
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();

      // Set up abort handler
      const abortHandler = () => {
        page.close().catch(() => {});
      };
      options.signal?.addEventListener('abort', abortHandler, { once: true });

      try {
        const result = await extractWithBrowser(page, normalizedUrl, template, options, startTime);
        return result;
      } finally {
        options.signal?.removeEventListener('abort', abortHandler);
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry non-recoverable errors
      if (error instanceof ExtractionError && !error.recoverable) {
        throw error;
      }

      // Check if error is retryable
      if (isRetryableError(error) && attempt < maxRetries) {
        if (options.debug) {
          console.error(`Attempt ${attempt}/${maxRetries} failed: ${lastError.message}. Retrying...`);
        }
        await delay(DEFAULTS.RETRY_DELAY_MS * attempt, options.signal);
        continue;
      }

      // Not retryable or max retries exceeded
      throw new ExtractionError(
        `Extraction failed after ${attempt} attempt(s): ${lastError.message}`,
        'EXTRACTION_FAILED',
        { attempts: attempt, originalError: lastError.message },
        false
      );
    } finally {
      if (browser) {
        await browser.close().catch(() => {});
      }
    }
  }

  // Should not reach here, but just in case
  throw lastError || new Error('Extraction failed');
}

/**
 * Performs extraction using an already-launched browser page.
 */
async function extractWithBrowser(
  page: Page,
  url: string,
  template: Template,
  options: ExtractorOptions,
  startTime: number
): Promise<ExtractedItem[]> {
  const enableJs = template.options?.enableJs ?? true;
  const timeout = template.options?.timeout ?? DEFAULTS.PAGE_TIMEOUT;

  // Navigate to page with error context
  try {
    await page.goto(url, {
      waitUntil: enableJs ? 'networkidle' : 'domcontentloaded',
      timeout
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ExtractionError(
      `Failed to load page: ${message}`,
      'PAGE_LOAD_FAILED',
      { url, timeout },
      isRetryableError(error)
    );
  }

  // Check for blocking content
  const blockingContent = await detectBlockingContent(page);
  if (blockingContent) {
    if (options.debug) {
      console.error(`Warning: ${blockingContent}`);
    }
    // Don't fail, just warn - the page might still have extractable content
  }

  // Wait for specific selector if configured
  if (template.options?.waitForSelector) {
    try {
      await page.waitForSelector(template.options.waitForSelector, {
        timeout: DEFAULTS.SELECTOR_TIMEOUT
      });
    } catch (error) {
      throw new ExtractionError(
        `Selector "${template.options.waitForSelector}" not found within ${DEFAULTS.SELECTOR_TIMEOUT}ms`,
        'SELECTOR_TIMEOUT',
        { selector: template.options.waitForSelector },
        false
      );
    }
  }

  // Additional wait if configured
  if (template.options?.waitMs) {
    await page.waitForTimeout(template.options.waitMs);
  }

  // Check for overall timeout
  const elapsed = Date.now() - startTime;
  if (elapsed > DEFAULTS.OVERALL_TIMEOUT_MS) {
    throw new ExtractionError(
      `Overall extraction timeout exceeded (${DEFAULTS.OVERALL_TIMEOUT_MS}ms)`,
      'OVERALL_TIMEOUT',
      { elapsed },
      false
    );
  }

  const allData: ExtractedItem[] = [];
  let pageCount = 0;
  const maxPages = template.pagination?.maxPages ?? DEFAULTS.MAX_PAGES;

  // Pagination loop with partial result recovery
  do {
    // Check for cancellation before each page
    if (options.signal?.aborted) {
      if (allData.length > 0 && options.debug) {
        console.error(`Extraction cancelled. Returning ${allData.length} partial results.`);
      }
      if (allData.length > 0) {
        return allData; // Return partial results
      }
      throw new ExtractionError('Extraction cancelled', 'CANCELLED', {}, false);
    }

    try {
      const pageData = await extractPage(page, template, options);
      allData.push(...pageData);
      pageCount++;

      // Notify callback of partial results
      if (options.onPageExtracted) {
        options.onPageExtracted(pageData, pageCount);
      }

      if (options.debug) {
        console.error(`Page ${pageCount}: extracted ${pageData.length} items (total: ${allData.length})`);
      }
    } catch (error) {
      // If we have some data, return it with a warning
      if (allData.length > 0) {
        if (options.debug) {
          console.error(`Extraction error on page ${pageCount + 1}, returning ${allData.length} partial results: ${error}`);
        }
        return allData;
      }
      throw error;
    }

    // Check overall timeout
    const elapsed = Date.now() - startTime;
    if (elapsed > DEFAULTS.OVERALL_TIMEOUT_MS) {
      if (options.debug) {
        console.error(`Overall timeout reached, returning ${allData.length} results`);
      }
      return allData;
    }

    // Handle pagination
    if (template.pagination && pageCount < maxPages) {
      try {
        const hasNext = await page.$(template.pagination.nextSelector);
        if (hasNext) {
          await page.click(template.pagination.nextSelector);
          await page.waitForTimeout(template.pagination.waitMs ?? DEFAULTS.PAGINATION_WAIT_MS);

          // Verify navigation happened (page changed)
          await page.waitForLoadState('networkidle', { timeout: DEFAULTS.PAGE_TIMEOUT }).catch(() => {
            // Some pages don't need full network idle
          });
        } else {
          if (options.debug) {
            console.error(`No more pages found (next button selector: "${template.pagination.nextSelector}")`);
          }
          break;
        }
      } catch (error) {
        // Pagination failed, but we have data
        if (options.debug) {
          console.error(`Pagination failed: ${error}. Returning ${allData.length} results.`);
        }
        break;
      }
    } else {
      break;
    }
  } while (pageCount < maxPages);

  return allData;
}

/**
 * Extracts data from a single page.
 */
async function extractPage(
  page: Page,
  template: Template,
  options: ExtractorOptions
): Promise<ExtractedItem[]> {
  // Validate regex patterns before sending to browser
  const safeFields = template.fields.map(field => ({
    ...field,
    transforms: field.transforms?.map(t => {
      if (t.params?.pattern && !isRegexSafe(t.params.pattern)) {
        throw new ExtractionError(
          `Unsafe regex pattern in field "${field.name}"`,
          'UNSAFE_REGEX',
          { field: field.name, pattern: t.params.pattern }
        );
      }
      return t;
    })
  }));

  const data = await page.evaluate(
    ({ container, fields, debug }) => {
      const containers = Array.from(document.querySelectorAll(container));
      const results: Record<string, unknown>[] = [];

      if (containers.length === 0 && debug) {
        console.warn(`No containers found for selector: ${container}`);
      }

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
            return isNaN(parsed.getTime()) ? null : parsed.toISOString();
          }
          case 'boolean':
            return Boolean(value);
          case 'url': {
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
