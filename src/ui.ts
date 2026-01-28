import type { Template } from './types.js';

export async function renderDebugUI(data: any[], template: Template): Promise<void> {
  // Simple console-based debug UI
  console.log('\n=== Extraction Summary ===');
  console.log(`Template: ${template.name}`);
  console.log(`Items extracted: ${data.length}`);
  console.log(`Fields: ${template.fields.map(f => f.name).join(', ')}`);
  
  console.log('\n=== Sample Data ===');
  const sampleSize = Math.min(3, data.length);
  for (let i = 0; i < sampleSize; i++) {
    console.log(`\nItem ${i + 1}:`);
    console.log(JSON.stringify(data[i], null, 2));
  }
  
  if (data.length > sampleSize) {
    console.log(`\n... and ${data.length - sampleSize} more items`);
  }
}
