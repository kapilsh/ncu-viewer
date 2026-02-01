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

  // Memory hierarchy waterfall chart
  memoryHierarchy(canvasId, section) {
    const l1Hit = Parser.metricValue(section, 'L1/TEX Hit Rate');
    const l2Hit = Parser.metricValue(section, 'L2 Hit Rate');

    if (isNaN(l1Hit) && isNaN(l2Hit)) return null;

    // Calculate miss rates and flow
    const l1HitRate = isNaN(l1Hit) ? 0 : l1Hit;
    const l2HitRate = isNaN(l2Hit) ? 0 : l2Hit;
    const l1Miss = 100 - l1HitRate;
    const l2Miss = l1Miss * (100 - l2HitRate) / 100;
    const dramAccess = l2Miss;

    return this.create(canvasId, {
      type: 'bar',
      data: {
        labels: ['L1/TEX Cache', 'L2 Cache', 'DRAM'],
        datasets: [
          {
            label: 'Hit',
            data: [l1HitRate, l2HitRate * l1Miss / 100, 0],
            backgroundColor: '#4ade80',
            stack: 'stack'
          },
          {
            label: 'Miss (Next Level)',
            data: [l1Miss, l2Miss, dramAccess],
            backgroundColor: ['#fbbf24', '#fb923c', '#f87171'],
            stack: 'stack'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: '#e0e0e0', padding: 12, font: { size: 11 } }
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const label = ctx.dataset.label || '';
                const value = ctx.parsed.y.toFixed(2);
                return `${label}: ${value}%`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#e0e0e0', font: { size: 12 } }
          },
          y: {
            stacked: true,
            min: 0,
            max: 100,
            grid: { color: '#2a3a5e' },
            ticks: { color: '#a0a0b0', callback: v => v + '%' }
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

  // Roofline chart
  roofline(canvasId, section, kernel) {
    const computeThroughput = Parser.metricValue(section, 'Compute (SM) Throughput');
    const memoryThroughput = Parser.metricValue(section, 'Memory Throughput');

    if (isNaN(computeThroughput) || isNaN(memoryThroughput)) return null;

    // Create a simple roofline visualization showing compute vs memory utilization
    // The "roof" is at 100% for both axes
    return this.create(canvasId, {
      type: 'scatter',
      data: {
        datasets: [
          {
            label: 'Kernel Performance',
            data: [{ x: memoryThroughput, y: computeThroughput }],
            backgroundColor: '#818cf8',
            borderColor: '#818cf8',
            pointRadius: 8,
            pointHoverRadius: 10
          },
          {
            label: 'Compute Bound Ceiling',
            data: [{ x: 0, y: 100 }, { x: 100, y: 100 }],
            borderColor: '#4ade80',
            borderWidth: 2,
            borderDash: [5, 5],
            pointRadius: 0,
            showLine: true,
            fill: false
          },
          {
            label: 'Memory Bound Ceiling',
            data: [{ x: 100, y: 0 }, { x: 100, y: 100 }],
            borderColor: '#f87171',
            borderWidth: 2,
            borderDash: [5, 5],
            pointRadius: 0,
            showLine: true,
            fill: false
          },
          {
            label: 'Balanced Line',
            data: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
            borderColor: '#fbbf24',
            borderWidth: 1,
            borderDash: [2, 2],
            pointRadius: 0,
            showLine: true,
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: '#e0e0e0', padding: 12, font: { size: 11 } }
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                if (ctx.datasetIndex === 0) {
                  return `Compute: ${ctx.parsed.y.toFixed(1)}%, Memory: ${ctx.parsed.x.toFixed(1)}%`;
                }
                return ctx.dataset.label;
              }
            }
          }
        },
        scales: {
          x: {
            min: 0,
            max: 100,
            title: {
              display: true,
              text: 'Memory Throughput (% of Peak)',
              color: '#a0a0b0',
              font: { size: 12 }
            },
            grid: { color: '#2a3a5e' },
            ticks: { color: '#a0a0b0', callback: v => v + '%' }
          },
          y: {
            min: 0,
            max: 100,
            title: {
              display: true,
              text: 'Compute Throughput (% of Peak)',
              color: '#a0a0b0',
              font: { size: 12 }
            },
            grid: { color: '#2a3a5e' },
            ticks: { color: '#a0a0b0', callback: v => v + '%' }
          }
        }
      }
    });
  },

  // Destroy all charts
  destroyAll() {
    Object.keys(this.instances).forEach(id => this.destroy(id));
  }
};
