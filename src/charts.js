import { Chart, registerables } from 'chart.js';
import { Parser } from './parser.js';

Chart.register(...registerables);

// Chart.js visualization builders with dark theme

export const Charts = {
  // Store chart instances for cleanup
  instances: {},

  // Common dark theme defaults
  defaults: {
    color: '#a0a0b0',
    borderColor: '#2a3a5e',
    font: { family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', size: 12 }
  },

  // Destroy existing chart on a canvas
  destroy(canvasId) {
    if (this.instances[canvasId]) {
      this.instances[canvasId].destroy();
      delete this.instances[canvasId];
    }
  },

  // Create and register a chart
  create(canvasId, config) {
    this.destroy(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;
    const chart = new Chart(ctx, config);
    this.instances[canvasId] = chart;
    return chart;
  },

  // Speed of Light horizontal bar chart
  speedOfLight(canvasId, section) {
    const metrics = [
      { name: 'Compute (SM) Throughput', label: 'Compute (SM)' },
      { name: 'Memory Throughput', label: 'Memory' },
      { name: 'L1/TEX Cache Throughput', label: 'L1/TEX Cache' },
      { name: 'L2 Cache Throughput', label: 'L2 Cache' }
    ];

    const labels = [];
    const values = [];
    const colors = [];

    metrics.forEach(m => {
      const val = Parser.metricValue(section, m.name);
      if (!isNaN(val)) {
        labels.push(m.label);
        values.push(val);
        colors.push(Parser.utilizationHex(val));
      }
    });

    return this.create(canvasId, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: colors,
          borderColor: colors,
          borderWidth: 1,
          borderRadius: 4,
          barThickness: 28
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: { label: ctx => ctx.parsed.x.toFixed(2) + '%' }
          }
        },
        scales: {
          x: {
            min: 0, max: 100,
            grid: { color: '#2a3a5e' },
            ticks: { color: '#a0a0b0', callback: v => v + '%' }
          },
          y: {
            grid: { display: false },
            ticks: { color: '#e0e0e0', font: { size: 13 } }
          }
        }
      }
    });
  },

  // Occupancy grouped bar chart
  occupancy(canvasId, section) {
    const limitMetrics = [
      'Block Limit SM',
      'Block Limit Registers',
      'Block Limit Shared Mem',
      'Block Limit Warps',
      'Block Limit Barriers'
    ];

    const labels = [];
    const values = [];

    limitMetrics.forEach(name => {
      const val = Parser.metricValue(section, name);
      if (!isNaN(val)) {
        labels.push(name.replace('Block Limit ', ''));
        values.push(val);
      }
    });

    const theoretical = Parser.metricValue(section, 'Theoretical Occupancy');
    const achieved = Parser.metricValue(section, 'Achieved Occupancy');

    return this.create(canvasId, {
      type: 'bar',
      data: {
        labels: [...labels, 'Theoretical Occ.', 'Achieved Occ.'],
        datasets: [{
          label: 'Value',
          data: [...values, theoretical, achieved],
          backgroundColor: [
            ...values.map(() => '#818cf8'),
            '#4ade80',
            '#60a5fa'
          ],
          borderRadius: 4,
          barThickness: 28
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => {
                const idx = ctx.dataIndex;
                if (idx >= values.length) return ctx.parsed.y.toFixed(2) + '%';
                return ctx.parsed.y + ' blocks';
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#e0e0e0', font: { size: 11 } }
          },
          y: {
            grid: { color: '#2a3a5e' },
            ticks: { color: '#a0a0b0' }
          }
        }
      }
    });
  },

  // Scheduler donut chart
  schedulerDonut(canvasId, section) {
    const eligible = Parser.metricValue(section, 'One or More Eligible');
    const noEligible = Parser.metricValue(section, 'No Eligible');

    if (isNaN(eligible) || isNaN(noEligible)) return null;

    return this.create(canvasId, {
      type: 'doughnut',
      data: {
        labels: ['Eligible', 'No Eligible'],
        datasets: [{
          data: [eligible, noEligible],
          backgroundColor: ['#4ade80', '#f87171'],
          borderColor: ['#4ade80', '#f87171'],
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '60%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: '#e0e0e0', padding: 16, font: { size: 13 } }
          },
          tooltip: {
            callbacks: { label: ctx => ctx.label + ': ' + ctx.parsed.toFixed(2) + '%' }
          }
        }
      }
    });
  },

  // Memory workload bars
  memoryBars(canvasId, section) {
    const metrics = [
      { name: 'L1/TEX Hit Rate', label: 'L1 Hit Rate' },
      { name: 'L2 Hit Rate', label: 'L2 Hit Rate' },
      { name: 'Max Bandwidth', label: 'Max Bandwidth' },
      { name: 'Mem Busy', label: 'Mem Busy' },
      { name: 'Mem Pipes Busy', label: 'Mem Pipes Busy' }
    ];

    const labels = [];
    const values = [];
    const colors = [];

    metrics.forEach(m => {
      const val = Parser.metricValue(section, m.name);
      if (!isNaN(val)) {
        labels.push(m.label);
        values.push(val);
        colors.push(Parser.utilizationHex(val));
      }
    });

    return this.create(canvasId, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: colors,
          borderRadius: 4,
          barThickness: 28
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: { label: ctx => ctx.parsed.x.toFixed(2) + '%' }
          }
        },
        scales: {
          x: {
            min: 0, max: 100,
            grid: { color: '#2a3a5e' },
            ticks: { color: '#a0a0b0', callback: v => v + '%' }
          },
          y: {
            grid: { display: false },
            ticks: { color: '#e0e0e0', font: { size: 13 } }
          }
        }
      }
    });
  },

  // Generic horizontal bar chart
  horizontalBar(canvasId, labels, values, { max = null, unit = '', colorFn = null } = {}) {
    const colors = colorFn ? values.map(colorFn) : values.map(() => '#818cf8');

    const opts = {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: ctx => Parser.formatNumber(ctx.parsed.x) + (unit ? ' ' + unit : '') }
        }
      },
      scales: {
        x: {
          grid: { color: '#2a3a5e' },
          ticks: { color: '#a0a0b0' }
        },
        y: {
          grid: { display: false },
          ticks: { color: '#e0e0e0', font: { size: 13 } }
        }
      }
    };

    if (max !== null) {
      opts.scales.x.min = 0;
      opts.scales.x.max = max;
    }

    return this.create(canvasId, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: colors,
          borderRadius: 4,
          barThickness: 28
        }]
      },
      options: opts
    });
  },

  // Destroy all charts
  destroyAll() {
    Object.keys(this.instances).forEach(id => this.destroy(id));
  }
};
