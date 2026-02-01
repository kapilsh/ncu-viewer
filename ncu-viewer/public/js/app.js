// Main application logic

const App = {
  // files: [{ fileId, fileName, kernels (summary list) }]
  files: [],
  kernelData: {},    // cache keyed by "fileId:kernelIndex"
  activeFileId: null,
  activeKernelIndex: -1,
  activeTab: '',

  init() {
    this.setupUpload();
    this.setupAddFile();
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
    status.textContent = 'Uploading...';

    const formData = new FormData();
    formData.append('file', file);

    try {
      fill.style.width = '50%';
      status.textContent = 'Parsing with ncu CLI...';

      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Upload failed');
      }

      const data = await res.json();
      fill.style.width = '80%';
      status.textContent = 'Loading kernels...';

      const kernelsRes = await fetch(`/api/kernels/${data.fileId}`);
      const kernels = await kernelsRes.json();

      this.files.push({ fileId: data.fileId, fileName: file.name, kernels });
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
      if (kernels.length > 0) {
        this.selectKernel(data.fileId, 0);
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

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Upload failed');
      }

      const data = await res.json();
      const kernelsRes = await fetch(`/api/kernels/${data.fileId}`);
      const kernels = await kernelsRes.json();

      this.files.push({ fileId: data.fileId, fileName: file.name, kernels });
      this.updateFileLabel();
      this.renderKernelList();

      // Select first kernel of new file
      if (kernels.length > 0) {
        this.selectKernel(data.fileId, 0);
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

  // --- Kernel List (grouped by file) ---
  renderKernelList() {
    const ul = document.getElementById('kernel-list');
    ul.innerHTML = '';

    const multiFile = this.files.length > 1;

    this.files.forEach(f => {
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
          kernelsDiv.appendChild(this.createKernelLi(f.fileId, k, i));
        });

        groupDiv.appendChild(header);
        groupDiv.appendChild(kernelsDiv);
        ul.appendChild(groupDiv);
      } else {
        f.kernels.forEach((k, i) => {
          ul.appendChild(this.createKernelLi(f.fileId, k, i));
        });
      }
    });
  },

  createKernelLi(fileId, k, index) {
    const li = document.createElement('li');
    li.dataset.fileId = fileId;
    li.dataset.index = index;

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

    if (fileId === this.activeFileId && index === this.activeKernelIndex) {
      li.classList.add('active');
    }

    li.addEventListener('click', () => this.selectKernel(fileId, index));
    return li;
  },

  async selectKernel(fileId, index) {
    if (this.activeFileId === fileId && this.activeKernelIndex === index) return;
    this.activeFileId = fileId;
    this.activeKernelIndex = index;

    // Update sidebar active state
    document.querySelectorAll('#kernel-list li').forEach(li => {
      li.classList.toggle('active',
        li.dataset.fileId === fileId && parseInt(li.dataset.index) === index);
    });

    // Load kernel data if not cached
    const cacheKey = fileId + ':' + index;
    if (!this.kernelData[cacheKey]) {
      const res = await fetch(`/api/kernel/${fileId}/${index}`);
      this.kernelData[cacheKey] = await res.json();
    }

    this.renderTabs();
  },

  getActiveKernel() {
    const cacheKey = this.activeFileId + ':' + this.activeKernelIndex;
    return this.kernelData[cacheKey];
  },

  getActiveKernelSummary() {
    const file = this.files.find(f => f.fileId === this.activeFileId);
    return file ? file.kernels[this.activeKernelIndex] : null;
  },

  // --- Tabs ---
  renderTabs() {
    const kernel = this.getActiveKernel();
    if (!kernel) return;

    const tabDefs = [
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
      { id: 'pmsampling', label: 'PM Sampling', match: 'PM Sampling' }
    ];

    const availableTabs = tabDefs.filter(t =>
      t.id === 'overview' || kernel.sections.some(s => s.name === t.match)
    );

    const tabBar = document.getElementById('tab-bar');
    tabBar.innerHTML = '';

    availableTabs.forEach(t => {
      const btn = document.createElement('button');
      btn.textContent = t.label;
      btn.dataset.tab = t.id;
      btn.addEventListener('click', () => this.selectTab(t.id));
      tabBar.appendChild(btn);
    });

    this.selectTab(availableTabs[0].id);
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
      pmsampling: () => this.renderGenericSection(kernel, 'PM Sampling')
    };

    const renderer = renderers[tabId];
    if (renderer) {
      content.innerHTML = renderer();
      this.postRenderCharts(tabId, kernel);
    }
  },

  postRenderCharts(tabId, kernel) {
    if (tabId === 'sol') {
      const sec = Parser.findSection(kernel.sections, 'GPU Speed Of Light Throughput');
      if (sec) Charts.speedOfLight('chart-sol', sec);
    } else if (tabId === 'occupancy') {
      const sec = Parser.findSection(kernel.sections, 'Occupancy');
      if (sec) Charts.occupancy('chart-occupancy', sec);
    } else if (tabId === 'scheduler') {
      const sec = Parser.findSection(kernel.sections, 'Scheduler Statistics');
      if (sec) Charts.schedulerDonut('chart-scheduler', sec);
    } else if (tabId === 'memory') {
      const sec = Parser.findSection(kernel.sections, 'Memory Workload Analysis');
      if (sec) Charts.memoryBars('chart-memory', sec);
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

  // --- Overview ---
  renderOverview(kernel) {
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
        <div>
          ${this.metricsTable(sec)}
        </div>
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
          <h3>Memory Utilization (%)</h3>
          <canvas id="chart-memory"></canvas>
        </div>
        <div>
          ${this.metricsTable(sec)}
        </div>
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
  metricsTable(section) {
    if (!section.metrics || section.metrics.length === 0) return '';
    let html = `<table class="metric-table">
      <thead><tr><th>Metric</th><th class="unit-col">Unit</th><th class="value-col">Value</th></tr></thead>
      <tbody>`;

    section.metrics.forEach(m => {
      html += `<tr>
        <td>${this.escapeHtml(m.name)}</td>
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
    return `<div class="metric-card">
      <div class="metric-value ${colorClass}">${this.escapeHtml(String(value))}<span class="metric-unit">${this.escapeHtml(unit)}</span></div>
      <div class="metric-label">${this.escapeHtml(label)}</div>
    </div>`;
  },

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
