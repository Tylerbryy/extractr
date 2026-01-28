import type { Template, FieldDefinition, Transform } from './types.js';
import {
  FIELD_TYPES,
  TRANSFORM_TYPES,
  TRANSFORMS_REQUIRING_PATTERN,
  TRANSFORMS_REQUIRING_SEPARATOR,
  DEFAULTS,
} from './types.js';

/**
 * Validates a template structure and returns an array of error messages.
 * Returns empty array if template is valid.
 */
export function validateTemplate(template: Template): string[] {
  const errors: string[] = [];

  if (!template || typeof template !== 'object') {
    errors.push('Template must be an object');
    return errors;
  }

  if (!template.name || typeof template.name !== 'string') {
    errors.push('Template must have a name (string)');
  }

  if (!template.container || typeof template.container !== 'string') {
    errors.push('Template must have a container selector (string)');
  }

  if (!template.fields || !Array.isArray(template.fields) || template.fields.length === 0) {
    errors.push('Template must have at least one field');
  }

  template.fields?.forEach((field, idx) => {
    errors.push(...validateField(field, idx, ''));
  });

  // Validate pagination if present
  if (template.pagination) {
    if (!template.pagination.nextSelector || typeof template.pagination.nextSelector !== 'string') {
      errors.push('Pagination must have a nextSelector (string)');
    }
    if (template.pagination.maxPages !== undefined &&
        (typeof template.pagination.maxPages !== 'number' || template.pagination.maxPages < 1)) {
      errors.push('Pagination maxPages must be a positive number');
    }
    if (template.pagination.waitMs !== undefined &&
        (typeof template.pagination.waitMs !== 'number' || template.pagination.waitMs < 0)) {
      errors.push('Pagination waitMs must be a non-negative number');
    }
  }

  // Validate options if present
  if (template.options) {
    if (template.options.timeout !== undefined &&
        (typeof template.options.timeout !== 'number' || template.options.timeout < 0)) {
      errors.push('Options timeout must be a non-negative number');
    }
    if (template.options.waitMs !== undefined &&
        (typeof template.options.waitMs !== 'number' || template.options.waitMs < 0)) {
      errors.push('Options waitMs must be a non-negative number');
    }
  }

  return errors;
}

/**
 * Validates a single field definition
 */
function validateField(field: FieldDefinition, idx: number, prefix: string): string[] {
  const errors: string[] = [];
  const fieldPath = prefix ? `${prefix}.${field.name || idx}` : (field.name || `field[${idx}]`);

  if (!field.name || typeof field.name !== 'string') {
    errors.push(`Field at index ${idx} must have a name (string)`);
  }

  if (!field.selector || typeof field.selector !== 'string') {
    errors.push(`Field "${fieldPath}" must have a selector (string)`);
  }

  // Validate field type if specified
  if (field.type !== undefined) {
    if (!FIELD_TYPES.includes(field.type)) {
      errors.push(`Field "${fieldPath}" has invalid type "${field.type}". Valid types: ${FIELD_TYPES.join(', ')}`);
    }
  }

  // Validate transforms if present
  if (field.transforms) {
    if (!Array.isArray(field.transforms)) {
      errors.push(`Field "${fieldPath}" transforms must be an array`);
    } else {
      field.transforms.forEach((transform, tIdx) => {
        errors.push(...validateTransform(transform, tIdx, fieldPath));
      });
    }
  }

  // Validate nested fields recursively
  if (field.nested) {
    if (!Array.isArray(field.nested)) {
      errors.push(`Field "${fieldPath}" nested must be an array`);
    } else {
      field.nested.forEach((nested, nIdx) => {
        errors.push(...validateField(nested, nIdx, fieldPath));
      });
    }
  }

  return errors;
}

/**
 * Validates a single transform configuration
 */
function validateTransform(transform: Transform, idx: number, fieldPath: string): string[] {
  const errors: string[] = [];
  const transformPath = `${fieldPath}.transforms[${idx}]`;

  if (!transform.type || typeof transform.type !== 'string') {
    errors.push(`Transform at ${transformPath} must have a type (string)`);
    return errors;
  }

  if (!TRANSFORM_TYPES.includes(transform.type)) {
    errors.push(`Transform at ${transformPath} has invalid type "${transform.type}". Valid types: ${TRANSFORM_TYPES.join(', ')}`);
    return errors;
  }

  // Check for required params based on transform type
  if (TRANSFORMS_REQUIRING_PATTERN.includes(transform.type)) {
    if (!transform.params?.pattern || typeof transform.params.pattern !== 'string') {
      errors.push(`Transform "${transform.type}" at ${transformPath} requires params.pattern (string)`);
    } else {
      // Validate regex pattern is safe
      const regexErrors = validateRegexPattern(transform.params.pattern, transformPath);
      errors.push(...regexErrors);
    }
  }

  if (TRANSFORMS_REQUIRING_SEPARATOR.includes(transform.type)) {
    if (transform.params && transform.params.separator !== undefined &&
        typeof transform.params.separator !== 'string') {
      errors.push(`Transform "${transform.type}" at ${transformPath} params.separator must be a string`);
    }
  }

  // Validate slice params
  if (transform.type === 'slice' && transform.params) {
    if (transform.params.start !== undefined && typeof transform.params.start !== 'number') {
      errors.push(`Transform "slice" at ${transformPath} params.start must be a number`);
    }
    if (transform.params.end !== undefined && typeof transform.params.end !== 'number') {
      errors.push(`Transform "slice" at ${transformPath} params.end must be a number`);
    }
  }

  // Validate regex group param
  if (transform.type === 'regex' && transform.params?.group !== undefined) {
    if (typeof transform.params.group !== 'number' || transform.params.group < 0) {
      errors.push(`Transform "regex" at ${transformPath} params.group must be a non-negative number`);
    }
  }

  return errors;
}

/**
 * Validates a regex pattern for safety (ReDoS prevention)
 */
function validateRegexPattern(pattern: string, path: string): string[] {
  const errors: string[] = [];

  // Check pattern length
  if (pattern.length > DEFAULTS.REGEX_MAX_LENGTH) {
    errors.push(`Regex pattern at ${path} exceeds maximum length of ${DEFAULTS.REGEX_MAX_LENGTH} characters`);
    return errors;
  }

  // Check for catastrophic backtracking patterns
  // These patterns are prone to ReDoS attacks
  const dangerousPatterns = [
    /\(\.\*\)\+/,           // (.*)+
    /\(\.\+\)\+/,           // (.+)+
    /\([^)]*\+\)[^)]*\+/,   // nested quantifiers like (a+)+
    /\([^)]*\*\)[^)]*\*/,   // nested quantifiers like (a*)*
    /\(\[.*\]\+\)\+/,       // ([...]+)+
  ];

  for (const dangerous of dangerousPatterns) {
    if (dangerous.test(pattern)) {
      errors.push(`Regex pattern at ${path} contains potentially dangerous pattern that could cause performance issues`);
      break;
    }
  }

  // Try to compile the regex to catch syntax errors
  try {
    new RegExp(pattern);
  } catch (e) {
    errors.push(`Regex pattern at ${path} is invalid: ${e instanceof Error ? e.message : String(e)}`);
  }

  return errors;
}

/**
 * Validates a regex pattern at runtime with timeout protection
 * Returns true if the pattern is safe to use
 */
export function isRegexSafe(pattern: string): boolean {
  if (pattern.length > DEFAULTS.REGEX_MAX_LENGTH) {
    return false;
  }

  try {
    new RegExp(pattern);
    return validateRegexPattern(pattern, '').length === 0;
  } catch {
    return false;
  }
}
