import type { Template } from './types.js';

export function validateTemplate(template: Template): string[] {
  const errors: string[] = [];

  if (!template.name) {
    errors.push('Template must have a name');
  }

  if (!template.container) {
    errors.push('Template must have a container selector');
  }

  if (!template.fields || template.fields.length === 0) {
    errors.push('Template must have at least one field');
  }

  template.fields?.forEach((field, idx) => {
    if (!field.name) {
      errors.push(`Field at index ${idx} must have a name`);
    }
    if (!field.selector) {
      errors.push(`Field "${field.name || idx}" must have a selector`);
    }

    // Validate nested fields
    if (field.nested) {
      field.nested.forEach((nested, nIdx) => {
        if (!nested.name) {
          errors.push(`Nested field at ${field.name}[${nIdx}] must have a name`);
        }
        if (!nested.selector) {
          errors.push(`Nested field "${nested.name || nIdx}" must have a selector`);
        }
      });
    }
  });

  return errors;
}
