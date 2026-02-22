#!/usr/bin/env node

const { Command } = require('commander');
const dayjs = require('dayjs');
const { readFileSync } = require('fs');
const { resolve } = require('path');

const ROOT = resolve(__dirname, '..', '..');

// ─── Module Loader ─────────────────────────────────────────────────

const MODULES = {
  aggregator: () => require('../aggregator'),
  'ct-scanner': () => require('../ct_scanner'),
  news: () => require('../news_scanner'),
  onchain: () => require('../onchain'),
};

const MODULE_KEYS_FOR_DATA = ['aggregator', 'ct-scanner', 'news', 'onchain'];
const DATA_KEY_MAP = {
  aggregator: 'aggregator',
  'ct-scanner': 'ct_scanner',
  news: 'news_scanner',
  onchain: 'onchain',
};

function loadConfig(configPath) {
  try {
    const p = configPath || resolve(ROOT, 'config', 'config.json');
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return {};
  }
}

function elapsed(start) {
  return ((performance.now() - start) / 1000).toFixed(1);
}

function log(icon, msg) {
  console.log(`${icon}  ${msg}`);
}

// ─── Run a single module ───────────────────────────────────────────

async function runModule(name, config, options = {}) {
  log('⏳', `Running ${name}...`);
  const start = performance.now();

  try {
    const mod = MODULES[name]();
    // Each module exports a run function named run<Module>
    const runner = mod.runAggregator || mod.runCTScanner || mod.runNewsScanner || mod.runOnchainDetector || mod.run;

    if (!runner) {
      log('⚠️', `${name}: no runner export found — skipping`);
      return null;
    }

    const result = await runner(config, options);
    log('✅', `${name} completed in ${elapsed(start)}s`);
    return result;
  } catch (err) {
    log('❌', `${name} failed: ${err.message}`);
    if (options.verbose) console.error(err.stack);
    return null;
  }
}

// ─── CLI ───────────────────────────────────────────────────────────

const program = new Command();

program
  .name('cryptointel')
  .description('CryptoIntel — automated crypto research pipeline')
  .version('0.1.0');

program
  .option('--full', 'Run all modules then synthesis')
  .option('--module <name>', 'Run individual module (aggregator, ct-scanner, news, onchain, synthesis)')
  .option('--output <dir>', 'Override output directory')
  .option('--config <path>', 'Override config file path')
  .option('--json', 'Output raw JSON instead of markdown')
  .option('--verbose', 'Show detailed error traces')
  .action(async (opts) => {
    const totalStart = performance.now();
    const config = loadConfig(opts.config);

    console.log('');
    log('🔬', `CryptoIntel v0.1.0 — ${dayjs().format('YYYY-MM-DD HH:mm:ss')}`);
    console.log('─'.repeat(50));

    const synthOpts = {
      configPath: opts.config,
      outputDir: opts.output || config.synthesis?.output_dir,
      verbose: opts.verbose,
    };

    // Single module mode
    if (opts.module) {
      const name = opts.module;
      if (name === 'synthesis') {
        log('⚠️', 'Running synthesis without data — will produce empty briefing');
        const { runSynthesis } = require('../synthesis');
        const result = await runSynthesis({}, synthOpts);
        if (opts.json) console.log(JSON.stringify(result, null, 2));
        else console.log(result.markdown);
      } else if (MODULES[name]) {
        const result = await runModule(name, config, synthOpts);
        console.log(JSON.stringify(result, null, 2));
      } else {
        log('❌', `Unknown module: ${name}. Available: ${[...Object.keys(MODULES), 'synthesis'].join(', ')}`);
        process.exit(1);
      }

      console.log('─'.repeat(50));
      log('⏱️', `Finished in ${elapsed(totalStart)}s`);
      return;
    }

    // Full run (default if no options)
    if (opts.full || (!opts.module)) {
      log('🚀', 'Full pipeline run');
      console.log('');

      const data = {};
      let succeeded = 0;
      let failed = 0;

      // Run data modules in parallel
      const results = await Promise.allSettled(
        MODULE_KEYS_FOR_DATA.map(async (name) => {
          const result = await runModule(name, config, synthOpts);
          return { name, result };
        })
      );

      for (const r of results) {
        if (r.status === 'fulfilled' && r.value.result) {
          data[DATA_KEY_MAP[r.value.name]] = r.value.result;
          succeeded++;
        } else {
          const name = r.status === 'fulfilled' ? r.value.name : 'unknown';
          data[DATA_KEY_MAP[name]] = null;
          failed++;
        }
      }

      console.log('');
      log('📊', `Data collection: ${succeeded} succeeded, ${failed} failed`);

      // Run synthesis
      log('⏳', 'Running synthesis...');
      const synthStart = performance.now();

      try {
        const { runSynthesis } = require('../synthesis');
        const result = await runSynthesis(data, synthOpts);

        log('✅', `Synthesis completed in ${elapsed(synthStart)}s`);
        log('📁', `Output: ${result.paths.md}`);
        log('📁', `JSON:   ${result.paths.json}`);

        if (opts.json) {
          console.log(JSON.stringify({ data, synthesis: result }, null, 2));
        } else {
          console.log('');
          console.log(result.markdown);
        }
      } catch (err) {
        log('❌', `Synthesis failed: ${err.message}`);
        if (opts.verbose) console.error(err.stack);
      }

      console.log('─'.repeat(50));
      log('⏱️', `Total run time: ${elapsed(totalStart)}s`);
    }
  });

program.parse();
