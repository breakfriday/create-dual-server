const { resolve } = require('node:path');

// mwtsc forks its worker from its own directory and inherits Node flags.
// Keep the native env-file argument valid in every child working directory.
const envPath = resolve(__dirname, '..', 'dev.env');
process.execArgv = process.execArgv.map(arg =>
  arg.startsWith('--env-file-if-exists=') ? `--env-file-if-exists=${envPath}` : arg
);
require('mwtsc/bin/mwtsc.js');
