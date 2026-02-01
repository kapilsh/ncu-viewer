// Metric descriptions and help text
export const MetricDescriptions = {
  // Speed of Light
  'Duration': 'Total time the kernel took to execute on the GPU',
  'Compute (SM) Throughput': 'Percentage of peak compute (SM) throughput achieved. Higher is better.',
  'Memory Throughput': 'Percentage of peak memory bandwidth achieved. Higher is better.',
  'L1/TEX Cache Throughput': 'Percentage of peak L1/Texture cache throughput',
  'L2 Cache Throughput': 'Percentage of peak L2 cache throughput',
  'SM Frequency': 'Streaming Multiprocessor clock frequency during kernel execution',

  // Occupancy
  'Theoretical Occupancy': 'Maximum possible occupancy based on block configuration and resource usage',
  'Achieved Occupancy': 'Actual average occupancy achieved during execution',
  'Block Limit SM': 'Maximum blocks per SM based on hardware limits',
  'Block Limit Registers': 'Block limit constrained by register usage',
  'Block Limit Shared Mem': 'Block limit constrained by shared memory usage',
  'Block Limit Warps': 'Block limit constrained by warp count',

  // Compute
  'SM Busy': 'Percentage of time at least one warp was active on an SM',
  'Issue Slots Busy': 'Percentage of issue slots that issued an instruction',
  'Executed Ipc Active': 'Instructions executed per cycle while SM was active',
  'Executed Ipc Elapsed': 'Instructions executed per cycle over total kernel duration',
  'Issued Ipc Active': 'Instructions issued per cycle while SM was active',

  // Memory
  'L1/TEX Hit Rate': 'Percentage of L1/TEX cache requests that hit',
  'L2 Hit Rate': 'Percentage of L2 cache requests that hit',
  'Max Bandwidth': 'Maximum memory bandwidth utilization achieved',
  'Mem Busy': 'Percentage of time memory subsystem was busy',
  'Mem Pipes Busy': 'Percentage of time memory pipelines were busy',

  // Scheduler
  'One or More Eligible': 'Percentage of cycles where at least one warp was eligible to issue',
  'No Eligible': 'Percentage of cycles where no warps were eligible to issue',
  'Issued Warp Per Scheduler': 'Average warps issued per scheduler',
  'Active Warps Per Scheduler': 'Average active warps per scheduler',

  // Launch Stats
  'Grid Size': 'Number of thread blocks in the grid',
  'Block Size': 'Number of threads per block',
  'Registers Per Thread': 'Number of registers allocated per thread',
  'Shared Memory': 'Amount of shared memory used per block',
  'Static Shared Memory': 'Statically allocated shared memory per block',
  'Dynamic Shared Memory': 'Dynamically allocated shared memory per block'
};

export function getMetricDescription(metricName) {
  // Try exact match first
  if (MetricDescriptions[metricName]) {
    return MetricDescriptions[metricName];
  }

  // Try partial match
  for (const [key, desc] of Object.entries(MetricDescriptions)) {
    if (metricName.includes(key) || key.includes(metricName)) {
      return desc;
    }
  }

  return null;
}
