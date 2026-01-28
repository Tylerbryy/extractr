#!/usr/bin/env bun
import { Command } from 'commander';
import { loadTemplate, listTemplates } from './templates.js';
import { extractData } from './extractor.js';
import { renderDebugUI } from './ui.js';
import { validateTemplate } from './validator.js';

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

function formatOutput(data: any[], format: string): string {
  switch (format) {
    case 'jsonl':
      return data.map(d => JSON.stringify(d)).join('\n');
    case 'csv':
      if (data.length === 0) return '';
      const headers = Object.keys(data[0]);
      const csvLines = [headers.join(',')];
      data.forEach(row => {
        csvLines.push(headers.map(h => escapeCsv(String(row[h] || ''))).join(','));
      });
      return csvLines.join('\n');
    case 'json':
    default:
      return JSON.stringify(data, null, 2);
  }
}

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
