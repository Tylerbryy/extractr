#!/usr/bin/env bun
import { Command } from 'commander';
import { loadTemplate, listTemplates } from './templates.js';
import { extractData } from './extractor.js';
import { renderDebugUI } from './ui.js';
import { validateTemplate } from './validator.js';
import type { ExtractedItem } from './types.js';

const program = new Command();

program
  .name('extractr')
  .description('Template-based data extraction from web pages')
  .version('0.1.0');

program
  .command('extract')
  .description('Extract data using a template')
  .argument('<url>', 'URL to extract from')
  .argument('<template>', 'Template file or built-in template (e.g., @hn-frontpage)')
  .option('-o, --output <file>', 'Output file path (default: stdout)')
  .option('--format <type>', 'Output format: json, jsonl, csv', 'json')
  .option('--validate', 'Validate template without extracting', false)
  .option('--local', 'Load template from local file', false)
  .option('--debug', 'Debug mode - show detailed extraction info', false)
  .option('-i, --interactive', 'Interactive debug TUI', false)
  .action(async (url, template, options) => {
    try {
      const tmpl = await loadTemplate(template, options.local);

      if (options.validate) {
        const errors = validateTemplate(tmpl);
        if (errors.length > 0) {
          console.error('❌ Template validation failed:');
          errors.forEach(err => console.error(`  - ${err}`));
          process.exit(1);
        }
        console.error('✅ Template is valid');
        return;
      }

      console.error('🔍 Extracting data from:', url);

      const data = await extractData(url, tmpl, {
        debug: options.debug || options.interactive
      });

      if (options.interactive) {
        await renderDebugUI(data, tmpl);
      }

      const output = formatOutput(data, options.format);

      if (options.output) {
        await Bun.write(options.output, output);
        console.error(`✅ Data written to: ${options.output}`);
      } else {
        console.log(output);
      }
    } catch (error) {
      console.error('❌ Error:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

program
  .command('list')
  .description('List available built-in templates')
  .action(() => {
    const templates = listTemplates();
    console.log('Available templates:\n');
    templates.forEach(tmpl => {
      console.log(`  @${tmpl.id}`);
      console.log(`    ${tmpl.description}`);
      console.log(`    Example: extractr extract ${tmpl.example} @${tmpl.id}\n`);
    });
  });

program.parse();

function formatOutput(data: ExtractedItem[], format: string): string {
  switch (format) {
    case 'jsonl':
      return data.map(d => JSON.stringify(d)).join('\n');
    case 'csv':
      if (data.length === 0) return '';
      const firstItem = data[0];
      if (!firstItem) return '';
      const headers = Object.keys(firstItem);
      const csvLines = [headers.map(h => escapeCsv(h)).join(',')];
      data.forEach(row => {
        csvLines.push(headers.map(h => escapeCsv(String(row[h] ?? ''))).join(','));
      });
      return csvLines.join('\n');
    case 'json':
    default:
      return JSON.stringify(data, null, 2);
  }
}

/**
 * Escapes a value for CSV output, preventing CSV injection attacks.
 * Values starting with =, +, -, @, tab, or carriage return are prefixed
 * with a single quote to prevent formula interpretation in spreadsheets.
 */
function escapeCsv(value: string): string {
  // Prevent CSV injection (formula injection)
  // Values starting with these characters can be interpreted as formulas
  if (/^[=+\-@\t\r]/.test(value)) {
    value = "'" + value;
  }

  // Quote values containing special characters
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes("'")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
