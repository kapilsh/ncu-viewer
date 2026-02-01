const express = require('express');
const multer = require('multer');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = 3000;

app.use(express.static('public'));

const upload = multer({
  dest: 'uploads/',
  fileFilter: (req, file, cb) => {
    if (file.originalname.endsWith('.ncu-rep')) {
      cb(null, true);
    } else {
      cb(new Error('Only .ncu-rep files are allowed'));
    }
  },
  limits: { fileSize: 500 * 1024 * 1024 }
});

// In-memory cache of parsed reports
const reportCache = {};

function parseNcuOutput(text) {
  const kernels = [];
  const lines = text.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Kernel boundary: line with grid x block pattern and Context/Stream/Device/CC
    const kernelMatch = line.match(/^\s+(.+?)\s+\((\d+(?:,\s*\d+)*)\)x\((\d+(?:,\s*\d+)*)\),\s*Context\s+(\d+),\s*Stream\s+(\d+),\s*Device\s+(\d+),\s*CC\s+([\d.]+)\s*$/);
    if (kernelMatch) {
      const kernel = {
        name: kernelMatch[1].trim(),
        grid: kernelMatch[2],
        block: kernelMatch[3],
        context: parseInt(kernelMatch[4]),
        stream: parseInt(kernelMatch[5]),
        device: parseInt(kernelMatch[6]),
        cc: kernelMatch[7],
        sections: []
      };

      i++;
      // Parse sections for this kernel
      while (i < lines.length) {
        const nextLine = lines[i];
        // Check if we hit the next kernel
        if (nextLine.match(/^\s+.+\s+\(\d+(?:,\s*\d+)*\)x\(\d+(?:,\s*\d+)*\),\s*Context\s+\d+,\s*Stream/)) {
          break;
        }

        // Section header
        const sectionMatch = nextLine.match(/^\s+Section:\s+(.+)$/);
        if (sectionMatch) {
          const section = {
            name: sectionMatch[1].trim(),
            metrics: [],
            hints: []
          };

          i++;
          let inMetricTable = false;
          let dashCount = 0;

          while (i < lines.length) {
            const sLine = lines[i];

            // Next kernel?
            if (sLine.match(/^\s+.+\s+\(\d+(?:,\s*\d+)*\)x\(\d+(?:,\s*\d+)*\),\s*Context\s+\d+,\s*Stream/)) {
              break;
            }
            // Next section?
            if (sLine.match(/^\s+Section:\s+/)) {
              break;
            }

            // Dash separator line
            if (sLine.match(/^\s+[-]+\s+[-]+/)) {
              dashCount++;
              if (dashCount === 1) {
                inMetricTable = true;
              }
              // Header row separator (2nd dash line) or end separator (3rd)
              if (dashCount >= 3) {
                inMetricTable = false;
                dashCount = 0;
              }
              i++;
              continue;
            }

            // Skip the "Metric Name / Metric Unit / Metric Value" header row
            if (inMetricTable && sLine.match(/Metric Name\s+Metric Unit\s+Metric Value/i)) {
              i++;
              continue;
            }

            // Metric data row - parse from right to left
            if (inMetricTable && sLine.trim().length > 0) {
              const trimmed = sLine.trim();
              // Split into columns: everything is space-separated but metric name can have spaces
              // Strategy: split from the right - value is last token, unit is second-to-last, name is the rest
              const parts = trimmed.split(/\s{2,}/);
              if (parts.length >= 3) {
                const value = parts[parts.length - 1];
                const unit = parts[parts.length - 2];
                const name = parts.slice(0, parts.length - 2).join(' ');
                section.metrics.push({ name: name.trim(), unit: unit.trim(), value: value.trim() });
              } else if (parts.length === 2) {
                // Some metrics have no unit
                section.metrics.push({ name: parts[0].trim(), unit: '', value: parts[1].trim() });
              }
              i++;
              continue;
            }

            // OPT/INF hints
            const hintMatch = sLine.match(/^\s+(OPT|INF)\s+(.*)$/);
            if (hintMatch) {
              let hintType = hintMatch[1];
              let hintText = hintMatch[2].trim();

              i++;
              // Continuation lines (indented, not a section/kernel/dash/hint start)
              while (i < lines.length) {
                const contLine = lines[i];
                if (contLine.match(/^\s+Section:\s+/) ||
                    contLine.match(/^\s+.+\s+\(\d+(?:,\s*\d+)*\)x\(\d+(?:,\s*\d+)*\),\s*Context/) ||
                    contLine.match(/^\s+(OPT|INF)\s+/) ||
                    contLine.match(/^\s+[-]+\s+[-]+/) ||
                    contLine.trim() === '') {
                  break;
                }
                hintText += ' ' + contLine.trim();
                i++;
              }

              section.hints.push({ type: hintType, text: hintText });
              continue;
            }

            i++;
          }

          kernel.sections.push(section);
          continue;
        }

        i++;
      }

      kernels.push(kernel);
      continue;
    }

    i++;
  }

  return kernels;
}

// POST /api/upload
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const fileId = crypto.randomBytes(8).toString('hex');
  const filePath = req.file.path;

  try {
    const output = execSync(
      `ncu --import "${filePath}" --page details --print-kernel-base demangled`,
      { maxBuffer: 100 * 1024 * 1024, encoding: 'utf-8', timeout: 120000 }
    );

    const kernels = parseNcuOutput(output);
    reportCache[fileId] = { kernels, filePath, timestamp: Date.now() };

    res.json({ fileId, kernelCount: kernels.length });
  } catch (err) {
    console.error('ncu parse error:', err.message);
    res.status(500).json({ error: 'Failed to parse ncu-rep file: ' + err.message });
  }
});

// GET /api/kernels/:fileId
app.get('/api/kernels/:fileId', (req, res) => {
  const report = reportCache[req.params.fileId];
  if (!report) {
    return res.status(404).json({ error: 'Report not found' });
  }

  const summary = report.kernels.map((k, idx) => {
    // Extract duration from Speed Of Light section
    let duration = '';
    let computeThroughput = '';
    let memoryThroughput = '';
    const solSection = k.sections.find(s => s.name === 'GPU Speed Of Light Throughput');
    if (solSection) {
      const durMetric = solSection.metrics.find(m => m.name === 'Duration');
      if (durMetric) duration = durMetric.value + ' ' + durMetric.unit;
      const compMetric = solSection.metrics.find(m => m.name === 'Compute (SM) Throughput');
      if (compMetric) computeThroughput = compMetric.value;
      const memMetric = solSection.metrics.find(m => m.name === 'Memory Throughput');
      if (memMetric) memoryThroughput = memMetric.value;
    }

    // Shorten name for display
    let shortName = k.name;
    // Extract the outermost template function name
    const fnMatch = shortName.match(/(?:void\s+)?(?:[\w:]+::)*(\w+)<.*$/);
    if (fnMatch) shortName = fnMatch[1];
    if (shortName.length > 60) shortName = shortName.substring(0, 57) + '...';

    return {
      index: idx,
      name: k.name,
      shortName,
      grid: k.grid,
      block: k.block,
      cc: k.cc,
      duration,
      computeThroughput,
      memoryThroughput
    };
  });

  res.json(summary);
});

// GET /api/kernel/:fileId/:kernelIndex
app.get('/api/kernel/:fileId/:kernelIndex', (req, res) => {
  const report = reportCache[req.params.fileId];
  if (!report) {
    return res.status(404).json({ error: 'Report not found' });
  }

  const idx = parseInt(req.params.kernelIndex);
  if (idx < 0 || idx >= report.kernels.length) {
    return res.status(404).json({ error: 'Kernel index out of range' });
  }

  res.json(report.kernels[idx]);
});

// Cleanup old reports every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [fileId, report] of Object.entries(reportCache)) {
    if (now - report.timestamp > 30 * 60 * 1000) {
      try { fs.unlinkSync(report.filePath); } catch (e) {}
      delete reportCache[fileId];
    }
  }
}, 30 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`NCU Viewer running at http://localhost:${PORT}`);
});
