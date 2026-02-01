import './styles.css';
import { NcuParser } from './ncu-parser.js';
import { Parser } from './parser.js';
import { Charts } from './charts.js';
import { getMetricDescription } from './metric-descriptions.js';

// Main application logic

const App = {
  // files: [{ fileName, kernels (parsed array), sessionInfo }]
  files: [],
  activeFileIndex: -1,
  activeKernelIndex: -1,
  activeTab: '',
  baseline: null, // { fileIndex, kernelIndex, kernel }
  sessionInfo: null, // Session and device info
  compareMode: false,
  compareKernels: [], // [{ fileIndex, kernelIndex, kernel }]

  init() {
    this.setupUpload();
    this.setupAddFile();
    this.setupBaseline();
    this.setupFilters();
    this.setupExport();
  },

  setupExport() {
    document.getElementById('export-csv-btn').addEventListener('click', () => this.exportCSV());
    document.getElementById('export-charts-btn').addEventListener('click', () => this.exportCharts());
    document.getElementById('compare-toggle-btn').addEventListener('click', () => this.toggleCompareMode());
  },

  toggleCompareMode() {
    this.compareMode = !this.compareMode;
    const btn = document.getElementById('compare-toggle-btn');

    if (this.compareMode) {
      btn.classList.add('baseline-active');
      btn.textContent = `Compare (${this.compareKernels.length})`;
      // Add current kernel to comparison
      const kernel = this.getActiveKernel();
      if (kernel && !this.isInComparison(this.activeFileIndex, this.activeKernelIndex)) {
        this.compareKernels.push({
          fileIndex: this.activeFileIndex,
          kernelIndex: this.activeKernelIndex,
          kernel: kernel
        });
      }
      this.updateKernelListForCompare();
    } else {
      btn.classList.remove('baseline-active');
      btn.textContent = 'Compare Mode';
      this.compareKernels = [];
      this.renderSection(this.activeTab);
      // Remove compare styling from sidebar
      document.querySelectorAll('#kernel-list li').forEach(li => {
        li.classList.remove('compare-selected');
      });
    }
  },

  isInComparison(fileIndex, kernelIndex) {
    return this.compareKernels.some(ck =>
      ck.fileIndex === fileIndex && ck.kernelIndex === kernelIndex
    );
  },

  updateKernelListForCompare() {
    document.querySelectorAll('#kernel-list li').forEach(li => {
      const fileIndex = parseInt(li.dataset.fileIndex);
      const kernelIndex = parseInt(li.dataset.index);

      if (!isNaN(fileIndex) && !isNaN(kernelIndex)) {
        if (this.isInComparison(fileIndex, kernelIndex)) {
          li.classList.add('compare-selected');
        } else {
          li.classList.remove('compare-selected');
        }
      }
    });
  },

  exportCSV() {
    const kernel = this.getActiveKernel();
    if (!kernel) return;

    // Find all metric tables in the current view
    const tables = document.querySelectorAll('.metric-table');
    if (tables.length === 0) {
      alert('No tables to export in this view');
      return;
    }

    let csv = '';
    const summary = this.kernelSummary(kernel);

    // Header
    csv += `Kernel: ${kernel.name}\n`;
    csv += `Grid: ${kernel.grid}, Block: ${kernel.block}\n`;
    csv += `Section: ${this.activeTab}\n\n`;

    tables.forEach((table, idx) => {
      if (idx > 0) csv += '\n\n';

      // Get table headers
      const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent);
      csv += headers.join(',') + '\n';

      // Get table rows
      table.querySelectorAll('tbody tr').forEach(tr => {
        const cells = Array.from(tr.querySelectorAll('td')).map(td => {
          let text = td.textContent.trim();
          // Escape commas and quotes
          if (text.includes(',') || text.includes('"')) {
            text = '"' + text.replace(/"/g, '""') + '"';
          }
          return text;
        });
        csv += cells.join(',') + '\n';
      });
    });

    // Download CSV
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${summary.shortName}_${this.activeTab}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },

  exportCharts() {
    const charts = Object.entries(Charts.instances);
    if (charts.length === 0) {
      alert('No charts to export in this view');
      return;
    }

    const summary = this.kernelSummary(this.getActiveKernel());

    charts.forEach(([canvasId, chart], idx) => {
      const url = chart.toBase64Image();
      const a = document.createElement('a');
      a.href = url;
      a.download = `${summary.shortName}_${canvasId}.png`;
      a.click();
    });
  },

  setupFilters() {
    const searchInput = document.getElementById('kernel-search');
    const typeFilter = document.getElementById('kernel-type-filter');

    searchInput.addEventListener('input', () => this.applyFilters());
    typeFilter.addEventListener('change', () => this.applyFilters());
  },

  applyFilters() {
    const searchText = document.getElementById('kernel-search').value.toLowerCase();
    const typeFilter = document.getElementById('kernel-type-filter').value;

    document.querySelectorAll('#kernel-list li').forEach(li => {
      const fileIndex = parseInt(li.dataset.fileIndex);
      const kernelIndex = parseInt(li.dataset.index);

      if (isNaN(fileIndex) || isNaN(kernelIndex)) return;

      const kernel = this.files[fileIndex].kernels[kernelIndex];
      const summary = this.kernelSummary(kernel);
      const type = Parser.classifyKernel(kernel.name);

      const matchesSearch = summary.shortName.toLowerCase().includes(searchText) ||
                           kernel.name.toLowerCase().includes(searchText);
      const matchesType = !typeFilter || type === typeFilter;

      if (matchesSearch && matchesType) {
        li.style.display = '';
      } else {
        li.style.display = 'none';
      }
    });
  },

  setupBaseline() {
    const btn = document.getElementById('baseline-btn');
    btn.addEventListener('click', () => {
      if (this.baseline &&
          this.baseline.fileIndex === this.activeFileIndex &&
          this.baseline.kernelIndex === this.activeKernelIndex) {
        // Clear baseline
        this.baseline = null;
      } else {
        // Set current kernel as baseline
        const kernel = this.getActiveKernel();
        if (kernel) {
          this.baseline = {
            fileIndex: this.activeFileIndex,
            kernelIndex: this.activeKernelIndex,
            kernel: kernel
          };
        }
      }
      this.updateBaselineUI();
      this.renderSection(this.activeTab); // Re-render to show differences
    });
  },

  updateBaselineUI() {
    const btn = document.getElementById('baseline-btn');
    const label = document.getElementById('baseline-label');

    if (this.baseline) {
      const summary = this.kernelSummary(this.baseline.kernel);
      label.textContent = `Baseline: ${summary.shortName}`;
      label.classList.remove('hidden');

      if (this.baseline.fileIndex === this.activeFileIndex &&
          this.baseline.kernelIndex === this.activeKernelIndex) {
        btn.textContent = 'Clear Baseline';
        btn.classList.add('baseline-active');
      } else {
        btn.textContent = 'Set as Baseline';
        btn.classList.remove('baseline-active');
      }
    } else {
      label.classList.add('hidden');
      btn.textContent = 'Set as Baseline';
      btn.classList.remove('baseline-active');
    }
  },

  // --- Upload (initial screen) ---
  setupUpload() {
    const box = document.getElementById('upload-box');
    const input = document.getElementById('file-input');

    box.addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
      if (input.files.length) this.uploadFile(input.files[0]);
    });

    box.addEventListener('dragover', e => {
      e.preventDefault();
      box.classList.add('dragover');
    });
    box.addEventListener('dragleave', () => box.classList.remove('dragover'));
    box.addEventListener('drop', e => {
      e.preventDefault();
      box.classList.remove('dragover');
      if (e.dataTransfer.files.length) this.uploadFile(e.dataTransfer.files[0]);
    });
  },

  // --- Add File button (from app view) ---
  setupAddFile() {
    const btn = document.getElementById('add-file-btn');
    const input = document.getElementById('add-file-input');

    btn.addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
      if (input.files.length) {
        this.addFile(input.files[0]);
        input.value = '';
      }
    });
  },

  async uploadFile(file) {
    if (!file.name.endsWith('.ncu-rep')) {
      alert('Please upload a .ncu-rep file');
      return;
    }

    const progress = document.getElementById('upload-progress');
    const fill = document.getElementById('progress-fill');
    const status = document.getElementById('upload-status');
    progress.classList.remove('hidden');
    fill.style.width = '30%';
    status.textContent = 'Reading file...';

    try {
      const arrayBuffer = await file.arrayBuffer();
      fill.style.width = '50%';
      status.textContent = 'Parsing binary data...';

      const result = await NcuParser.parseFile(arrayBuffer, msg => {
        status.textContent = msg;
      });

      fill.style.width = '80%';
      status.textContent = 'Building UI...';

      const fileIndex = this.files.length;
      this.files.push({ fileName: file.name, kernels: result.kernels });
      this.updateFileLabel();
      this.renderKernelList();

      fill.style.width = '100%';
      status.textContent = 'Done!';

      setTimeout(() => {
        document.getElementById('upload-screen').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');
        document.getElementById('add-file-btn').classList.remove('hidden');
      }, 300);

      // Select first kernel of this file
      if (result.kernels.length > 0) {
        this.selectKernel(fileIndex, 0);
      }

    } catch (err) {
      status.textContent = 'Error: ' + err.message;
      fill.style.width = '0%';
    }
  },

  async addFile(file) {
    if (!file.name.endsWith('.ncu-rep')) {
      alert('Please upload a .ncu-rep file');
      return;
    }

    // Show a temporary loading indicator in the sidebar
    const ul = document.getElementById('kernel-list');
    const loadingLi = document.createElement('li');
    loadingLi.style.color = 'var(--text-muted)';
    loadingLi.style.fontStyle = 'italic';
    loadingLi.textContent = 'Loading ' + file.name + '...';
    ul.appendChild(loadingLi);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const result = await NcuParser.parseFile(arrayBuffer);

      const fileIndex = this.files.length;
      this.files.push({ fileName: file.name, kernels: result.kernels, sessionInfo: result.sessionInfo });
      if (fileIndex === 0) this.sessionInfo = result.sessionInfo;
      this.updateFileLabel();
      this.renderKernelList();

      // Select first kernel of new file
      if (result.kernels.length > 0) {
        this.selectKernel(fileIndex, 0);
      }

    } catch (err) {
      loadingLi.textContent = 'Error loading ' + file.name + ': ' + err.message;
      loadingLi.style.color = 'var(--red)';
      setTimeout(() => {
        if (loadingLi.parentNode) loadingLi.remove();
      }, 5000);
    }
  },

  updateFileLabel() {
    const label = document.getElementById('file-name');
    if (this.files.length === 1) {
      label.textContent = this.files[0].fileName;
    } else {
      label.textContent = this.files.length + ' files loaded';
    }
  },

  kernelSummary(kernel) {
    // Extract short name (last segment of demangled name before parens)
    let shortName = kernel.name || 'Unknown';
    const parenIdx = shortName.indexOf('(');
    if (parenIdx > 0) shortName = shortName.substring(0, parenIdx);
    const parts = shortName.split('::');
    shortName = parts[parts.length - 1];

    // Find duration from Speed Of Light section
    let duration = '';
    const sol = Parser.findSection(kernel.sections, 'GPU Speed Of Light Throughput');
    if (sol) {
      const dur = Parser.findMetric(sol, 'Duration');
      if (dur) duration = dur.value + ' ' + dur.unit;
    }

    return {
      shortName,
      grid: kernel.grid || '?',
      block: kernel.block || '?',
      duration,
      name: kernel.name
    };
  },

  // --- Kernel List (grouped by file) ---
  renderKernelList() {
    const ul = document.getElementById('kernel-list');
    ul.innerHTML = '';

    const multiFile = this.files.length > 1;

    this.files.forEach((f, fi) => {
      if (multiFile) {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'file-group';

        const header = document.createElement('div');
        header.className = 'file-group-header';
        header.innerHTML = `
          <span class="file-group-name" title="${this.escapeHtml(f.fileName)}">${this.escapeHtml(f.fileName)}</span>
          <span class="file-group-toggle">&#9660;</span>
        `;

        const kernelsDiv = document.createElement('div');
        kernelsDiv.className = 'file-group-kernels';

        header.addEventListener('click', () => {
          kernelsDiv.classList.toggle('collapsed');
          header.querySelector('.file-group-toggle').innerHTML =
            kernelsDiv.classList.contains('collapsed') ? '&#9654;' : '&#9660;';
        });

        f.kernels.forEach((k, i) => {
          kernelsDiv.appendChild(this.createKernelLi(fi, k, i));
        });

        groupDiv.appendChild(header);
        groupDiv.appendChild(kernelsDiv);
        ul.appendChild(groupDiv);
      } else {
        f.kernels.forEach((k, i) => {
          ul.appendChild(this.createKernelLi(fi, k, i));
        });
      }
    });
  },

  createKernelLi(fileIndex, kernel, index) {
    const li = document.createElement('li');
    li.dataset.fileIndex = fileIndex;
    li.dataset.index = index;

    const k = this.kernelSummary(kernel);
    const type = Parser.classifyKernel(k.name);
    li.innerHTML = `
      <div class="kernel-name">${this.escapeHtml(k.shortName)}</div>
      <div class="kernel-meta">
        <span>${type}</span>
        <span>Grid: ${k.grid}</span>
        <span>Block: ${k.block}</span>
        <span>${k.duration}</span>
      </div>
    `;

    if (fileIndex === this.activeFileIndex && index === this.activeKernelIndex) {
      li.classList.add('active');
    }

    li.addEventListener('click', () => this.selectKernel(fileIndex, index));
    return li;
  },

  selectKernel(fileIndex, index) {
    // In compare mode, toggle kernel in comparison list
    if (this.compareMode) {
      const kernel = this.files[fileIndex].kernels[index];
      if (this.isInComparison(fileIndex, index)) {
        // Remove from comparison
        this.compareKernels = this.compareKernels.filter(ck =>
          !(ck.fileIndex === fileIndex && ck.kernelIndex === index)
        );
      } else {
        // Add to comparison
        if (this.compareKernels.length < 4) { // Limit to 4 kernels
          this.compareKernels.push({ fileIndex, kernelIndex, kernel });
        } else {
          alert('Maximum 4 kernels can be compared at once');
          return;
        }
      }
      this.updateKernelListForCompare();
      document.getElementById('compare-toggle-btn').textContent = `Compare (${this.compareKernels.length})`;
      if (this.compareKernels.length > 0) {
        this.renderSection(this.activeTab);
      }
      return;
    }

    if (this.activeFileIndex === fileIndex && this.activeKernelIndex === index) return;
    this.activeFileIndex = fileIndex;
    this.activeKernelIndex = index;

    // Update sidebar active state
    document.querySelectorAll('#kernel-list li').forEach(li => {
      li.classList.toggle('active',
        parseInt(li.dataset.fileIndex) === fileIndex && parseInt(li.dataset.index) === index);
    });

    // Show toolbar buttons
    document.getElementById('baseline-btn').classList.remove('hidden');
    document.getElementById('compare-toggle-btn').classList.remove('hidden');
    document.getElementById('export-csv-btn').classList.remove('hidden');
    document.getElementById('export-charts-btn').classList.remove('hidden');
    this.updateBaselineUI();

    this.renderTabs();
  },

  getActiveKernel() {
    const file = this.files[this.activeFileIndex];
    return file ? file.kernels[this.activeKernelIndex] : null;
  },

  getActiveKernelSummary() {
    const kernel = this.getActiveKernel();
    return kernel ? this.kernelSummary(kernel) : null;
  },

  // --- Tabs ---
  renderTabs() {
    const kernel = this.getActiveKernel();
    if (!kernel) return;

    console.log("Kernel source data:", kernel.source);

    const tabDefs = [
      { id: 'summary', label: 'Summary' },
      { id: 'session', label: 'Session' },
      { id: 'overview', label: 'Overview' },
      { id: 'sol', label: 'Speed of Light', match: 'GPU Speed Of Light Throughput' },
      { id: 'compute', label: 'Compute', match: 'Compute Workload Analysis' },
      { id: 'memory', label: 'Memory', match: 'Memory Workload Analysis' },
      { id: 'launch', label: 'Launch Stats', match: 'Launch Statistics' },
      { id: 'occupancy', label: 'Occupancy', match: 'Occupancy' },
      { id: 'scheduler', label: 'Scheduler', match: 'Scheduler Statistics' },
      { id: 'warpstate', label: 'Warp State', match: 'Warp State Statistics' },
      { id: 'instructions', label: 'Instructions', match: 'Instruction Statistics' },
      { id: 'distribution', label: 'Workload Dist.', match: 'GPU and Memory Workload Distribution' },
      { id: 'source', label: 'Source Counters', match: 'Source Counters' },
      { id: 'pmsampling', label: 'PM Sampling', match: 'PM Sampling' },
      { id: 'sourcecode', label: 'Source', match: (k) => k.source && k.source.length > 0 }
    ];

    const availableTabs = tabDefs.filter(t => {
      if (t.id === 'summary' || t.id === 'session' || t.id === 'overview') return true;
      if (typeof t.match === 'function') return t.match(kernel);
      return kernel.sections.some(s => s.name === t.match);
    });

    const tabBar = document.getElementById('tab-bar');
    tabBar.innerHTML = '';

    availableTabs.forEach(t => {
      const btn = document.createElement('button');
      btn.textContent = t.label;
      btn.dataset.tab = t.id;
      btn.addEventListener('click', () => this.selectTab(t.id));
      tabBar.appendChild(btn);
    });

    // Check if the old active tab is still available, otherwise switch to the first one
    if (availableTabs.some(t => t.id === this.activeTab)) {
      this.selectTab(this.activeTab);
    } else {
      this.selectTab(availableTabs[0].id);
    }
  },

  selectTab(tabId) {
    this.activeTab = tabId;

    document.querySelectorAll('.tab-bar button').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });

    Charts.destroyAll();
    this.renderSection(tabId);
  },

  // --- Section Rendering ---
  renderSection(tabId) {
    const kernel = this.getActiveKernel();
    const content = document.getElementById('section-content');

    const renderers = {
      summary: () => this.renderSummary(),
      session: () => this.renderSession(),
      overview: () => this.renderOverview(kernel),
      sol: () => this.renderSol(kernel),
      compute: () => this.renderCompute(kernel),
      memory: () => this.renderMemory(kernel),
      launch: () => this.renderGenericSection(kernel, 'Launch Statistics'),
      occupancy: () => this.renderOccupancy(kernel),
      scheduler: () => this.renderScheduler(kernel),
      warpstate: () => this.renderGenericSection(kernel, 'Warp State Statistics'),
      instructions: () => this.renderGenericSection(kernel, 'Instruction Statistics'),
      distribution: () => this.renderGenericSection(kernel, 'GPU and Memory Workload Distribution'),
      source: () => this.renderGenericSection(kernel, 'Source Counters'),
      pmsampling: () => this.renderGenericSection(kernel, 'PM Sampling'),
      sourcecode: () => this.renderSourceCode(kernel)
    };

    const renderer = renderers[tabId];
    if (renderer) {
      content.innerHTML = renderer();
      this.postRenderCharts(tabId, kernel);
    }
  },

  postRenderCharts(tabId, kernel) {
    if (tabId === 'summary') {
      // Add click handlers to summary table rows
      document.querySelectorAll('.summary-row').forEach(row => {
        row.addEventListener('click', () => {
          const fileIndex = parseInt(row.dataset.fileIndex);
          const kernelIndex = parseInt(row.dataset.kernelIndex);
          this.selectKernel(fileIndex, kernelIndex);
        });
      });
    } else if (tabId === 'sol') {
      const sec = Parser.findSection(kernel.sections, 'GPU Speed Of Light Throughput');
      if (sec) {
        Charts.speedOfLight('chart-sol', sec);
        Charts.roofline('chart-roofline', sec, kernel);
      }
    } else if (tabId === 'occupancy') {
      const sec = Parser.findSection(kernel.sections, 'Occupancy');
      if (sec) Charts.occupancy('chart-occupancy', sec);
    } else if (tabId === 'scheduler') {
      const sec = Parser.findSection(kernel.sections, 'Scheduler Statistics');
      if (sec) Charts.schedulerDonut('chart-scheduler', sec);
    } else if (tabId === 'memory') {
      const sec = Parser.findSection(kernel.sections, 'Memory Workload Analysis');
      if (sec) {
        Charts.memoryHierarchy('chart-memory-hierarchy', sec);
        Charts.memoryBars('chart-memory', sec);
      }
    } else if (tabId === 'compute') {
      const sec = Parser.findSection(kernel.sections, 'Compute Workload Analysis');
      if (sec) {
        const labels = [];
        const values = [];
        ['Executed Ipc Active', 'Executed Ipc Elapsed', 'Issued Ipc Active'].forEach(name => {
          const val = Parser.metricValue(sec, name);
          if (!isNaN(val)) {
            labels.push(name);
            values.push(val);
          }
        });
        if (labels.length) {
          Charts.horizontalBar('chart-compute', labels, values, { unit: 'inst/cycle' });
        }
      }
    }
  },

  // --- Source Code Rendering ---
  renderSourceCode(kernel) {
    if (!kernel.source || kernel.source.length === 0) {
      return '<p class="error-msg">No source information available for this kernel.</p>';
    }
    return `
      <h2 class="section-title">Source Code</h2>
      <div class="source-code-container">
        ${this.sourceTable(kernel.source)}
      </div>
    `;
  },
  
  // --- Session ---
  renderSession() {
    if (!this.sessionInfo) {
      return '<p class="error-msg">No session information available</p>';
    }

    const s = this.sessionInfo;
    const memoryGB = s.memoryTotal ? (s.memoryTotal / (1024 * 1024 * 1024)).toFixed(2) : 'N/A';
    const l2CacheMB = s.l2CacheSize ? (s.l2CacheSize / (1024 * 1024)).toFixed(2) : 'N/A';
    const clockGHz = s.clockRate ? (s.clockRate / 1000).toFixed(2) : 'N/A';
    const memClockGHz = s.memoryClockRate ? (s.memoryClockRate / 1000).toFixed(2) : 'N/A';

    return `
      <h2 class="section-title">Session Information</h2>

      <div class="session-section">
        <h3 class="session-section-title">Device Information</h3>
        <table class="session-table">
          <tbody>
            <tr><td class="session-label">Device Name</td><td class="session-value">${this.escapeHtml(s.deviceName || 'Unknown')}</td></tr>
            <tr><td class="session-label">Compute Capability</td><td class="session-value">${s.computeCapability || 'Unknown'}</td></tr>
            <tr><td class="session-label">SM Count</td><td class="session-value">${s.smCount || 'N/A'}</td></tr>
            <tr><td class="session-label">Total Global Memory</td><td class="session-value">${memoryGB} GB</td></tr>
            <tr><td class="session-label">L2 Cache Size</td><td class="session-value">${l2CacheMB} MB</td></tr>
          </tbody>
        </table>
      </div>

      <div class="session-section">
        <h3 class="session-section-title">Clock Rates</h3>
        <table class="session-table">
          <tbody>
            <tr><td class="session-label">GPU Core Clock</td><td class="session-value">${clockGHz} GHz</td></tr>
            <tr><td class="session-label">Memory Clock</td><td class="session-value">${memClockGHz} GHz</td></tr>
          </tbody>
        </table>
      </div>

      <div class="session-section">
        <h3 class="session-section-title">Block Limits</h3>
        <table class="session-table">
          <tbody>
            <tr><td class="session-label">Max Threads per Block</td><td class="session-value">${s.maxThreadsPerBlock || 'N/A'}</td></tr>
            <tr><td class="session-label">Max Shared Memory per Block</td><td class="session-value">${s.maxSharedMemPerBlock ? (s.maxSharedMemPerBlock / 1024).toFixed(0) + ' KB' : 'N/A'}</td></tr>
            <tr><td class="session-label">Max Registers per Block</td><td class="session-value">${s.maxRegistersPerBlock || 'N/A'}</td></tr>
          </tbody>
        </table>
      </div>

      <div class="session-section">
        <h3 class="session-section-title">Report Information</h3>
        <table class="session-table">
          <tbody>
            <tr><td class="session-label">File Version</td><td class="session-value">${s.fileVersion || 'Unknown'}</td></tr>
            <tr><td class="session-label">Total Kernels</td><td class="session-value">${this.files.reduce((sum, f) => sum + f.kernels.length, 0)}</td></tr>
            <tr><td class="session-label">Files Loaded</td><td class="session-value">${this.files.length}</td></tr>
          </tbody>
        </table>
      </div>
    `;
  },

  // --- Summary ---
  renderSummary() {
    // Collect all hints from all kernels across all files
    const allHints = [];

    this.files.forEach((file, fileIndex) => {
      file.kernels.forEach((kernel, kernelIndex) => {
        const summary = this.kernelSummary(kernel);
        kernel.sections.forEach(sec => {
          sec.hints.forEach(hint => {
            allHints.push({
              fileIndex,
              kernelIndex,
              kernelName: summary.shortName,
              kernelFullName: kernel.name,
              sectionName: sec.name,
              type: hint.type,
              text: hint.text,
              // Try to extract speedup/priority from hint text
              priority: this.extractPriority(hint.text, hint.type)
            });
          });
        });
      });
    });

    // Sort by priority (OPT first, then by extracted speedup if available)
    allHints.sort((a, b) => {
      if (a.type === 'OPT' && b.type !== 'OPT') return -1;
      if (a.type !== 'OPT' && b.type === 'OPT') return 1;
      return b.priority - a.priority;
    });

    const totalKernels = this.files.reduce((sum, f) => sum + f.kernels.length, 0);
    const optCount = allHints.filter(h => h.type === 'OPT').length;
    const infCount = allHints.filter(h => h.type === 'INF').length;

    let html = `
      <h2 class="section-title">Summary: All Kernels</h2>
      <div class="summary-stats">
        <div class="summary-stat">
          <span class="summary-stat-value">${totalKernels}</span>
          <span class="summary-stat-label">Total Kernels</span>
        </div>
        <div class="summary-stat">
          <span class="summary-stat-value color-orange">${optCount}</span>
          <span class="summary-stat-label">Optimization Hints</span>
        </div>
        <div class="summary-stat">
          <span class="summary-stat-value color-blue">${infCount}</span>
          <span class="summary-stat-label">Info Messages</span>
        </div>
      </div>
      <h3 style="margin: 24px 0 12px; color: #a0a0b0; font-size: 16px;">Prioritized Rules</h3>`;

    if (allHints.length === 0) {
      html += '<p style="color: #707088; text-align: center; padding: 40px;">No optimization hints or information messages found.</p>';
    } else {
      html += `<table class="summary-table">
        <thead>
          <tr>
            <th class="col-type">Type</th>
            <th class="col-kernel">Kernel</th>
            <th class="col-section">Section</th>
            <th class="col-hint">Hint</th>
          </tr>
        </thead>
        <tbody>`;

      allHints.forEach(hint => {
        const typeClass = hint.type === 'OPT' ? 'hint-type-opt' : 'hint-type-inf';
        const typeLabel = hint.type === 'OPT' ? 'OPT' : 'INF';

        html += `<tr class="summary-row" data-file-index="${hint.fileIndex}" data-kernel-index="${hint.kernelIndex}">
          <td class="col-type"><span class="hint-type-badge ${typeClass}">${typeLabel}</span></td>
          <td class="col-kernel" title="${this.escapeHtml(hint.kernelFullName)}">${this.escapeHtml(hint.kernelName)}</td>
          <td class="col-section">${this.escapeHtml(hint.sectionName)}</td>
          <td class="col-hint">${this.escapeHtml(hint.text)}</td>
        </tr>`;
      });

      html += '</tbody></table>';
    }

    return html;
  },

  renderComparisonOverview() {
    const keyMetrics = [
      { name: 'Duration', section: 'GPU Speed Of Light Throughput' },
      { name: 'Compute (SM) Throughput', section: 'GPU Speed Of Light Throughput' },
      { name: 'Memory Throughput', section: 'GPU Speed Of Light Throughput' },
      { name: 'Theoretical Occupancy', section: 'Occupancy' },
      { name: 'Achieved Occupancy', section: 'Occupancy' },
      { name: 'SM Busy', section: 'Compute Workload Analysis' },
      { name: 'L1/TEX Hit Rate', section: 'Memory Workload Analysis' },
      { name: 'L2 Hit Rate', section: 'Memory Workload Analysis' }
    ];

    let html = '<h2 class="section-title">Kernel Comparison</h2>';
    html += '<div class="comparison-grid">';

    // Header row with kernel names
    html += '<div class="comparison-header"><div class="comparison-metric-label">Metric</div>';
    this.compareKernels.forEach(ck => {
      const summary = this.kernelSummary(ck.kernel);
      html += `<div class="comparison-kernel-header" title="${this.escapeHtml(ck.kernel.name)}">${this.escapeHtml(summary.shortName)}</div>`;
    });
    html += '</div>';

    // Metric rows
    keyMetrics.forEach(metric => {
      html += '<div class="comparison-row">';
      html += `<div class="comparison-metric-label">${this.escapeHtml(metric.name)}</div>`;

      const values = this.compareKernels.map(ck => {
        const sec = Parser.findSection(ck.kernel.sections, metric.section);
        if (!sec) return null;
        const m = Parser.findMetric(sec, metric.name);
        return m ? { value: m.value, unit: m.unit, rawValue: Parser.toNumber(m.value) } : null;
      });

      // Find min/max for coloring
      const numValues = values.map(v => v?.rawValue).filter(v => !isNaN(v));
      const minVal = Math.min(...numValues);
      const maxVal = Math.max(...numValues);

      values.forEach(v => {
        if (!v) {
          html += '<div class="comparison-cell">-</div>';
        } else {
          let colorClass = '';
          if (!isNaN(v.rawValue) && numValues.length > 1) {
            // For most metrics, higher is better. For duration, lower is better.
            const lowerIsBetter = metric.name.includes('Duration');
            if (lowerIsBetter) {
              if (v.rawValue === minVal) colorClass = 'comparison-best';
              else if (v.rawValue === maxVal) colorClass = 'comparison-worst';
            } else {
              if (v.rawValue === maxVal) colorClass = 'comparison-best';
              else if (v.rawValue === minVal) colorClass = 'comparison-worst';
            }
          }
          html += `<div class="comparison-cell ${colorClass}">${this.escapeHtml(v.value)} ${this.escapeHtml(v.unit)}</div>`;
        }
      });

      html += '</div>';
    });

    html += '</div>';
    return html;
  },

  extractPriority(text, type) {
    // Extract potential speedup or priority from hint text
    // OPT hints get base priority of 100, INF gets 0
    let basePriority = type === 'OPT' ? 100 : 0;

    // Look for speedup percentages or multipliers
    const speedupMatch = text.match(/(\d+(?:\.\d+)?)\s*[x×]\s*speedup/i);
    if (speedupMatch) {
      basePriority += parseFloat(speedupMatch[1]) * 10;
    }

    const percentMatch = text.match(/(\d+(?:\.\d+)?)\s*%\s*(?:faster|improvement)/i);
    if (percentMatch) {
      basePriority += parseFloat(percentMatch[1]);
    }

    return basePriority;
  },

  // --- Overview ---
  renderOverview(kernel) {
    // If in compare mode with multiple kernels, show comparison view
    if (this.compareMode && this.compareKernels.length > 1) {
      return this.renderComparisonOverview();
    }

    // Normal single kernel overview
    const sol = Parser.findSection(kernel.sections, 'GPU Speed Of Light Throughput');
    const occ = Parser.findSection(kernel.sections, 'Occupancy');
    const compute = Parser.findSection(kernel.sections, 'Compute Workload Analysis');

    const cards = [];

    if (sol) {
      const dur = Parser.findMetric(sol, 'Duration');
      if (dur) cards.push(this.metricCard(dur.value, dur.unit, 'Duration', 'color-blue'));
    }
    if (sol) {
      const ct = Parser.findMetric(sol, 'Compute (SM) Throughput');
      if (ct) cards.push(this.metricCard(ct.value, ct.unit, 'Compute Throughput', Parser.utilizationColor(ct.value)));
    }
    if (sol) {
      const mt = Parser.findMetric(sol, 'Memory Throughput');
      if (mt) cards.push(this.metricCard(mt.value, mt.unit, 'Memory Throughput', Parser.utilizationColor(mt.value)));
    }
    if (compute) {
      const smb = Parser.findMetric(compute, 'SM Busy');
      if (smb) cards.push(this.metricCard(smb.value, smb.unit, 'SM Busy', Parser.utilizationColor(smb.value)));
    }
    if (occ) {
      const to = Parser.findMetric(occ, 'Theoretical Occupancy');
      if (to) cards.push(this.metricCard(to.value, to.unit, 'Theoretical Occupancy', Parser.utilizationColor(to.value)));
    }
    if (occ) {
      const ao = Parser.findMetric(occ, 'Achieved Occupancy');
      if (ao) cards.push(this.metricCard(ao.value, ao.unit, 'Achieved Occupancy', Parser.utilizationColor(ao.value)));
    }
    if (sol) {
      const freq = Parser.findMetric(sol, 'SM Frequency');
      if (freq) cards.push(this.metricCard(freq.value, freq.unit, 'SM Frequency', 'color-blue'));
    }
    if (compute) {
      const ipc = Parser.findMetric(compute, 'Executed Ipc Active');
      if (ipc) cards.push(this.metricCard(ipc.value, ipc.unit, 'IPC (Active)', 'color-blue'));
    }

    let hintsHtml = '';
    kernel.sections.forEach(sec => {
      sec.hints.forEach(h => {
        hintsHtml += this.hintBox(h.type, h.text, sec.name);
      });
    });

    const summary = this.getActiveKernelSummary();
    const shortName = summary ? summary.shortName : kernel.name;

    return `
      <h2 class="section-title">Overview: ${this.escapeHtml(shortName)}</h2>
      <div class="kernel-meta" style="margin-bottom:20px;font-size:13px;color:#a0a0b0">
        Grid: (${kernel.grid}) &nbsp; Block: (${kernel.block}) &nbsp; CC: ${kernel.cc} &nbsp;
        Type: ${Parser.classifyKernel(kernel.name)}
      </div>
      <div class="metric-cards">${cards.join('')}</div>
      <h3 style="margin-bottom:12px;color:#a0a0b0;font-size:14px">Optimization Hints</h3>
      ${hintsHtml || '<p style="color:#707088">No hints for this kernel.</p>'}
    `;
  },

  // --- Speed of Light ---
  renderSol(kernel) {
    const sec = Parser.findSection(kernel.sections, 'GPU Speed Of Light Throughput');
    if (!sec) return '<p class="error-msg">Section not found</p>';

    return `
      <h2 class="section-title">GPU Speed Of Light Throughput</h2>
      <div class="two-col">
        <div class="chart-container" style="height:250px">
          <h3>Throughput (% of Peak)</h3>
          <canvas id="chart-sol"></canvas>
        </div>
        <div class="chart-container" style="height:250px">
          <h3>Roofline Analysis</h3>
          <canvas id="chart-roofline"></canvas>
        </div>
      </div>
      <div>
        ${this.metricsTable(sec)}
      </div>
      ${this.renderHints(sec)}
      ${this.renderRooflineHints(kernel)}
    `;
  },

  renderRooflineHints(kernel) {
    const roofline = Parser.findSection(kernel.sections, 'Roofline');
    if (!roofline || !roofline.hints.length) return '';
    return roofline.hints.map(h => this.hintBox(h.type, h.text)).join('');
  },

  // --- Compute ---
  renderCompute(kernel) {
    const sec = Parser.findSection(kernel.sections, 'Compute Workload Analysis');
    if (!sec) return '<p class="error-msg">Section not found</p>';

    const smBusy = Parser.metricValue(sec, 'SM Busy');
    const issueSlots = Parser.metricValue(sec, 'Issue Slots Busy');

    const cards = [];
    if (!isNaN(smBusy)) cards.push(this.metricCard(smBusy.toFixed(2), '%', 'SM Busy', Parser.utilizationColor(smBusy)));
    if (!isNaN(issueSlots)) cards.push(this.metricCard(issueSlots.toFixed(2), '%', 'Issue Slots Busy', Parser.utilizationColor(issueSlots)));

    return `
      <h2 class="section-title">Compute Workload Analysis</h2>
      <div class="metric-cards">${cards.join('')}</div>
      <div class="two-col">
        <div class="chart-container" style="height:220px">
          <h3>IPC Metrics</h3>
          <canvas id="chart-compute"></canvas>
        </div>
        <div>
          ${this.metricsTable(sec)}
        </div>
      </div>
      ${this.renderHints(sec)}
    `;
  },

  // --- Memory ---
  renderMemory(kernel) {
    const sec = Parser.findSection(kernel.sections, 'Memory Workload Analysis');
    if (!sec) return '<p class="error-msg">Section not found</p>';

    const l1Hit = Parser.metricValue(sec, 'L1/TEX Hit Rate');
    const l2Hit = Parser.metricValue(sec, 'L2 Hit Rate');
    const maxBw = Parser.metricValue(sec, 'Max Bandwidth');

    const cards = [];
    if (!isNaN(l1Hit)) cards.push(this.metricCard(l1Hit.toFixed(2), '%', 'L1 Hit Rate', Parser.utilizationColor(l1Hit)));
    if (!isNaN(l2Hit)) cards.push(this.metricCard(l2Hit.toFixed(2), '%', 'L2 Hit Rate', Parser.utilizationColor(l2Hit)));
    if (!isNaN(maxBw)) cards.push(this.metricCard(maxBw.toFixed(2), '%', 'Max Bandwidth', Parser.utilizationColor(maxBw)));

    return `
      <h2 class="section-title">Memory Workload Analysis</h2>
      <div class="metric-cards">${cards.join('')}</div>
      <div class="two-col">
        <div class="chart-container" style="height:280px">
          <h3>Memory Hierarchy</h3>
          <canvas id="chart-memory-hierarchy"></canvas>
        </div>
        <div class="chart-container" style="height:280px">
          <h3>Memory Utilization (%)</h3>
          <canvas id="chart-memory"></canvas>
        </div>
      </div>
      <div>
        ${this.metricsTable(sec)}
      </div>
      ${this.renderHints(sec)}
    `;
  },

  // --- Occupancy ---
  renderOccupancy(kernel) {
    const sec = Parser.findSection(kernel.sections, 'Occupancy');
    if (!sec) return '<p class="error-msg">Section not found</p>';

    const theoretical = Parser.metricValue(sec, 'Theoretical Occupancy');
    const achieved = Parser.metricValue(sec, 'Achieved Occupancy');

    const cards = [];
    if (!isNaN(theoretical)) cards.push(this.metricCard(theoretical.toFixed(2), '%', 'Theoretical Occupancy', Parser.utilizationColor(theoretical)));
    if (!isNaN(achieved)) cards.push(this.metricCard(achieved.toFixed(2), '%', 'Achieved Occupancy', Parser.utilizationColor(achieved)));

    return `
      <h2 class="section-title">Occupancy</h2>
      <div class="metric-cards">${cards.join('')}</div>
      <div class="chart-container" style="height:350px">
        <h3>Block Limits &amp; Occupancy</h3>
        <canvas id="chart-occupancy"></canvas>
      </div>
      ${this.metricsTable(sec)}
      ${this.renderHints(sec)}
    `;
  },

  // --- Scheduler ---
  renderScheduler(kernel) {
    const sec = Parser.findSection(kernel.sections, 'Scheduler Statistics');
    if (!sec) return '<p class="error-msg">Section not found</p>';

    const eligible = Parser.metricValue(sec, 'One or More Eligible');
    const noEligible = Parser.metricValue(sec, 'No Eligible');

    const cards = [];
    if (!isNaN(eligible)) cards.push(this.metricCard(eligible.toFixed(2), '%', 'Eligible', 'color-green'));
    if (!isNaN(noEligible)) cards.push(this.metricCard(noEligible.toFixed(2), '%', 'No Eligible', 'color-red'));

    const wps = Parser.findMetric(sec, 'Issued Warp Per Scheduler');
    if (wps) cards.push(this.metricCard(wps.value, '', 'Issued Warp/Scheduler', 'color-blue'));

    const activeWarps = Parser.findMetric(sec, 'Active Warps Per Scheduler');
    if (activeWarps) cards.push(this.metricCard(activeWarps.value, activeWarps.unit, 'Active Warps/Scheduler', 'color-blue'));

    return `
      <h2 class="section-title">Scheduler Statistics</h2>
      <div class="metric-cards">${cards.join('')}</div>
      <div class="two-col">
        <div class="chart-container" style="height:280px">
          <h3>Eligible vs No Eligible</h3>
          <canvas id="chart-scheduler"></canvas>
        </div>
        <div>
          ${this.metricsTable(sec)}
        </div>
      </div>
      ${this.renderHints(sec)}
    `;
  },

  // --- Generic Section (table + hints) ---
  renderGenericSection(kernel, sectionName) {
    const sec = kernel.sections.find(s => s.name === sectionName);
    if (!sec) return '<p class="error-msg">Section not found</p>';

    return `
      <h2 class="section-title">${this.escapeHtml(sectionName)}</h2>
      ${this.metricsTable(sec)}
      ${this.renderHints(sec)}
    `;
  },

  // --- Helpers ---
  sourceTable(sourceLines) {
    let html = `<table class="source-table">
      <thead><tr>
        <th class="col-address">Address</th>
        <th class="col-sass">SASS</th>
        <th class="col-ptx">PTX</th>
        <th class="col-source">Source</th>
      </tr></thead>
      <tbody>`;

    let lastFile = '';
    let lastLine = 0;

    sourceLines.forEach(line => {
      let fileDisplay = '';
      if (line.file && (line.file !== lastFile || line.line !== lastLine)) {
        const shortFile = line.file.split('/').pop();
        fileDisplay = `<span class="source-loc" title="${this.escapeHtml(line.file)}">${this.escapeHtml(shortFile)}:${line.line}</span>`;
        lastFile = line.file;
        lastLine = line.line;
      }

      html += `<tr>
        <td class="col-address">${this.escapeHtml(line.address)}</td>
        <td class="col-sass"><pre>${this.escapeHtml(line.sass)}</pre></td>
        <td class="col-ptx"><pre>${this.escapeHtml(line.ptx)}</pre></td>
        <td class="col-source">${fileDisplay}</td>
      </tr>`;
    });

    html += '</tbody></table>';
    return html;
  },

  metricsTable(section) {
    if (!section.metrics || section.metrics.length === 0) return '';
    let html = `<table class="metric-table">
      <thead><tr><th>Metric</th><th class="unit-col">Unit</th><th class="value-col">Value</th></tr></thead>
      <tbody>`;

    section.metrics.forEach(m => {
      const description = getMetricDescription(m.name);
      const tooltip = description ? `<span class="metric-help" title="${this.escapeHtml(description)}">?</span>` : '';

      html += `<tr>
        <td><span class="metric-name-with-help">${this.escapeHtml(m.name)}${tooltip}</span></td>
        <td class="unit-col">${this.escapeHtml(m.unit)}</td>
        <td class="value-col">${this.escapeHtml(m.value)}</td>
      </tr>`;
    });

    html += '</tbody></table>';
    return html;
  },
  
  renderHints(section) {
    if (!section.hints || section.hints.length === 0) return '';
    return section.hints.map(h => this.hintBox(h.type, h.text)).join('');
  },

  hintBox(type, text, sectionName) {
    const cls = type === 'OPT' ? 'hint-opt' : 'hint-inf';
    const label = type === 'OPT' ? 'OPT' : 'INF';
    const prefix = sectionName ? `<span style="opacity:0.7">[${this.escapeHtml(sectionName)}]</span> ` : '';
    return `<div class="hint-box ${cls}">${prefix}<span class="hint-label">${label}</span>${this.escapeHtml(text)}</div>`;
  },

  metricCard(value, unit, label, colorClass) {
    let comparisonHtml = '';
    if (this.baseline) {
      const baselineValue = this.getBaselineMetric(label);
      if (baselineValue !== null) {
        const diff = this.compareMetrics(value, baselineValue, unit);
        if (diff) {
          comparisonHtml = `<div class="metric-comparison ${diff.class}">${diff.text}</div>`;
        }
      }
    }

    const description = getMetricDescription(label);
    const titleAttr = description ? ` title="${this.escapeHtml(description)}"` : '';

    return `<div class="metric-card"${titleAttr}>
      <div class="metric-value ${colorClass}">${this.escapeHtml(String(value))}<span class="metric-unit">${this.escapeHtml(unit)}</span></div>
      <div class="metric-label">${this.escapeHtml(label)}</div>
      ${comparisonHtml}
    </div>`;
  },

  getBaselineMetric(label) {
    if (!this.baseline) return null;
    const kernel = this.baseline.kernel;

    // Try to find the metric in the baseline kernel
    // This is a simplified version - match by label
    for (const sec of kernel.sections) {
      for (const metric of sec.metrics) {
        if (metric.name === label) {
          return Parser.toNumber(metric.value);
        }
      }
    }
    return null;
  },

  compareMetrics(currentValue, baselineValue, unit) {
    const current = typeof currentValue === 'number' ? currentValue : Parser.toNumber(currentValue);
    const baseline = typeof baselineValue === 'number' ? baselineValue : Parser.toNumber(baselineValue);

    if (isNaN(current) || isNaN(baseline) || baseline === 0) return null;

    const diff = current - baseline;
    const percentDiff = (diff / baseline) * 100;

    // For most metrics, higher is better. For duration, lower is better.
    const lowerIsBetter = unit.toLowerCase().includes('ms') ||
                         unit.toLowerCase().includes('ns') ||
                         unit.toLowerCase().includes('us') ||
                         unit.toLowerCase().includes('cycle');

    let isImprovement;
    if (lowerIsBetter) {
      isImprovement = diff < 0;
    } else {
      isImprovement = diff > 0;
    }

    const absPercent = Math.abs(percentDiff).toFixed(1);
    const sign = diff > 0 ? '+' : '';
    const className = isImprovement ? 'comparison-better' : 'comparison-worse';

    return {
      text: `${sign}${absPercent}%`,
      class: className
    };
  },

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
