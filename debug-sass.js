// Debug script to check SASS parsing from NCU report
import { NcuParser } from './src/ncu-parser.js';
import * as fs from 'fs';

async function main() {
  const filePath = process.argv[2] || './pytorch.ncu-rep';
  console.log(`Reading ${filePath}...`);

  const buffer = fs.readFileSync(filePath);

  // Temporarily patch the parser to get raw ProfileResult and fields
  const originalDecodeProfileResult = NcuParser.decodeProfileResult;
  let rawProfileResult = null;
  let rawFields = null;
  NcuParser.decodeProfileResult = function(data) {
    const fields = NcuParser.Protobuf.parseFields(data);
    if (!rawFields) {
      rawFields = fields;
      console.log('\n=== All ProfileResult Field Numbers ===');
      const fieldNums = [...new Set(fields.map(f => f.fieldNumber))].sort((a,b) => a-b);
      console.log('Field numbers present:', fieldNums.join(', '));

      // Focus on unknown fields that might contain source data
      console.log('\n=== Checking UNKNOWN fields (14-16, 31, 35) for source data ===');
      const unknownFields = fields.filter(f => [14, 15, 16, 31, 35].includes(f.fieldNumber));

      unknownFields.forEach((f, idx) => {
        console.log(`\nField ${f.fieldNumber} (wireType: ${f.wireType}, length: ${f.value instanceof Uint8Array ? f.value.length : 'N/A'}):`);

        if (f.wireType === 2 && f.value instanceof Uint8Array) {
          // Try to decode as nested protobuf
          try {
            const nestedFields = NcuParser.Protobuf.parseFields(f.value);
            console.log(`  Nested fields: ${nestedFields.map(nf => `${nf.fieldNumber}=${nf.wireType}`).join(', ')}`);

            // Check if this looks like SourceLine
            const f1 = nestedFields.find(nf => nf.fieldNumber === 1);
            const f2 = nestedFields.find(nf => nf.fieldNumber === 2);
            const f3 = nestedFields.find(nf => nf.fieldNumber === 3);

            if (f1 && f2 && f3) {
              console.log(`  >>> Possible SourceLine structure! <<<`);
              const addr = f1.wireType === 0 ? f1.value : NcuParser.Protobuf.toString(f1.value);
              const sass = f2.wireType === 2 ? NcuParser.Protobuf.toString(f2.value) : f2.value;
              const ptx = f3.wireType === 2 ? NcuParser.Protobuf.toString(f3.value) : f3.value;
              console.log(`  Address: ${addr}`);
              console.log(`  SASS: "${sass}"`);
              console.log(`  PTX: "${ptx}"`);
            }
          } catch (e) {
            console.log(`  Error decoding: ${e.message}`);
          }
        } else if (f.wireType === 0) {
          console.log(`  Value (varint): ${f.value}`);
        }
      });

      // Also check if field 14 is repeated and contains source data
      const field14s = fields.filter(f => f.fieldNumber === 14);
      console.log(`\n=== Field 14 count: ${field14s.length} ===`);
      if (field14s.length > 0 && field14s.length < 10) {
        field14s.forEach((f, i) => {
          if (f.wireType === 2 && f.value instanceof Uint8Array) {
            try {
              const nestedFields = NcuParser.Protobuf.parseFields(f.value);
              const f1 = nestedFields.find(nf => nf.fieldNumber === 1);
              const f2 = nestedFields.find(nf => nf.fieldNumber === 2);
              const f3 = nestedFields.find(nf => nf.fieldNumber === 3);
              if (f1 && f2) {
                const addr = f1.wireType === 0 ? `0x${f1.value.toString(16)}` : NcuParser.Protobuf.toString(f1.value);
                const sass = f2.wireType === 2 ? NcuParser.Protobuf.toString(f2.value) : String(f2.value);
                console.log(`  [${i}] Address: ${addr}, SASS: "${sass.substring(0, 60)}"`);
              }
            } catch (e) {}
          }
        });
      }
    }
    const result = originalDecodeProfileResult.call(this, data);
    if (!rawProfileResult) rawProfileResult = result;
    return result;
  };

  const result = await NcuParser.parseFile(buffer.buffer, (msg) => {
    // console.log(`Progress: ${msg}`);
  });

  NcuParser.decodeProfileResult = originalDecodeProfileResult;

  console.log(`\nFound ${result.kernels.length} kernels`);

  // Check raw ProfileResult
  if (rawProfileResult) {
    console.log(`\n=== Raw ProfileResult Analysis ===`);
    console.log(`sourceLines array length: ${rawProfileResult.sourceLines?.length || 0}`);

    if (rawProfileResult.sourceLines && rawProfileResult.sourceLines.length > 0) {
      console.log(`\nFirst 3 raw source lines:`);
      for (let i = 0; i < Math.min(3, rawProfileResult.sourceLines.length); i++) {
        const sl = rawProfileResult.sourceLines[i];
        console.log(`\nRaw Line ${i}:`);
        console.log(`  Address: ${sl.address?.toString(16) || 'N/A'}`);
        console.log(`  SASS: "${sl.sass || ''}"`);
        console.log(`  PTX: "${sl.ptx || ''}"`);
        console.log(`  Locator: ${JSON.stringify(sl.locator)}`);
      }
    }
  }

  // Check first kernel's source
  if (result.kernels.length > 0) {
    const kernel = result.kernels[0];
    console.log(`\n=== Transformed Kernel ===`);
    console.log(`Kernel: ${kernel.name.substring(0, 100)}...`);
    console.log(`Source lines: ${kernel.source.length}`);

    if (kernel.source.length > 0) {
      console.log(`\nFirst 5 source lines:`);
      for (let i = 0; i < Math.min(5, kernel.source.length); i++) {
        const line = kernel.source[i];
        console.log(`\nLine ${i}:`);
        console.log(`  Address: ${line.address}`);
        console.log(`  SASS: "${line.sass}"`);
        console.log(`  PTX: "${line.ptx}"`);
        console.log(`  File: "${line.file}"`);
        console.log(`  Line number: ${line.line}`);
      }
    } else {
      console.log('No source lines in transformed kernel!');
    }
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
