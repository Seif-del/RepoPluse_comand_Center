'use strict';

// config/index.js
// Single entry point for all application configuration.
// All application code reads config from here — never call process.env directly
// inside execution/ or backend/ files.

const defaultConfig = require('./default');

const env = process.env.NODE_ENV || 'development';

let envOverrides = {};
try {
  // eslint-disable-next-line import/no-dynamic-require
  envOverrides = require(`./${env}`);
} catch (_) {
  // No environment-specific config file found — defaults only.
}

module.exports = Object.freeze({
  ...defaultConfig,
  ...envOverrides,
});
