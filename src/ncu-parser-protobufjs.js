// ncu-parser-protobufjs.js - Alternative parser using protobuf.js library
// This version uses the protobuf.js Reader API to dynamically decode NCU files

import protobuf from 'protobufjs';

const { Reader } = protobuf;

export const NcuParserProtobufJS = {
  // =========================================================================
  // Generic message decoder using protobuf.js Reader
  // Returns all fields found with their values and types
  // =========================================================================
  decodeMessage(buffer, depth = 0) {
    const reader = Reader.create(buffer);
    const fields = {};
    const indent = '  '.repeat(depth);

    while (reader.pos < reader.len) {
      const tag = reader.uint32();
      const fieldNumber = tag >>> 3;
      const wireType = tag & 7;

      if (!fields[fieldNumber]) {
        fields[fieldNumber] = [];
      }

      let value;
      let valueType;

      try {
        switch (wireType) {
          case 0: // VARINT
            value = reader.uint64();
            valueType = 'varint';
            break;
          case 1: // FIXED64
            value = reader.fixed64();
            valueType = 'fixed64';
            break;
          case 2: // LENGTH_DELIMITED
            const bytes = reader.bytes();
            value = bytes;
            valueType = 'bytes';
            // Try to decode as string
            try {
              const str = new TextDecoder().decode(bytes);
              if (this.isPrintableString(str)) {
                value = { bytes, string: str };
                valueType = 'string';
              }
            } catch (e) {
              // Not a valid string, keep as bytes
            }
            break;
          case 5: // FIXED32
            value = reader.fixed32();
            valueType = 'fixed32';
            break;
          default:
            console.warn(`${indent}Unknown wire type ${wireType} for field ${fieldNumber}`);
            continue;
        }

        fields[fieldNumber].push({ value, wireType, valueType });
      } catch (e) {
        console.error(`${indent}Error reading field ${fieldNumber}:`, e);
        break;
      }
    }

    return fields;
  },

  // Check if a string is printable (for distinguishing strings from binary data)
  isPrintableString(str) {
    if (str.length === 0) return false;
    // Check if most characters are printable
    const printable = str.split('').filter(c => {
      const code = c.charCodeAt(0);
      return (code >= 32 && code <= 126) || code === 9 || code === 10 || code === 13;
    });
    return printable.length / str.length > 0.8;
  },

  // Helper to safely extract bytes from a field value
  getBytes(fieldValue) {
    if (!fieldValue) return null;
    // If it's an object with .bytes (string type), return the bytes
    if (fieldValue.bytes instanceof Uint8Array) return fieldValue.bytes;
    // Otherwise it's already a Uint8Array
    if (fieldValue instanceof Uint8Array) return fieldValue;
    return null;
  },

  // =========================================================================
  // Decode ProfileMetricValue with detailed logging
  // =========================================================================
  decodeMetricValue(buffer) {
    const fields = this.decodeMessage(buffer);

    // Field 1: StringValue
    if (fields[1] && fields[1][0].valueType === 'string') {
      return fields[1][0].value.string;
    }

    // Field 2: FloatValue (fixed32)
    if (fields[2]) {
      const bits = Number(fields[2][0].value);
      const buf = new ArrayBuffer(4);
      new DataView(buf).setUint32(0, bits, true);
      return new DataView(buf).getFloat32(0, true);
    }

    // Field 3: DoubleValue (fixed64)
    if (fields[3]) {
      const val = fields[3][0].value;
      const buf = new ArrayBuffer(8);
      const dv = new DataView(buf);
      // Handle Long object from protobuf.js
      const low = typeof val === 'object' && val.low !== undefined ? val.low : Number(val & 0xFFFFFFFFn);
      const high = typeof val === 'object' && val.high !== undefined ? val.high : Number(val >> 32n);
      dv.setUint32(0, low, true);
      dv.setUint32(4, high, true);
      return dv.getFloat64(0, true);
    }

    // Field 4: Uint32Value
    if (fields[4]) {
      return Number(fields[4][0].value);
    }

    // Field 5: Uint64Value
    if (fields[5]) {
      return Number(fields[5][0].value);
    }

    return null;
  },

  // =========================================================================
  // Decode ProfileMetricResult
  // =========================================================================
  decodeMetricResult(buffer) {
    const fields = this.decodeMessage(buffer);
    const nameId = fields[1] ? Number(fields[1][0].value) : 0;
    let value = null;

    const valueBytes = fields[2] ? this.getBytes(fields[2][0].value) : null;
    if (valueBytes) {
      value = this.decodeMetricValue(valueBytes);
    }

    return { nameId, value };
  },

  // =========================================================================
  // Decode Uint64x3
  // =========================================================================
  decodeUint64x3(buffer) {
    const fields = this.decodeMessage(buffer);
    return {
      X: fields[1] ? Number(fields[1][0].value) : 0,
      Y: fields[2] ? Number(fields[2][0].value) : 0,
      Z: fields[3] ? Number(fields[3][0].value) : 0
    };
  },

  // =========================================================================
  // Decode ProfileResult with detailed field discovery
  // =========================================================================
  decodeProfileResult(buffer, logUnknown = true) {
    const fields = this.decodeMessage(buffer);

    if (logUnknown) {
      console.log('=== ProfileResult Fields Found ===');
      Object.keys(fields).sort((a, b) => Number(a) - Number(b)).forEach(fieldNum => {
        const fieldData = fields[fieldNum];
        console.log(`Field ${fieldNum}: ${fieldData.length} occurrence(s), type: ${fieldData[0].valueType}`);

        // Log sample value for inspection
        if (fieldData[0].valueType === 'string') {
          const sample = fieldData[0].value.string.substring(0, 100);
          console.log(`  Sample: "${sample}${fieldData[0].value.string.length > 100 ? '...' : ''}"`);
        } else if (fieldData[0].valueType === 'varint' || fieldData[0].valueType === 'fixed32' || fieldData[0].valueType === 'fixed64') {
          console.log(`  Value: ${fieldData[0].value}`);
        } else if (fieldData[0].valueType === 'bytes') {
          const bytesData = fieldData[0].value.bytes || fieldData[0].value;
          console.log(`  Bytes length: ${bytesData.length}`);
          // Try to recursively decode
          try {
            const nested = this.decodeMessage(bytesData, 1);
            const nestedFields = Object.keys(nested).map(n => `#${n}`).join(', ');
            console.log(`  Nested fields: ${nestedFields}`);
          } catch (e) {
            // Binary data, not a nested message
          }
        }
      });
      console.log('=================================');
    }

    // Extract known fields
    const kernelMangledName = fields[5] && fields[5][0].valueType === 'string' ? fields[5][0].value.string : '';
    const kernelFunctionName = fields[6] && fields[6][0].valueType === 'string' ? fields[6][0].value.string : '';
    const kernelDemangledName = fields[7] && fields[7][0].valueType === 'string' ? fields[7][0].value.string : '';

    const grid = fields[10] && fields[10][0].value.bytes
      ? this.decodeUint64x3(fields[10][0].value.bytes)
      : { X: 0, Y: 0, Z: 0 };

    const block = fields[11] && fields[11][0].value.bytes
      ? this.decodeUint64x3(fields[11][0].value.bytes)
      : { X: 0, Y: 0, Z: 0 };

    const contextId = fields[22] ? Number(fields[22][0].value) : 0;
    const streamId = fields[23] ? Number(fields[23][0].value) : 0;

    // Field 12: SourceLine (repeated)
    const sourceLines = [];
    if (fields[12]) {
      console.log(`Found ${fields[12].length} SourceLine entries in field 12!`);
      fields[12].forEach((f, idx) => {
        if (f.value.bytes) {
          const sl = this.decodeSourceLine(f.value.bytes, idx === 0);
          sourceLines.push(sl);
        }
      });
    }

    // Field 13: MetricResults (repeated)
    const metricResults = [];
    if (fields[13]) {
      fields[13].forEach(f => {
        if (f.value.bytes) {
          metricResults.push(this.decodeMetricResult(f.value.bytes));
        }
      });
    }

    // Field 17: Sections (repeated)
    const sections = [];
    if (fields[17]) {
      fields[17].forEach(f => {
        if (f.value.bytes) {
          sections.push(this.decodeSection(f.value.bytes));
        }
      });
    }

    // Field 19: RuleResults (repeated)
    const ruleResults = [];
    if (fields[19]) {
      fields[19].forEach(f => {
        if (f.value.bytes) {
          ruleResults.push(this.decodeRuleResult(f.value.bytes));
        }
      });
    }

    return {
      kernelMangledName,
      kernelFunctionName,
      kernelDemangledName,
      grid,
      block,
      contextId,
      streamId,
      sourceLines,
      metricResults,
      sections,
      ruleResults,
      _allFields: fields  // Keep raw field data for inspection
    };
  },

  // =========================================================================
  // Decode SourceLine
  // =========================================================================
  decodeSourceLine(buffer, logDetail = false) {
    const fields = this.decodeMessage(buffer);

    if (logDetail) {
      console.log('=== SourceLine Fields ===');
      Object.keys(fields).forEach(fieldNum => {
        console.log(`  Field ${fieldNum}: ${fields[fieldNum][0].valueType}`);
      });
    }

    const address = fields[1] ? fields[1][0].value : 0n;
    const sass = fields[2] && fields[2][0].valueType === 'string' ? fields[2][0].value.string : '';
    const ptx = fields[3] && fields[3][0].valueType === 'string' ? fields[3][0].value.string : '';

    let locator = null;
    if (fields[5] && fields[5][0].value.bytes) {
      locator = this.decodeSourceLocator(fields[5][0].value.bytes);
    }

    return { address, sass, ptx, locator };
  },

  // =========================================================================
  // Decode SourceLocator
  // =========================================================================
  decodeSourceLocator(buffer) {
    const fields = this.decodeMessage(buffer);
    return {
      lineNumber: fields[2] ? Number(fields[2][0].value) : 0,
      filePathId: fields[3] ? Number(fields[3][0].value) : 0,
      filePath: fields[4] && fields[4][0].valueType === 'string' ? fields[4][0].value.string : ''
    };
  },

  // =========================================================================
  // Decode Section
  // =========================================================================
  decodeSection(buffer) {
    const fields = this.decodeMessage(buffer);
    const identifier = fields[1] && fields[1][0].valueType === 'string' ? fields[1][0].value.string : '';
    const displayName = fields[2] && fields[2][0].valueType === 'string' ? fields[2][0].value.string : '';
    const order = fields[3] ? Number(fields[3][0].value) : 0;

    let header = null;
    if (fields[4] && fields[4][0].value.bytes) {
      header = this.decodeSectionHeader(fields[4][0].value.bytes);
    }

    return { identifier, displayName, order, header };
  },

  // =========================================================================
  // Decode SectionHeader
  // =========================================================================
  decodeSectionHeader(buffer) {
    const fields = this.decodeMessage(buffer);
    const metrics = [];

    if (fields[2]) {
      fields[2].forEach(f => {
        if (f.value.bytes) {
          metrics.push(this.decodeSectionMetric(f.value.bytes));
        }
      });
    }

    return { metrics };
  },

  // =========================================================================
  // Decode SectionMetric
  // =========================================================================
  decodeSectionMetric(buffer) {
    const fields = this.decodeMessage(buffer);
    const name = fields[1] && fields[1][0].valueType === 'string' ? fields[1][0].value.string : '';
    const label = fields[2] && fields[2][0].valueType === 'string' ? fields[2][0].value.string : '';
    return { name, label: label || name };
  },

  // =========================================================================
  // Decode RuleResult
  // =========================================================================
  decodeRuleResult(buffer) {
    const fields = this.decodeMessage(buffer);
    const identifier = fields[1] && fields[1][0].valueType === 'string' ? fields[1][0].value.string : '';
    const displayName = fields[2] && fields[2][0].valueType === 'string' ? fields[2][0].value.string : '';
    const sectionIdentifier = fields[4] && fields[4][0].valueType === 'string' ? fields[4][0].value.string : '';

    let body = null;
    if (fields[3] && fields[3][0].value.bytes) {
      body = this.decodeRuleResultBody(fields[3][0].value.bytes);
    }

    return { identifier, displayName, sectionIdentifier, body };
  },

  // =========================================================================
  // Decode RuleResultBody
  // =========================================================================
  decodeRuleResultBody(buffer) {
    const fields = this.decodeMessage(buffer);
    const items = [];

    if (fields[1]) {
      fields[1].forEach(f => {
        if (f.value.bytes) {
          items.push(this.decodeRuleResultBodyItem(f.value.bytes));
        }
      });
    }

    return { items };
  },

  // =========================================================================
  // Decode RuleResultBodyItem
  // =========================================================================
  decodeRuleResultBodyItem(buffer) {
    const fields = this.decodeMessage(buffer);
    let message = null;

    if (fields[1] && fields[1][0].value.bytes) {
      message = this.decodeRuleResultMessage(fields[1][0].value.bytes);
    }

    return { message };
  },

  // =========================================================================
  // Decode RuleResultMessage
  // =========================================================================
  decodeRuleResultMessage(buffer) {
    const fields = this.decodeMessage(buffer);
    const message = fields[1] && fields[1][0].valueType === 'string' ? fields[1][0].value.string : '';
    const type = fields[2] ? Number(fields[2][0].value) : 0;
    return { message, type };
  },

  // =========================================================================
  // Decode StringTable
  // =========================================================================
  decodeStringTable(buffer) {
    const fields = this.decodeMessage(buffer);
    const strings = [];

    if (fields[1]) {
      fields[1].forEach(f => {
        if (f.valueType === 'string') {
          strings.push(f.value.string);
        }
      });
    }

    return strings;
  },

  // =========================================================================
  // Decode BlockHeader
  // =========================================================================
  decodeBlockHeader(buffer) {
    const fields = this.decodeMessage(buffer);

    const numSources = fields[1] ? Number(fields[1][0].value) : 0;
    const numResults = fields[2] ? Number(fields[2][0].value) : 0;
    const payloadSize = fields[5] ? Number(fields[5][0].value) : 0;
    const numRangeResults = fields[7] ? Number(fields[7][0].value) : 0;

    let stringTable = [];
    if (fields[4] && fields[4][0].value.bytes) {
      stringTable = this.decodeStringTable(fields[4][0].value.bytes);
    }

    return { numSources, numResults, payloadSize, numRangeResults, stringTable };
  },

  // =========================================================================
  // Decode FileHeader
  // =========================================================================
  decodeFileHeader(buffer) {
    const fields = this.decodeMessage(buffer);
    const version = fields[1] ? Number(fields[1][0].value) : 0;
    return { version };
  },

  // =========================================================================
  // Parse entire file
  // =========================================================================
  async parseFile(arrayBuffer, onProgress) {
    const bytes = new Uint8Array(arrayBuffer);
    const dv = new DataView(arrayBuffer);

    // Check magic
    if (bytes[0] !== 0x4E || bytes[1] !== 0x56 || bytes[2] !== 0x52 || bytes[3] !== 0x00) {
      throw new Error('Not a valid .ncu-rep file (bad magic header)');
    }

    let offset = 4;

    // File header
    const fileHeaderSize = dv.getUint32(offset, true);
    offset += 4;
    const fileHeaderData = bytes.subarray(offset, offset + fileHeaderSize);
    const fileHeader = this.decodeFileHeader(fileHeaderData);
    offset += fileHeaderSize;

    console.log('File version:', fileHeader.version);

    if (onProgress) onProgress('Reading blocks with protobuf.js...');

    // Read all blocks
    const rawResults = [];
    let lastStringTable = [];

    while (offset < bytes.byteLength) {
      if (offset + 4 > bytes.byteLength) break;
      const blockHeaderSize = dv.getUint32(offset, true);
      offset += 4;
      if (blockHeaderSize === 0 || offset + blockHeaderSize > bytes.byteLength) break;

      const blockHeaderData = bytes.subarray(offset, offset + blockHeaderSize);
      const blockHeader = this.decodeBlockHeader(blockHeaderData);
      offset += blockHeaderSize;

      if (blockHeader.stringTable.length > 0) {
        lastStringTable = blockHeader.stringTable;
      }
      const effectiveStringTable = blockHeader.stringTable.length > 0
        ? blockHeader.stringTable : lastStringTable;

      const payloadEnd = offset + blockHeader.payloadSize;

      // Skip source entries
      for (let i = 0; i < blockHeader.numSources; i++) {
        if (offset + 4 > bytes.byteLength) break;
        const entrySize = dv.getUint32(offset, true);
        offset += 4 + entrySize;
      }

      // Read profile results
      for (let i = 0; i < blockHeader.numResults; i++) {
        if (offset + 4 > bytes.byteLength) break;
        const entrySize = dv.getUint32(offset, true);
        offset += 4;
        if (offset + entrySize > bytes.byteLength) break;

        const entryData = bytes.subarray(offset, offset + entrySize);
        if (onProgress) onProgress(`Parsing kernel ${rawResults.length + 1} with protobuf.js...`);

        // Only log details for first kernel
        const profileResult = this.decodeProfileResult(entryData, rawResults.length === 0);
        rawResults.push({ profileResult, stringTable: effectiveStringTable });
        offset += entrySize;
      }

      // Skip range results
      for (let i = 0; i < blockHeader.numRangeResults; i++) {
        if (offset + 4 > bytes.byteLength) break;
        const entrySize = dv.getUint32(offset, true);
        offset += 4 + entrySize;
      }

      if (blockHeader.payloadSize > 0 && offset < payloadEnd) {
        offset = payloadEnd;
      }
    }

    console.log(`Parsed ${rawResults.length} kernels with protobuf.js`);

    // Use the same transform logic from original parser
    // Import it dynamically
    const { NcuParser } = await import('./ncu-parser.js');
    const kernels = rawResults.map(({ profileResult, stringTable }) =>
      NcuParser.transformResult(profileResult, stringTable)
    );

    // Session info
    let sessionInfo = { fileVersion: fileHeader.version };
    if (kernels.length > 0 && kernels[0]._metricMap) {
      const m = kernels[0]._metricMap;
      sessionInfo.deviceName = m['device__attribute_display_name'] || 'Unknown';
      sessionInfo.computeCapability = m['device__attribute_compute_capability_major'] &&
                                      m['device__attribute_compute_capability_minor']
        ? `${m['device__attribute_compute_capability_major']}.${m['device__attribute_compute_capability_minor']}`
        : 'Unknown';
      sessionInfo.smCount = m['device__attribute_multiprocessor_count'] || 0;
      sessionInfo.memoryTotal = m['device__attribute_global_memory_size'] || 0;
    }

    return { kernels, fileVersion: fileHeader.version, sessionInfo };
  }
};
