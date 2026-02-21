# NCU Web Viewer (Archived: Moved to https://github.com/kapilsh/perfessor)

A comprehensive browser-based viewer for NVIDIA Nsight Compute (`.ncu-rep`) profiling reports. Parse and analyze GPU kernel performance entirely client-side in your browser.

## ✨ Features

### High-Level Analysis
- 📊 **Summary Dashboard** - All kernels and optimization hints prioritized by impact
- 🖥️ **Session Information** - Device specs, compute capability, memory, clock rates
- 🔍 **Kernel Search & Filtering** - Filter by name or type (GEMM, Conv, Reduce, etc.)
- 📈 **Interactive Charts** - Throughput, occupancy, roofline, memory hierarchy visualizations

### Advanced Analysis ToolsP
- ⚖️ **Baseline Comparison** - Compare kernels against a baseline with difference highlighting
- 🆚 **Multi-Kernel Comparison** - Side-by-side comparison of up to 4 kernels
- 🎯 **Roofline Analysis** - Visualize compute vs memory bound performance
- 💾 **Memory Hierarchy Charts** - L1/L2/DRAM flow with hit/miss rates
- 💡 **Metric Tooltips** - Hover descriptions for all metrics

### Data Export
- 📄 **CSV Export** - Export metric tables for external analysis
- 🖼️ **Chart Export** - Download charts as PNG images
- 📁 **Multi-File Support** - Load and compare multiple reports

### Supported Sections
- Overview with key metrics and optimization hints
- GPU Speed of Light Throughput
- Compute Workload Analysis
- Memory Workload Analysis with enhanced visualizations
- Launch Statistics
- Occupancy Analysis
- Scheduler Statistics
- Warp State Statistics
- Instruction Statistics
- GPU and Memory Workload Distribution
- Source Counters
- PM Sampling

## 🚀 Quick Start

### Option 1: Run with Vite (Recommended)
```bash
npm install
npm run dev
```
Open http://localhost:5173 and drag-drop your `.ncu-rep` file.

### Option 2: Static Server
```bash
python3 -m http.server 8080
# Open http://localhost:8080
```

### Option 3: Direct File Access
Simply open `index.html` in a modern browser (ES modules required).

## 📚 NVIDIA NCU Binary Format Documentation

### Overview

The `.ncu-rep` file is NVIDIA's proprietary binary format based on Protocol Buffers v2. It contains profiled kernel data, metrics, optimization hints, and session information.

**Official Documentation:**
- [NVIDIA Nsight Compute Documentation](https://docs.nvidia.com/nsight-compute/)
- [Customization Guide](https://docs.nvidia.com/nsight-compute/CustomizationGuide/index.html)
- [NCU CLI Reference](https://docs.nvidia.com/nsight-compute/NsightComputeCli/index.html)
- [CUDA Binary Utilities](https://docs.nvidia.com/cuda/cuda-binary-utilities/index.html)

### File Structure

```
┌─────────────────────────────────────────────────────────┐
│ Magic Header: 0x4E 0x56 0x52 0x00 ("NVR\0")            │
├─────────────────────────────────────────────────────────┤
│ FileHeader (4-byte size + protobuf message)            │
│   Field 1: Version (uint32)                            │
├─────────────────────────────────────────────────────────┤
│ Block 0                                                 │
│   ├─ BlockHeader (4-byte size + protobuf)              │
│   │    Field 1: NumSources (uint32)                    │
│   │    Field 2: NumResults (uint32)                    │
│   │    Field 3: SessionDetails (nested message)        │
│   │    Field 4: StringTable (repeated string)          │
│   │    Field 5: PayloadSize (uint32)                   │
│   │    Field 7: NumRangeResults (uint32)               │
│   │                                                     │
│   ├─ Payload                                            │
│   │    ├─ Source Entries [0..NumSources]               │
│   │    │    (4-byte size + ProfileSource protobuf)     │
│   │    │                                                │
│   │    ├─ Profile Results [0..NumResults]              │
│   │    │    (4-byte size + ProfileResult protobuf)     │
│   │    │    **THIS IS THE KERNEL DATA**                │
│   │    │                                                │
│   │    └─ Range Results [0..NumRangeResults]           │
│   │         (4-byte size + RangeResult protobuf)       │
├─────────────────────────────────────────────────────────┤
│ Block 1... (repeated structure)                        │
└─────────────────────────────────────────────────────────┘
```

### Protocol Buffer Wire Types

| Wire Type | Value | Encoding | Used For |
|-----------|-------|----------|----------|
| VARINT | 0 | Variable-length, 7 bits per byte | int32, int64, uint32, uint64, sint32, sint64, bool, enum |
| FIXED64 | 1 | 8 bytes, little-endian | fixed64, sfixed64, double |
| LENGTH_DELIMITED | 2 | varint length + bytes | string, bytes, embedded messages, packed repeated |
| FIXED32 | 5 | 4 bytes, little-endian | fixed32, sfixed32, float |

**Varint Encoding Example:**
- `300` → `0xAC 0x02` (10101100 00000010)
- Last 7 bits of each byte form the value
- MSB indicates continuation (1 = more bytes follow)

### Protocol Buffer Schema

The proto definitions are located in your NCU installation:
```
$NSIGHT_COMPUTE_ROOT/extras/FileFormat/*.proto
```

**Key Proto Files:**
- `ProfilerReport.proto` - Top-level report structure, FileHeader, BlockHeader
- `ProfilerResultsCommon.proto` - ProfileMetricValue, ProfileMetricResult, Uint64x3
- `ProfilerSection.proto` - ProfilerSection, ProfilerSectionMetric, ProfilerSectionHeader
- `ProfilerStringTable.proto` - String table for metric names
- `ProfilerMetricOptions.proto` - Metric collection options

**Note:** The file format is subject to change between NCU versions without notice.

### ProfileResult Message Structure

Each kernel launch produces one `ProfileResult` with the following fields:

| Field # | Type | Content | Description |
|---------|------|---------|-------------|
| 1 | uint32 | Index | Result index in block |
| 2 | uint32 | Source ID | Reference to source information |
| 3 | uint64 | Start timestamp | Kernel start time |
| 4 | uint64 | End timestamp | Kernel end time |
| 5 | string | Mangled name | C++ mangled kernel name |
| 6 | string | Function name | Short kernel function name |
| 7 | string | Demangled name | Human-readable kernel name |
| 8 | uint32 | Chip name | GPU architecture identifier |
| 9 | Uint64x3 | Work size | Total work items (unused in CUDA) |
| 10 | Uint64x3 | Grid dimensions | Grid size (X, Y, Z) |
| 11 | Uint64x3 | Block dimensions | Block size (X, Y, Z) |
| 12 | repeated SourceLine | Source code | **DEPRECATED in NCU 2025+** |
| 13 | repeated ProfileMetricResult | Metrics | Collected performance metrics |
| 14 | uint32 | Device ID | GPU device index |
| 15 | Uint64x3 | Grid origin | Grid start offset |
| 16 | uint32 | Range index | NVTX range association |
| 17 | repeated ProfilerSection | Sections | Organized metric sections |
| 19 | repeated RuleResult | Rules | Optimization hints and warnings |
| 22 | uint32 | Context ID | CUDA context identifier |
| 23 | uint32 | Stream ID | CUDA stream identifier |
| 25 | uint64 | Virtual PC | Program counter address |
| 31 | bytes | Reserved | Reserved for future use |
| 35 | float | Reserved | Reserved for future use |

### ProfileMetricValue Encoding

Metrics are stored as a oneof message with these possible types:

| Field # | Type | Wire Type | Description |
|---------|------|-----------|-------------|
| 1 | string | LENGTH_DELIMITED | String value (e.g., device names) |
| 2 | float | FIXED32 | 32-bit floating point |
| 3 | double | FIXED64 | 64-bit floating point |
| 4 | uint32 | VARINT | 32-bit unsigned integer |
| 5 | uint64 | VARINT | 64-bit unsigned integer |

**Decoding Logic:**
```javascript
// Parser checks fields in order 1→2→3→4→5
// Returns first non-null value found
const value = stringValue ?? floatValue ?? doubleValue ?? uint32Value ?? uint64Value;
```

### StringTable and Metric Name Resolution

**Problem:** Metric names can be long (50+ chars) and repeated thousands of times.

**Solution:** String deduplication via indexed table.

```
BlockHeader {
  StringTable: ["Duration", "SM Busy", "L1 Hit Rate", ...]
}

ProfileMetricResult {
  NameId: 2  // → "L1 Hit Rate"
  MetricValue: { double: 87.5 }
}
```

**Parser Behavior:**
- String tables persist across blocks
- Empty string table → reuse previous block's table
- This allows later blocks to reference earlier tables

### Rule Results (Optimization Hints)

NCU includes an analysis engine that produces hints:

```protobuf
message RuleResult {
  string Identifier = 1;        // e.g., "SOL_DRAM_Bound"
  string DisplayName = 2;       // e.g., "Memory Bound"
  RuleResultBody Body = 3;      // Contains messages
  string SectionIdentifier = 4; // Which section this applies to
}

message RuleResultMessage {
  string Message = 1;  // The hint text
  int32 Type = 2;      // 0=None, 1=Info, 2=Warn, 3=Error, 4=Optimization
}
```

**Type Classification:**
- **Type 4 (OPT):** Actionable optimization suggestions
- **Type 1 (INF):** Informational messages
- **Type 2/3:** Warnings and errors (rare)

**Example:**
```
Type: OPT (4)
Section: Memory Workload Analysis
Message: "Memory is more heavily utilized than Compute: Look at the Memory Workload Analysis section to identify the DRAM bottleneck."
```

### Source Code Information (SASS/PTX)

**⚠️ Important Change in NCU 2025+:**

Field 12 (SourceLine) was **removed** in NCU 2025.x versions. Source code (SASS/PTX) is no longer embedded in the protobuf.

**Current Approach:**
- CUBIN binaries are embedded in the report (ELF format)
- NCU disassembles on-demand when exporting with `--page source`
- Use NCU CLI for source viewing: `ncu --import file.ncu-rep --page source --csv`

**Workaround for Web Viewer:**
```bash
# Export source data separately
ncu --import report.ncu-rep --page source --csv > source.csv
# Then load CSV alongside the binary report
```

### Session Details

Limited session information is available in BlockHeader field 3:

```protobuf
message ReportSessionDetails {
  uint32 ProcessID = 1;
  uint64 CreationTime = 2;
  // More fields exist but aren't documented
}
```

**Device attributes** are stored as metrics in the first ProfileResult:
- `device__attribute_display_name` - GPU name
- `device__attribute_compute_capability_major/minor` - SM version
- `device__attribute_multiprocessor_count` - Number of SMs
- `device__attribute_global_memory_size` - Total VRAM
- `device__attribute_l2_cache_size` - L2 cache size
- `device__attribute_max_threads_per_block` - Block limits
- And 50+ more device attributes

### Metric Name Patterns and Units

The parser applies heuristics to format values based on metric name patterns:

| Pattern | Unit | Example |
|---------|------|---------|
| `.pct`, `_pct`, `pct_of_peak` | % | `sm__throughput.avg.pct_of_peak_sustained_elapsed` → "45.2%" |
| `time_duration` | ns/us/ms/s | `sm__duration.avg` → "1.23 ms" |
| `clock_rate`, `frequency` | Hz/MHz/GHz | `device__attribute_gpu_core_clock_rate` → "1.41 GHz" |
| `_bytes`, `_size` | B/KB/MB/GB | `device__attribute_global_memory_size` → "16.00 GB" |
| `per_cycle` | inst/cycle | `sm__inst_executed.avg.per_cycle_active` → "2.45 inst/cycle" |
| `warp` | warp | `sm__warps_active.avg` → "32.5 warp" |
| `thread_count` | thread | `launch__thread_count` → "256 thread" |

## 🖥️ UI Features and Capabilities

### Kernel Profiling Metrics

The viewer displays comprehensive metrics organized into sections:

#### 1. Summary Page
- **All Kernels Overview** - Total kernel count, optimization hints, info messages
- **Prioritized Rules Table** - All hints sorted by type (OPT first) and estimated speedup
- **Click-to-Navigate** - Jump to any kernel from the summary
- **Statistics** - Aggregate view of all profiling data

#### 2. Session Information
- **Device Details:**
  - GPU name and compute capability (e.g., "NVIDIA A100, SM 8.0")
  - Streaming Multiprocessor (SM) count
  - Total global memory and L2 cache size
- **Clock Rates:**
  - GPU core clock frequency
  - Memory clock frequency
- **Resource Limits:**
  - Max threads per block
  - Max shared memory per block
  - Max registers per block
- **Report Metadata:**
  - NCU file version
  - Total kernels profiled
  - Number of files loaded

#### 3. Overview Tab (Per-Kernel)
**Key Metrics Displayed:**
- **Duration** - Total kernel execution time
- **Compute Throughput** - % of peak SM throughput achieved
- **Memory Throughput** - % of peak memory bandwidth achieved
- **SM Busy** - % of time SMs were actively executing
- **Theoretical Occupancy** - Maximum possible based on resources
- **Achieved Occupancy** - Actual average during execution
- **SM Frequency** - Operating clock speed
- **IPC (Active)** - Instructions per cycle when active

**Kernel Metadata:**
- Grid dimensions (blocks in X, Y, Z)
- Block dimensions (threads per block)
- Compute capability target
- Kernel type classification (GEMM, Conv, Reduce, etc.)

**Optimization Hints:**
- All rule results for the kernel
- Grouped by section
- Colored by type (OPT=orange, INF=blue)

#### 4. GPU Speed of Light Throughput
**Visualizations:**
- **Horizontal bar chart** - Throughput percentages (Compute, Memory, L1, L2)
- **Roofline chart** - Kernel position vs compute/memory ceilings

**Metrics:**
- Duration (ns/us/ms/s)
- Compute (SM) Throughput %
- Memory Throughput %
- L1/TEX Cache Throughput %
- L2 Cache Throughput %
- SM Frequency (GHz)
- Elapsed Cycles

**Interpretation:**
- **Compute Bound** - High compute %, low memory %
- **Memory Bound** - High memory %, low compute %
- **Balanced** - Both compute and memory ~same %

#### 5. Compute Workload Analysis
**Key Metrics:**
- **SM Busy** - % of cycles with active warps
- **Issue Slots Busy** - % of issue slots that issued instructions
- **Executed IPC Active** - Instructions per cycle (active time)
- **Executed IPC Elapsed** - Instructions per cycle (total time)
- **Issued IPC Active** - Issue rate per cycle

**Chart:** Horizontal bar comparison of IPC metrics

**Optimization Focus:**
- Low SM Busy → Occupancy issues
- Low IPC → Instruction mix or dependency problems

#### 6. Memory Workload Analysis
**Enhanced Visualizations:**
- **Memory Hierarchy Chart** - Stacked view of L1→L2→DRAM flow
  - Green bars = cache hits
  - Yellow/orange/red = cache misses flowing to next level
- **Utilization Chart** - Hit rates and bandwidth usage

**Key Metrics:**
- **L1/TEX Hit Rate** - % of L1 cache requests satisfied
- **L2 Hit Rate** - % of L2 cache requests satisfied
- **Max Bandwidth** - Highest memory bandwidth achieved
- **Mem Busy** - % of time memory subsystem active
- **Mem Pipes Busy** - % of memory pipeline utilization

**Table:** Detailed memory transaction breakdown

#### 7. Launch Statistics
- Grid size (total blocks)
- Block size (threads per block)
- Registers per thread
- Shared memory per block (static + dynamic)
- Total thread count
- Waves per SM

#### 8. Occupancy Analysis
**Visualization:** Grouped bar chart showing:
- Block limits by: SM, Registers, Shared Memory, Warps, Barriers
- Theoretical vs Achieved Occupancy

**Metrics:**
- Theoretical Occupancy %
- Achieved Occupancy %
- Block limit factors (what's constraining you)
- Warps per SM (active, theoretical)

**Optimization Guidance:**
- If theoretical < 100% → Resource over-subscription
- If achieved < theoretical → Runtime inefficiencies

#### 9. Scheduler Statistics
**Visualization:** Donut chart of warp eligibility

**Metrics:**
- **One or More Eligible** - % cycles with eligible warps
- **No Eligible** - % cycles with no eligible warps (stalls)
- Issued warps per scheduler
- Active warps per scheduler

**Stall Analysis:**
- High "No Eligible" → Investigate warp state statistics

#### 10. Warp State Statistics
Breakdown of why warps weren't eligible to issue:
- Instruction fetch stalls
- Memory dependency stalls
- Execution dependency stalls
- Synchronization stalls
- Misc stalls

#### 11. Instruction Statistics
- Instructions executed per opcode category
- Thread-level instruction counts
- Instruction mix breakdown
- Control flow instruction count

#### 12. Memory Workload Distribution
- Per-pipeline memory utilization
- DRAM vs L1/L2 vs Shared Memory traffic
- Read/write transaction counts

#### 13. Source Counters
Performance metrics correlated with source lines (when available)

#### 14. PM Sampling
Performance Monitor sampling data:
- Warp states over time
- Stall reasons sampled
- Instruction mix sampled

### Baseline Comparison Mode

**How it Works:**
1. Select a kernel and click **"Set as Baseline"**
2. Navigate to other kernels to see comparisons
3. Metric cards show difference from baseline

**Visualization:**
- Green badge: `+15.2%` (improvement)
- Red badge: `-8.5%` (regression)
- Automatic detection of "higher is better" vs "lower is better"

**Use Cases:**
- Compare before/after optimization
- A/B test different implementations
- Track performance across code changes

### Multi-Kernel Comparison Mode

**How it Works:**
1. Click **"Compare Mode"** button
2. Click on 2-4 kernels to add to comparison
3. View side-by-side in Overview tab

**Visualization:**
- Grid layout with kernels in columns
- Metrics in rows
- Best values highlighted green
- Worst values highlighted red

**Metrics Compared:**
- Duration, Compute/Memory Throughput
- Occupancy (theoretical and achieved)
- SM Busy, Cache hit rates

**Use Cases:**
- Compare multiple kernel variants
- Identify best-performing configuration
- Understand performance patterns across similar kernels

### Search and Filtering

**Search Box:**
- Real-time filtering by kernel name
- Case-insensitive substring matching
- Searches both short and full kernel names

**Type Filter:**
- Filter by kernel classification:
  - GEMM (matrix multiplication)
  - Conv (convolution)
  - Reduce (reduction operations)
  - Elementwise (element-wise operations)
  - Softmax, Normalization
  - Attention (transformer attention)
  - Memory (copy/memset)
  - Other Compute

**Combined Filtering:**
- Search + Type filters work together
- Filtered kernels hidden from sidebar
- Count updates dynamically

### Export Capabilities

**CSV Export:**
- Exports all metric tables in current view
- Includes kernel metadata header
- Properly escaped for Excel/LibreOffice
- Filename: `{kernelName}_{section}.csv`

**Chart Export:**
- All visible charts exported as PNG
- High resolution (canvas native size)
- Filename: `{kernelName}_{chartId}.png`
- Uses Chart.js built-in `toBase64Image()`

### Interactive Tooltips

**Metric Cards:**
- Hover over any metric card for description
- Explains what the metric measures
- Guidance on interpretation

**Metric Tables:**
- Help icon (?) next to complex metrics
- 30+ metrics have detailed descriptions
- Includes formulas where applicable

**Examples:**
- *"Compute (SM) Throughput"* → "Percentage of peak compute (SM) throughput achieved. Higher is better."
- *"Achieved Occupancy"* → "Actual average occupancy achieved during execution"
- *"L1/TEX Hit Rate"* → "Percentage of L1/TEX cache requests that hit"

## 🔧 Architecture

### Tech Stack
- **Frontend:** Vanilla JavaScript (ES6+ modules)
- **Charts:** Chart.js 4.5
- **Build Tool:** Vite 7.3
- **Styling:** CSS Custom Properties (CSS Variables)
- **Binary Parsing:** Custom protobuf decoder (no external dependencies)

### Code Structure
```
src/
├── app.js                  # Main application logic, UI rendering
├── ncu-parser.js          # Binary .ncu-rep file parser
├── parser.js              # Data formatting utilities
├── charts.js              # Chart.js wrapper and chart builders
├── metric-descriptions.js # Metric help text and descriptions
└── styles.css             # Dark theme styling

index.html                 # Entry point
package.json              # Dependencies (vite, chart.js)
```

### Parser Implementation

**Key Design Decisions:**
1. **No protobuf library** - Hand-written wire format decoder
2. **BigInt throughout** - Faithful 64-bit integer handling
3. **Lazy decoding** - Only parse needed fields
4. **Streaming parse** - Process file block-by-block
5. **Memory efficient** - No full file copy in memory

## 📖 References and Resources

### Official NVIDIA Documentation
- [Nsight Compute Homepage](https://developer.nvidia.com/nsight-compute)
- [Nsight Compute Documentation](https://docs.nvidia.com/nsight-compute/)
- [Profiling Guide](https://docs.nvidia.com/nsight-compute/ProfilingGuide/index.html)
- [Customization Guide](https://docs.nvidia.com/nsight-compute/CustomizationGuide/index.html)
- [Python Report Interface](https://docs.nvidia.com/nsight-compute/PythonReportInterface/index.html)

### Protocol Buffers
- [Protocol Buffers Documentation](https://protobuf.dev/)
- [Encoding Guide](https://protobuf.dev/programming-guides/encoding/)
- [Proto2 Language Guide](https://protobuf.dev/programming-guides/proto2/)

### GPU Architecture
- [CUDA C++ Programming Guide](https://docs.nvidia.com/cuda/cuda-c-programming-guide/)
- [CUDA Binary Utilities](https://docs.nvidia.com/cuda/cuda-binary-utilities/)
- [GPU Architecture Whitepapers](https://www.nvidia.com/en-us/data-center/resources/gpu-architecture/)

### Related Tools
- [NVIDIA Nsight Systems](https://developer.nvidia.com/nsight-systems) - Timeline profiler
- [NVIDIA Nsight Graphics](https://developer.nvidia.com/nsight-graphics) - Graphics debugger
- [compute-sanitizer](https://docs.nvidia.com/compute-sanitizer/) - Memory checker


---

**Note:** This is an unofficial tool not affiliated with NVIDIA. For official support, use the NVIDIA Nsight Compute UI or CLI tools.
