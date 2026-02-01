// Client-side data formatting helpers

const Parser = {
  // Parse a metric value string to a number (handles commas, percentages)
  toNumber(val) {
    if (val == null || val === '') return NaN;
    const cleaned = String(val).replace(/,/g, '').trim();
    const num = parseFloat(cleaned);
    return isNaN(num) ? NaN : num;
  },

  // Format a number for display
  formatNumber(val, decimals = 2) {
    const num = typeof val === 'number' ? val : this.toNumber(val);
    if (isNaN(num)) return val;
    if (Number.isInteger(num) && decimals === 2) return num.toLocaleString();
    return num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: decimals });
  },

  // Get color class based on percentage utilization
  utilizationColor(pct) {
    const num = typeof pct === 'number' ? pct : this.toNumber(pct);
    if (isNaN(num)) return '';
    if (num >= 60) return 'color-green';
    if (num >= 30) return 'color-yellow';
    return 'color-red';
  },

  // Get raw color hex based on percentage
  utilizationHex(pct) {
    const num = typeof pct === 'number' ? pct : this.toNumber(pct);
    if (isNaN(num)) return '#818cf8';
    if (num >= 60) return '#4ade80';
    if (num >= 30) return '#fbbf24';
    return '#f87171';
  },

  // Find a metric by name in a section's metrics array
  findMetric(section, name) {
    if (!section || !section.metrics) return null;
    return section.metrics.find(m => m.name === name) || null;
  },

  // Get metric value as number
  metricValue(section, name) {
    const m = this.findMetric(section, name);
    return m ? this.toNumber(m.value) : NaN;
  },

  // Get metric display string (value + unit)
  metricDisplay(section, name) {
    const m = this.findMetric(section, name);
    if (!m) return 'N/A';
    return m.value + (m.unit ? ' ' + m.unit : '');
  },

  // Find a section by name (partial match)
  findSection(sections, name) {
    return sections.find(s => s.name.toLowerCase().includes(name.toLowerCase())) || null;
  },

  // Classify kernel type from name
  classifyKernel(name) {
    const lower = name.toLowerCase();
    if (lower.includes('gemm') || lower.includes('matmul')) return 'GEMM';
    if (lower.includes('conv')) return 'Conv';
    if (lower.includes('reduce') || lower.includes('reduction')) return 'Reduce';
    if (lower.includes('elementwise') || lower.includes('pointwise')) return 'Elementwise';
    if (lower.includes('softmax')) return 'Softmax';
    if (lower.includes('norm') || lower.includes('batch_norm') || lower.includes('layer_norm')) return 'Norm';
    if (lower.includes('attention') || lower.includes('flash')) return 'Attention';
    if (lower.includes('distribution') || lower.includes('random') || lower.includes('normal')) return 'RNG';
    if (lower.includes('copy') || lower.includes('memcpy') || lower.includes('memset')) return 'Memory';
    return 'Compute';
  }
};
