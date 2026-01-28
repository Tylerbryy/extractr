// Extracted data item type - replaces `any` for type safety
export type ExtractedItem = Record<string, unknown>;

export interface Template {
  name: string;
  description?: string;
  container: string;
  fields: FieldDefinition[];
  pagination?: PaginationConfig;
  options?: TemplateOptions;
}

export interface FieldDefinition {
  name: string;
  selector: string;
  type?: FieldType;
  attr?: string;
  transforms?: Transform[];
  fallback?: unknown;
  nested?: FieldDefinition[];
}

export type FieldType =
  | 'text'
  | 'number'
  | 'currency'
  | 'date'
  | 'boolean'
  | 'list'
  | 'nested'
  | 'html'
  | 'url';

// Valid field types as array for runtime validation
export const FIELD_TYPES: readonly FieldType[] = [
  'text', 'number', 'currency', 'date', 'boolean', 'list', 'nested', 'html', 'url'
] as const;

export interface Transform {
  type: TransformType;
  params?: TransformParams;
}

// Typed transform params - uses index signature for browser context compatibility
export interface TransformParams {
  pattern?: string;
  flags?: string;
  replacement?: string;
  group?: number;
  separator?: string;
  start?: number;
  end?: number;
  [key: string]: string | number | undefined;
}

export type TransformType =
  | 'trim'
  | 'lowercase'
  | 'uppercase'
  | 'replace'
  | 'regex'
  | 'split'
  | 'slice'
  | 'parseInt'
  | 'parseFloat';

// Valid transform types as array for runtime validation
export const TRANSFORM_TYPES: readonly TransformType[] = [
  'trim', 'lowercase', 'uppercase', 'replace', 'regex', 'split', 'slice', 'parseInt', 'parseFloat'
] as const;

// Transforms that require specific params
export const TRANSFORMS_REQUIRING_PATTERN: readonly TransformType[] = ['replace', 'regex'] as const;
export const TRANSFORMS_REQUIRING_SEPARATOR: readonly TransformType[] = ['split'] as const;

export interface PaginationConfig {
  nextSelector: string;
  maxPages?: number;
  waitMs?: number;
}

export interface TemplateOptions {
  waitForSelector?: string;
  waitMs?: number;
  enableJs?: boolean;
  timeout?: number;
}

export interface ExtractorOptions {
  debug?: boolean;
}

// Default constants - avoid magic numbers
export const DEFAULTS = {
  SELECTOR_TIMEOUT: 10_000,
  PAGE_TIMEOUT: 30_000,
  MAX_PAGES: 1,
  PAGINATION_WAIT_MS: 2_000,
  REGEX_MAX_LENGTH: 500,
} as const;

export interface ExtractionResult {
  data: any[];
  debug?: DebugInfo;
}

export interface DebugInfo {
  itemsFound: number;
  fieldsExtracted: number;
  errors: string[];
  samples: any[];
}
