// Search for SASS instruction strings in the binary to find their location
import { NcuParser } from './src/ncu-parser.js';
import * as fs from 'fs';

async function main() {
  const buffer = fs.readFileSync('./pytorch.ncu-rep');
  const bytes = new Uint8Array(buffer);

  // Search for full SASS instruction patterns (with registers and operands)
  const sassPatterns = ['LDC R', 'LDCU UR', 'c[0x0]', '0x325b66', 'R28, c'];

  console.log('Searching for complete SASS instruction strings in binary...\n');

  for (const pattern of sassPatterns) {
    const patternBytes = new TextEncoder().encode(pattern);

    for (let i = 0; i < bytes.length - patternBytes.length; i++) {
      let match = true;
      for (let j = 0; j < patternBytes.length; j++) {
        if (bytes[i + j] !== patternBytes[j]) {
          match = false;
          break;
        }
      }

      if (match) {
        // Found a match! Extract context
        const contextStart = Math.max(0, i - 50);
        const contextEnd = Math.min(bytes.length, i + 100);
        const context = bytes.slice(contextStart, contextEnd);

        console.log(`Found "${pattern}" at offset ${i} (0x${i.toString(16)})`);
        console.log('Context (as text):');
        const text = new TextDecoder('utf-8', { fatal: false }).decode(context);
        console.log(text.substring(0, 150));
        console.log('\nContext (hex):');
        console.log(Array.from(context.slice(0, 80)).map(b => b.toString(16).padStart(2, '0')).join(' '));
        console.log('\n---\n');

        // Only show first few matches per pattern
        break;
      }
    }
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
