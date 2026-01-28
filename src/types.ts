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
  fallback?: any;
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

export interface Transform {
  type: TransformType;
  params?: any;
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
