// ncu-parser.js - Client-side .ncu-rep binary file parser
// Parses the NVR protobuf format directly without requiring the ncu CLI

export const NcuParser = {
  // =========================================================================
  // Low-level protobuf wire format decoder
  // =========================================================================
  Protobuf: {
    // Wire types
    VARINT: 0,
    FIXED64: 1,
    LENGTH_DELIMITED: 2,
    FIXED32: 5,

    // Read a varint from a DataView at offset, returns { value, bytesRead }
    readVarint(dv, offset) {
      let result = 0n;
      let shift = 0n;
      let bytesRead = 0;
      while (offset < dv.byteLength) {
        const byte = dv.getUint8(offset++);
        bytesRead++;
        result |= BigInt(byte & 0x7F) << shift;
        if ((byte & 0x80) === 0) break;
        shift += 7n;
      }
      return { value: result, bytesRead };
    },

    // Parse all fields from a protobuf message buffer
    // Returns array of { fieldNumber, wireType, value }
    // For VARINT: value is BigInt
    // For LENGTH_DELIMITED: value is Uint8Array
    // For FIXED32: value is uint32
    // For FIXED64: value is BigInt
    parseFields(buffer) {
      const dv = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      const fields = [];
      let offset = 0;

      while (offset < buffer.byteLength) {
        const tag = this.readVarint(dv, offset);
        offset += tag.bytesRead;
        const fieldNumber = Number(tag.value >> 3n);
        const wireType = Number(tag.value & 7n);

        if (wireType === this.VARINT) {
          const val = this.readVarint(dv, offset);
          offset += val.bytesRead;
          fields.push({ fieldNumber, wireType, value: val.value });
        } else if (wireType === this.LENGTH_DELIMITED) {
          const len = this.readVarint(dv, offset);
          offset += len.bytesRead;
          const data = buffer.subarray(offset, offset + Number(len.value));
          offset += Number(len.value);
          fields.push({ fieldNumber, wireType, value: data });
        } else if (wireType === this.FIXED32) {
          const val = dv.getUint32(offset, true);
          offset += 4;
          fields.push({ fieldNumber, wireType, value: val });
        } else if (wireType === this.FIXED64) {
          const lo = dv.getUint32(offset, true);
          const hi = dv.getUint32(offset + 4, true);
          offset += 8;
          const val = BigInt(lo) | (BigInt(hi) << 32n);
          fields.push({ fieldNumber, wireType, value: val });
        } else {
          // Unknown wire type, bail
          break;
        }
      }
      return fields;
    },

    // Convenience: get all field values for a given field number
    getAll(fields, num) {
      return fields.filter(f => f.fieldNumber === num);
    },

    // Get first field value (or undefined)
    getFirst(fields, num) {
      const f = fields.find(f => f.fieldNumber === num);
      return f ? f.value : undefined;
    },

    // Decode a length-delimited field as UTF-8 string
    toString(value) {
      if (value instanceof Uint8Array) {
        return new TextDecoder().decode(value);
      }
      return String(value);
    },

    // Decode a varint as signed int32 (zigzag for sint32, or just Number for int32)
    toNumber(value) {
      if (typeof value === 'bigint') {
        // Handle potential negative values stored as large uint64
        if (value > 0x7FFFFFFFn) {
          return Number(value - 0x100000000n);
        }
        return Number(value);
      }
      return value;
    },

    // Decode float from uint32 bits
    toFloat(uint32) {
      const buf = new ArrayBuffer(4);
      new DataView(buf).setUint32(0, uint32, true);
      return new DataView(buf).getFloat32(0, true);
    },

    // Decode double from BigInt (64-bit)
    toDouble(uint64) {
      const buf = new ArrayBuffer(8);
      const dv = new DataView(buf);
      dv.setUint32(0, Number(uint64 & 0xFFFFFFFFn), true);
      dv.setUint32(4, Number(uint64 >> 32n), true);
      return dv.getFloat64(0, true);
    }
  },

  // =========================================================================
  // ProfileMetricValue decoder
  // Fields from ProfilerResultsCommon.proto:
  //   1: StringValue (string)
  //   2: FloatValue (float, fixed32)
  //   3: DoubleValue (double, fixed64)
  //   4: Uint32Value (uint32, varint)
  //   5: Uint64Value (uint64, varint)
  // =========================================================================
  decodeMetricValue(data) {
    const fields = this.Protobuf.parseFields(data);
    // Check each possible value type
    const strField = this.Protobuf.getFirst(fields, 1);
    if (strField !== undefined) return this.Protobuf.toString(strField);

    const floatField = this.Protobuf.getFirst(fields, 2);
    if (floatField !== undefined) return this.Protobuf.toFloat(floatField);

    const doubleField = this.Protobuf.getFirst(fields, 3);
    if (doubleField !== undefined) return this.Protobuf.toDouble(doubleField);

    const uint32Field = this.Protobuf.getFirst(fields, 4);
    if (uint32Field !== undefined) return Number(uint32Field);

    const uint64Field = this.Protobuf.getFirst(fields, 5);
    if (uint64Field !== undefined) return Number(uint64Field);

    return null;
  },

  // =========================================================================
  // ProfileMetricResult decoder
  // Fields from ProfilerResultsCommon.proto:
  //   1: NameId (uint32)
  //   2: MetricValue (ProfileMetricValue)
  //   3: MetricValueList (repeated)
  // =========================================================================
  decodeMetricResult(data) {
    const fields = this.Protobuf.parseFields(data);
    const nameId = Number(this.Protobuf.getFirst(fields, 1) ?? 0n);
    const valueData = this.Protobuf.getFirst(fields, 2);
    let value = null;
    if (valueData instanceof Uint8Array) {
      value = this.decodeMetricValue(valueData);
    }
    return { nameId, value };
  },

  // =========================================================================
  // Uint64x3 decoder
  //   1: X, 2: Y, 3: Z
  // =========================================================================
  decodeUint64x3(data) {
    const fields = this.Protobuf.parseFields(data);
    return {
      X: Number(this.Protobuf.getFirst(fields, 1) ?? 0n),
      Y: Number(this.Protobuf.getFirst(fields, 2) ?? 0n),
      Z: Number(this.Protobuf.getFirst(fields, 3) ?? 0n)
    };
  },

  // =========================================================================
  // Section metric decoder (from ProfilerSection.proto)
  // ProfilerSectionMetric:
  //   1: Name (string), 2: Label (string), 5: Unit (string)
  // =========================================================================
  decodeSectionMetric(data) {
    const fields = this.Protobuf.parseFields(data);
    const name = this.Protobuf.toString(this.Protobuf.getFirst(fields, 1) ?? new Uint8Array());
    const label = this.Protobuf.toString(this.Protobuf.getFirst(fields, 2) ?? new Uint8Array());
    return { name, label: label || name };
  },

  // =========================================================================
  // Section Header decoder
  // ProfilerSectionHeader: 1: Rows (uint32), 2: Metrics (repeated ProfilerSectionMetric)
  // =========================================================================
  decodeSectionHeader(data) {
    const fields = this.Protobuf.parseFields(data);
    const metricFields = this.Protobuf.getAll(fields, 2);
    const metrics = metricFields.map(f => this.decodeSectionMetric(f.value));
    return { metrics };
  },

  // =========================================================================
  // RuleResultMessage decoder
  // 1: Message (string), 2: Type (enum)
  // Types: 0=None, 1=Ok, 2=Warning, 3=Error, 4=Optimization
  // =========================================================================
  decodeRuleResultMessage(data) {
    const fields = this.Protobuf.parseFields(data);
    const message = this.Protobuf.toString(this.Protobuf.getFirst(fields, 1) ?? new Uint8Array());
    const type = Number(this.Protobuf.getFirst(fields, 2) ?? 0n);
    return { message, type };
  },

  // =========================================================================
  // RuleResultBodyItem decoder
  // 1: Message (RuleResultMessage), 10: Speedup (RuleResultSpeedup)
  // =========================================================================
  decodeRuleResultBodyItem(data) {
    const fields = this.Protobuf.parseFields(data);
    const msgData = this.Protobuf.getFirst(fields, 1);
    let message = null;
    if (msgData instanceof Uint8Array) {
      message = this.decodeRuleResultMessage(msgData);
    }
    return { message };
  },

  // =========================================================================
  // RuleResultBody decoder
  // 1: Items (repeated RuleResultBodyItem)
  // =========================================================================
  decodeRuleResultBody(data) {
    const fields = this.Protobuf.parseFields(data);
    const items = this.Protobuf.getAll(fields, 1).map(f => this.decodeRuleResultBodyItem(f.value));
    return { items };
  },

  // =========================================================================
  // RuleResult decoder
  // 1: Identifier, 2: DisplayName, 3: Body (RuleResultBody), 4: SectionIdentifier
  // =========================================================================
  decodeRuleResult(data) {
    const fields = this.Protobuf.parseFields(data);
    const identifier = this.Protobuf.toString(this.Protobuf.getFirst(fields, 1) ?? new Uint8Array());
    const displayName = this.Protobuf.toString(this.Protobuf.getFirst(fields, 2) ?? new Uint8Array());
    const sectionIdentifier = this.Protobuf.toString(this.Protobuf.getFirst(fields, 4) ?? new Uint8Array());
    const bodyData = this.Protobuf.getFirst(fields, 3);
    let body = null;
    if (bodyData instanceof Uint8Array) {
      body = this.decodeRuleResultBody(bodyData);
    }
    return { identifier, displayName, sectionIdentifier, body };
  },

  // =========================================================================
  // ProfilerSection decoder (from ProfilerSection.proto)
  // 1: Identifier, 2: DisplayName, 3: Order, 4: Header, 5: Body (repeated)
  // =========================================================================
  decodeSection(data) {
    const fields = this.Protobuf.parseFields(data);
    const identifier = this.Protobuf.toString(this.Protobuf.getFirst(fields, 1) ?? new Uint8Array());
    const displayName = this.Protobuf.toString(this.Protobuf.getFirst(fields, 2) ?? new Uint8Array());
    const order = Number(this.Protobuf.getFirst(fields, 3) ?? 0n);
    const headerData = this.Protobuf.getFirst(fields, 4);
    let header = null;
    if (headerData instanceof Uint8Array) {
      header = this.decodeSectionHeader(headerData);
    }
    return { identifier, displayName, order, header };
  },

    // =========================================================================

    // SourceLocator decoder

    //   2: Line number (uint32)

    //   3: FilePathId (uint32, index into string table)

    //   4: FilePath (string)

    // =========================================================================

    decodeSourceLocator(data) {

      const fields = this.Protobuf.parseFields(data);

      const lineNumber = Number(this.Protobuf.getFirst(fields, 2) ?? 0n);

      const filePathId = Number(this.Protobuf.getFirst(fields, 3) ?? 0n);

      const filePath = this.Protobuf.toString(this.Protobuf.getFirst(fields, 4) ?? new Uint8Array());

      return { lineNumber, filePathId, filePath };

    },

  

    // =========================================================================

    // SourceLine decoder

    //   1: Address (uint64)

    //   2: SASS (string)

    //   3: PTX (string)

    //   5: SourceLocator (nested message)

    // =========================================================================

    decodeSourceLine(data) {

      const fields = this.Protobuf.parseFields(data);

      const address = this.Protobuf.getFirst(fields, 1) ?? 0n;

      const sass = this.Protobuf.toString(this.Protobuf.getFirst(fields, 2) ?? new Uint8Array());

      const ptx = this.Protobuf.toString(this.Protobuf.getFirst(fields, 3) ?? new Uint8Array());

      

      let locator = null;

      const locatorData = this.Protobuf.getFirst(fields, 5);

      if (locatorData instanceof Uint8Array) {

        locator = this.decodeSourceLocator(locatorData);

      }

      

      return { address, sass, ptx, locator };

    },

  

    // =========================================================================

    // ProfileResult decoder (from ProfilerReport.proto)

    // Key fields:

    //   5: KernelMangledName, 6: KernelFunctionName, 7: KernelDemangledName

    //   10: GridSize (Uint64x3), 11: BlockSize (Uint64x3)

    //   12: Source (repeated SourceLine)

    //   13: MetricResults (repeated ProfileMetricResult)

    //   17: Sections (repeated ProfilerSection)

    //   19: RuleResults (repeated RuleResult)

    //   22: ContextID, 23: StreamID

    // =========================================================================

          decodeProfileResult(data) {

            const fields = this.Protobuf.parseFields(data);

        

      

        console.log("Decoding ProfileResult fields:", fields);

    

  

      const kernelMangledName = this.Protobuf.toString(this.Protobuf.getFirst(fields, 5) ?? new Uint8Array());

      const kernelFunctionName = this.Protobuf.toString(this.Protobuf.getFirst(fields, 6) ?? new Uint8Array());

      const kernelDemangledName = this.Protobuf.toString(this.Protobuf.getFirst(fields, 7) ?? new Uint8Array());

  

      const gridData = this.Protobuf.getFirst(fields, 10);

      const grid = gridData instanceof Uint8Array ? this.decodeUint64x3(gridData) : { X: 0, Y: 0, Z: 0 };

  

      const blockData = this.Protobuf.getFirst(fields, 11);

      const block = blockData instanceof Uint8Array ? this.decodeUint64x3(blockData) : { X: 0, Y: 0, Z: 0 };

  

      const contextId = Number(this.Protobuf.getFirst(fields, 22) ?? 0n);

      const streamId = Number(this.Protobuf.getFirst(fields, 23) ?? 0n);

  

      // Decode source lines

      const sourceLineFields = this.Protobuf.getAll(fields, 12);

      const sourceLines = sourceLineFields.map(f => this.decodeSourceLine(f.value));

  

      // Decode metric results

      const metricResultFields = this.Protobuf.getAll(fields, 13);

      const metricResults = metricResultFields.map(f => this.decodeMetricResult(f.value));

  

      // Decode sections

      const sectionFields = this.Protobuf.getAll(fields, 17);

      const sections = sectionFields.map(f => this.decodeSection(f.value));

  

      // Decode rule results

      const ruleResultFields = this.Protobuf.getAll(fields, 19);

      const ruleResults = ruleResultFields.map(f => this.decodeRuleResult(f.value));

  

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

        ruleResults

      };

    },

  // =========================================================================
  // StringTable decoder
  // 1: Strings (repeated string)
  // =========================================================================
  decodeStringTable(data) {
    const fields = this.Protobuf.parseFields(data);
    return this.Protobuf.getAll(fields, 1).map(f => this.Protobuf.toString(f.value));
  },

  // =========================================================================
  // BlockHeader decoder
  // 1: NumSources, 2: NumResults, 3: SessionDetails, 4: StringTable,
  // 5: PayloadSize, 6: Process, 7: NumRangeResults
  // =========================================================================
  decodeBlockHeader(data) {
    const fields = this.Protobuf.parseFields(data);
    const numSources = Number(this.Protobuf.getFirst(fields, 1) ?? 0n);
    const numResults = Number(this.Protobuf.getFirst(fields, 2) ?? 0n);
    const payloadSize = Number(this.Protobuf.getFirst(fields, 5) ?? 0n);
    const numRangeResults = Number(this.Protobuf.getFirst(fields, 7) ?? 0n);

    const stringTableData = this.Protobuf.getFirst(fields, 4);
    let stringTable = [];
    if (stringTableData instanceof Uint8Array) {
      stringTable = this.decodeStringTable(stringTableData);
    }

    // Decode session details for device info
    let sessionDetails = null;
    const sessionData = this.Protobuf.getFirst(fields, 3);
    if (sessionData instanceof Uint8Array) {
      sessionDetails = this.decodeSessionDetails(sessionData);
    }

    return { numSources, numResults, payloadSize, numRangeResults, stringTable, sessionDetails };
  },

  // =========================================================================
  // SessionDetails decoder (partial - just what we need)
  // ReportSessionDetails: 1: ProcessID, 2: CreationTime
  // =========================================================================
  decodeSessionDetails(data) {
    const fields = this.Protobuf.parseFields(data);
    const processId = Number(this.Protobuf.getFirst(fields, 1) ?? 0n);
    return { processId };
  },

  // =========================================================================
  // FileHeader decoder
  // 1: Version (uint32)
  // =========================================================================
  decodeFileHeader(data) {
    const fields = this.Protobuf.parseFields(data);
    const version = Number(this.Protobuf.getFirst(fields, 1) ?? 0n);
    return { version };
  },

  // =========================================================================
  // High-level: parse an entire .ncu-rep file from an ArrayBuffer
  // Returns { kernels: [...] } where each kernel has the same shape
  // as the old server-side parsed data
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

    if (onProgress) onProgress('Reading blocks...');

    // Read all blocks
    const rawResults = [];  // { profileResult, stringTable }
    let blockNum = 0;
    let lastStringTable = [];  // Carry forward string table across blocks

    while (offset < bytes.byteLength) {
      if (offset + 4 > bytes.byteLength) break;
      const blockHeaderSize = dv.getUint32(offset, true);
      offset += 4;
      if (blockHeaderSize === 0 || offset + blockHeaderSize > bytes.byteLength) break;

      const blockHeaderData = bytes.subarray(offset, offset + blockHeaderSize);
      const blockHeader = this.decodeBlockHeader(blockHeaderData);
      offset += blockHeaderSize;

      // Persist non-empty string tables for use by subsequent blocks
      if (blockHeader.stringTable.length > 0) {
        lastStringTable = blockHeader.stringTable;
      }
      const effectiveStringTable = blockHeader.stringTable.length > 0
        ? blockHeader.stringTable : lastStringTable;

      // Read payload entries: NumSources source entries, then NumResults profile results
      // Each entry: 4-byte LE size + protobuf data
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
        if (onProgress) onProgress(`Parsing kernel ${rawResults.length + 1}...`);

        const profileResult = this.decodeProfileResult(entryData);
        rawResults.push({ profileResult, stringTable: effectiveStringTable });
        offset += entrySize;
      }

      // Skip range results
      for (let i = 0; i < blockHeader.numRangeResults; i++) {
        if (offset + 4 > bytes.byteLength) break;
        const entrySize = dv.getUint32(offset, true);
        offset += 4 + entrySize;
      }

      // If payload size was set, ensure we've moved past it
      if (blockHeader.payloadSize > 0 && offset < payloadEnd) {
        offset = payloadEnd;
      }

      blockNum++;
    }

    if (onProgress) onProgress('Building metric tables...');

    // Transform raw results into the display format expected by the UI
    const kernels = rawResults.map(({ profileResult, stringTable }) =>
      this.transformResult(profileResult, stringTable)
    );

    return { kernels, fileVersion: fileHeader.version };
  },

  // =========================================================================
  // Transform a ProfileResult + StringTable into the display format
  // that the existing UI expects:
  // {
  //   name, grid, block, cc, sections: [
  //     { name, metrics: [{ name, unit, value }], hints: [{ type, text }] }
  //   ]
  // }
  // =========================================================================
  transformResult(pr, stringTable) {
    // Build metric lookup: metricName -> value
    const metricMap = {};
    for (const mr of pr.metricResults) {
      const name = stringTable[mr.nameId] || `metric_${mr.nameId}`;
      if (mr.value !== null && mr.value !== undefined) {
        metricMap[name] = mr.value;
      }
    }

    // Build sections from the section definitions + actual metric values
    const sections = [];
    for (const sec of pr.sections) {
      if (!sec.header || !sec.header.metrics) continue;

      const sectionMetrics = [];
      for (const sm of sec.header.metrics) {
        if (!sm.name) continue;
        const rawValue = metricMap[sm.name];
        if (rawValue === undefined || rawValue === null) continue;

        const { displayValue, unit } = this.formatMetricValue(sm.name, rawValue);
        sectionMetrics.push({
          name: sm.label || sm.name,
          unit,
          value: displayValue,
          rawName: sm.name,
          rawValue
        });
      }

      // Collect hints from rule results for this section
      const hints = [];
      for (const rr of pr.ruleResults) {
        if (rr.sectionIdentifier !== sec.identifier) continue;
        if (!rr.body || !rr.body.items) continue;
        for (const item of rr.body.items) {
          if (!item.message || !item.message.message) continue;
          let hintType;
          if (item.message.type === 4) hintType = 'OPT';       // Optimization
          else if (item.message.type === 1) hintType = 'INF';   // Ok/Info
          else continue;
          hints.push({ type: hintType, text: item.message.message });
        }
      }

      sections.push({
        name: sec.displayName,
        identifier: sec.identifier,
        order: sec.order,
        metrics: sectionMetrics,
        hints
      });
    }

    // Sort sections by order
    sections.sort((a, b) => a.order - b.order);

    // Compute CC from device attributes if available
    // The CC is typically embedded in the metric names or device properties
    // For now, extract from section data or fall back to empty
    let cc = '';
    // Try to find device__attribute_compute_capability_major/minor
    const ccMajor = metricMap['device__attribute_compute_capability_major'];
    const ccMinor = metricMap['device__attribute_compute_capability_minor'];
    if (ccMajor !== undefined && ccMinor !== undefined) {
      cc = `${ccMajor}.${ccMinor}`;
    }

    // Process source lines
    const source = [];
    if (pr.sourceLines) {
      for (const sl of pr.sourceLines) {
        let file = '';
        if (sl.locator) {
          if (sl.locator.filePath) {
            file = sl.locator.filePath;
          } else if (sl.locator.filePathId > 0 && stringTable[sl.locator.filePathId]) {
            file = stringTable[sl.locator.filePathId];
          }
        }
        source.push({
          address: `0x${sl.address.toString(16)}`,
          sass: sl.sass,
          ptx: sl.ptx,
          file: file,
          line: sl.locator?.lineNumber ?? 0
        });
      }
    }

    return {
      name: pr.kernelDemangledName || pr.kernelFunctionName || pr.kernelMangledName,
      functionName: pr.kernelFunctionName,
      grid: `${pr.grid.X}, ${pr.grid.Y}, ${pr.grid.Z}`,
      block: `${pr.block.X}, ${pr.block.Y}, ${pr.block.Z}`,
      cc,
      contextId: pr.contextId,
      streamId: pr.streamId,
      sections,
      source,
      _metricMap: metricMap  // keep raw metrics for advanced use
    };
  },

  // =========================================================================
  // Metric value formatting
  // Converts raw metric values to display strings with appropriate units
  // =========================================================================
  formatMetricValue(metricName, rawValue) {
    const mn = metricName.toLowerCase();

    // String values pass through
    if (typeof rawValue === 'string') {
      return { displayValue: rawValue, unit: '' };
    }

    // Percentage metrics
    if (mn.includes('.pct') || mn.includes('_pct') || mn.includes('_rate.pct') ||
        mn.includes('pct_of_peak')) {
      return { displayValue: this.fmtNum(rawValue, 2), unit: '%' };
    }

    // Time duration (nanoseconds from the profiler)
    if (mn.includes('time_duration')) {
      if (rawValue >= 1e9) return { displayValue: this.fmtNum(rawValue / 1e9, 2), unit: 's' };
      if (rawValue >= 1e6) return { displayValue: this.fmtNum(rawValue / 1e6, 2), unit: 'ms' };
      if (rawValue >= 1e3) return { displayValue: this.fmtNum(rawValue / 1e3, 2), unit: 'us' };
      return { displayValue: this.fmtNum(rawValue, 2), unit: 'ns' };
    }

    // Frequency
    if (mn.includes('clock_rate') || mn.includes('frequency') || mn.includes('cycles_per_second')) {
      if (rawValue >= 1e9) return { displayValue: this.fmtNum(rawValue / 1e9, 2), unit: 'Ghz' };
      if (rawValue >= 1e6) return { displayValue: this.fmtNum(rawValue / 1e6, 2), unit: 'Mhz' };
      return { displayValue: this.fmtNum(rawValue, 2), unit: 'Hz' };
    }

    // Cycles
    if (mn.includes('cycle') && !mn.includes('per_second') && !mn.includes('pct')) {
      return { displayValue: this.fmtNum(rawValue, 2), unit: 'cycle' };
    }

    // Instructions per cycle
    if (mn.includes('per_cycle')) {
      return { displayValue: this.fmtNum(rawValue, 2), unit: 'inst/cycle' };
    }

    // Byte sizes
    if (mn.includes('_bytes') || mn.includes('_size') && !mn.includes('block_size') && !mn.includes('grid_size')) {
      if (rawValue >= 1024 * 1024 * 1024) return { displayValue: this.fmtNum(rawValue / (1024 * 1024 * 1024), 2), unit: 'Gbyte' };
      if (rawValue >= 1024 * 1024) return { displayValue: this.fmtNum(rawValue / (1024 * 1024), 2), unit: 'Mbyte' };
      if (rawValue >= 1024) return { displayValue: this.fmtNum(rawValue / 1024, 2), unit: 'Kbyte' };
      return { displayValue: this.fmtNum(rawValue, 0), unit: 'byte' };
    }

    // Sectors
    if (mn.includes('sector') && !mn.includes('hit_rate') && !mn.includes('pct')) {
      return { displayValue: this.fmtNum(rawValue, 0), unit: 'sector' };
    }

    // Warps
    if (mn.includes('warp') && !mn.includes('pct')) {
      return { displayValue: this.fmtNum(rawValue, 2), unit: 'warp' };
    }

    // Instructions
    if (mn.includes('inst') && !mn.includes('per_cycle') && !mn.includes('pct')) {
      return { displayValue: this.fmtNum(rawValue, 2), unit: 'inst' };
    }

    // Thread count
    if (mn.includes('thread_count') || mn.includes('thread')) {
      if (!mn.includes('per') && !mn.includes('pct')) {
        return { displayValue: this.fmtNum(rawValue, 0), unit: 'thread' };
      }
    }

    // Block / grid dims
    if (mn.startsWith('launch__block_dim') || mn.startsWith('launch__grid_dim') ||
        mn.startsWith('launch__block_size') || mn.startsWith('launch__grid_size') ||
        mn.includes('sm_count') || mn.includes('tpc_count')) {
      return { displayValue: this.fmtNum(rawValue, 0), unit: '' };
    }

    // Register count
    if (mn.includes('register')) {
      return { displayValue: this.fmtNum(rawValue, 0), unit: 'register/thread' };
    }

    // Shared memory
    if (mn.includes('shared_mem')) {
      if (rawValue >= 1024) return { displayValue: this.fmtNum(rawValue / 1024, 2), unit: 'Kbyte' };
      return { displayValue: this.fmtNum(rawValue, 0), unit: 'byte' };
    }

    // Occupancy limit (block count)
    if (mn.includes('occupancy_limit')) {
      return { displayValue: this.fmtNum(rawValue, 0), unit: 'block' };
    }

    // Waves
    if (mn.includes('waves_per')) {
      return { displayValue: this.fmtNum(rawValue, 2), unit: '' };
    }

    // Generic: float vs integer heuristic
    if (Number.isInteger(rawValue) && Math.abs(rawValue) < 1e12) {
      return { displayValue: rawValue.toLocaleString(), unit: '' };
    }

    return { displayValue: this.fmtNum(rawValue, 2), unit: '' };
  },

  fmtNum(val, decimals) {
    if (typeof val !== 'number' || isNaN(val)) return String(val);
    if (decimals === 0) return Math.round(val).toLocaleString();
    // Format with fixed decimals, add thousands separators to integer part
    const fixed = val.toFixed(decimals);
    const [intPart, decPart] = fixed.split('.');
    const intFormatted = parseInt(intPart).toLocaleString();
    return decPart ? `${intFormatted}.${decPart}` : intFormatted;
  }
};
