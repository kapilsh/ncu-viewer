# NCU Web Viewer

A browser-based viewer for NVIDIA Nsight Compute (`.ncu-rep`) profiling reports. The entire file is parsed client-side in your browser -- no data ever leaves your machine.

## Live Demo

> **TODO**: Add GitHub Pages URL once deployed.

## Features

- Drag-and-drop `.ncu-rep` file upload
- Full client-side parsing of the NCU binary format (no server required)
- Kernel list sidebar with grid/block dimensions and duration
- Tabbed sections: Overview, Speed of Light, Compute, Memory, Launch Stats, Occupancy, Scheduler, Warp State, Instructions, and more
- Chart.js visualizations (throughput bars, doughnut charts, occupancy breakdowns)
- Optimization hints extracted from NCU rule results
- Multi-file comparison (load additional files side by side)
- Dark themeP

## How It Works

### Client-Side Parsing

The app ships a hand-written protobuf decoder (`js/ncu-parser.js`) that operates directly on the `ArrayBuffer` returned by the browser's `FileReader` API. No protobuf library or code generation is used -- the wire format is decoded field-by-field using the standard protobuf encoding rules:

| Wire Type | Encoding | Used For |
|-----------|----------|----------|
| 0 (VARINT) | Variable-length, 7 bits per byte with continuation bit | Integers, enums, booleans |
| 1 (FIXED64) | 8 bytes, little-endian | `double`, `fixed64` |
| 2 (LENGTH_DELIMITED) | Varint length prefix + data | Strings, bytes, nested messages |
| 5 (FIXED32) | 4 bytes, little-endian | `float`, `fixed32` |

The parser uses `BigInt` throughout to handle 64-bit values faithfully, then converts to `Number` at the display layer. IEEE 754 float/double decoding is done by writing raw bytes into an `ArrayBuffer` and reading back with `DataView`.

### The `.ncu-rep` Binary Format

An `.ncu-rep` file is a custom container that wraps protobuf-encoded messages. The high-level layout is:

```
+----------------------------------------------+
| Magic Header (4 bytes): 0x4E 0x56 0x52 0x00  |  "NVR\0"
+----------------------------------------------+
| FileHeader size (4 bytes LE)                  |
| FileHeader (protobuf)                         |
|   - field 1: Version (uint32)                 |
+----------------------------------------------+
| Block 0                                       |
|   BlockHeader size (4 bytes LE)               |
|   BlockHeader (protobuf)                      |
|     - field 1: NumSources (uint32)            |
|     - field 2: NumResults (uint32)            |
|     - field 4: StringTable (repeated string)  |
|     - field 5: PayloadSize (uint32)           |
|     - field 7: NumRangeResults (uint32)       |
|   Payload                                     |
|     [NumSources source entries] (skipped)     |
|     [NumResults profile results] (parsed)     |
|     [NumRangeResults range entries] (skipped)  |
+----------------------------------------------+
| Block 1 ...                                   |
+----------------------------------------------+
```

Each payload entry is prefixed with a 4-byte little-endian size, followed by that many bytes of protobuf data.

**String table**: Metric names are stored once per block in a string table. Each metric result references its name by index into this table. The parser carries the most recent non-empty string table forward across blocks so that later blocks can reference it.

### ProfileResult Structure

Each kernel profiling pass produces one `ProfileResult` message with these key fields:

| Proto Field | Type | Content |
|-------------|------|---------|
| 5 | string | Mangled kernel name |
| 6 | string | Short function name |
| 7 | string | Demangled (human-readable) kernel name |
| 10 | Uint64x3 | Grid dimensions (X, Y, Z) |
| 11 | Uint64x3 | Block dimensions (X, Y, Z) |
| 13 | repeated | Metric results (name ID + value) |
| 17 | repeated | Section definitions (identifier, display name, header with metric list) |
| 19 | repeated | Rule results (optimization hints) |
| 22 | uint32 | CUDA context ID |
| 23 | uint32 | CUDA stream ID |

### Metric Values

Each metric value is a `ProfileMetricValue` oneof:

| Field | Type | Encoding |
|-------|------|----------|
| 1 | string | UTF-8 (LENGTH_DELIMITED) |
| 2 | float | IEEE 754 (FIXED32) |
| 3 | double | IEEE 754 (FIXED64) |
| 4 | uint32 | VARINT |
| 5 | uint64 | VARINT |

The parser checks each field in priority order and returns the first one present. After extraction, values are formatted with appropriate units (%, ns/us/ms/s, bytes/KB/MB/GB, cycles, warps, etc.) based on heuristics applied to the metric name.

### Rule Results (Hints)

NCU embeds analysis rules that produce optimization hints. Each `RuleResult` is associated with a section and contains typed messages:

| Type ID | Meaning |
|---------|---------|
| 0 | None |
| 1 | Ok / Informational |
| 2 | Warning |
| 3 | Error |
| 4 | Optimization suggestion |

The viewer displays type 1 (INF) and type 4 (OPT) hints within their respective section tabs.

## Tech Stack

- Vanilla JavaScript (no build step, no framework)
- [Chart.js 4.4](https://www.chartjs.org/) via CDN for visualizations
- CSS custom properties for theming
- `FileReader` + `DataView` + `BigInt` for binary parsing

## Running Locally

Since the app is fully static, any HTTP server will do:

```bash
# Python
python3 -m http.server 8080 -d ncu-viewer/public

# Node
npx serve ncu-viewer/public

# Or just open ncu-viewer/public/index.html in your browser
```

## License

MIT
