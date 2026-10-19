const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');

console.log('🧪 Running unit tests...');
const unitTest = spawnSync(process.execPath, ['--test', path.join(__dirname, 'test_parser.js')], {
  stdio: 'inherit'
});
if (unitTest.status !== 0) {
  process.exit(unitTest.status || 1);
}

console.log('\n🧪 Running integration tests...');
const indexJs = path.join(__dirname, '..', 'index.js');
const fixtures = path.join(__dirname, 'fixtures');

let total = 0;
let passed = 0;

function runIntegrationTest(name, args, checks, customEnv = {}, disallowed = []) {
  total++;
  // Clean runner environment so tests don't leak outer GitHub Actions variables
  const cleanEnv = { ...process.env };
  delete cleanEnv.GITHUB_STEP_SUMMARY;
  for (const k of Object.keys(cleanEnv)) {
    if (k.startsWith('INPUT_')) {
      delete cleanEnv[k];
    }
  }

  const proc = spawnSync(process.execPath, [indexJs, ...args], {
    encoding: 'utf8',
    env: { ...cleanEnv, ...customEnv }
  });
  const output = (proc.stdout || '') + (proc.stderr || '');

  try {
    for (const check of checks) {
      if (typeof check === 'string') {
        assert(output.includes(check), `Expected output to contain: "${check}"`);
      } else if (check instanceof RegExp) {
        assert(check.test(output), `Expected output to match: ${check}`);
      }
    }
    for (const forbidden of disallowed) {
      if (typeof forbidden === 'string') {
        assert(!output.includes(forbidden), `Expected output NOT to contain: "${forbidden}"`);
      } else if (forbidden instanceof RegExp) {
        assert(!forbidden.test(output), `Expected output NOT to match: ${forbidden}`);
      }
    }
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name} - ${err.message}`);
    console.error(`  Output was:\n${output}`);
  }
}

runIntegrationTest(
  'Full plan JSON with title',
  [path.join(fixtures, 'sample_plan.json'), 'Staging Plan'],
  [
    '## Staging Plan',
    '### 📊 Plan Summary',
    '| ➕ Add | 🔄 Change | 🗑️ Destroy | ⚠️ Replace | 📥 Import |',
    '| 3 | 1 | 2 | 1 | 1 |',
    '### 📦 Resource Changes',
    '| 🔄 `update` | `aws_instance.web` | — |',
    '| ➕ `create` | `aws_s3_bucket.data_bucket` | — |',
    '| 🗑️ `destroy` | `aws_security_group_rule.legacy` | — |',
    '| ⚠️ `replace` | `aws_eip.ip` | requires new resource |',
    '| 📥 `import` | `aws_iam_role.imported_role` | id: `existing-role` |',
    '| 📦 `move` | `aws_subnet.app_subnet` | from `aws_subnet.old_app_subnet` |',
    '### 📤 Output Changes',
    '| ➕ `create` | `new_url` |'
  ],
  {},
  ['<details>', 'View Full Terraform Plan']
);

runIntegrationTest(
  'No changes JSON',
  [path.join(fixtures, 'sample_no_changes.json')],
  [
    '> [!NOTE]',
    '**No changes.** Your infrastructure matches the configuration.'
  ],
  {},
  ['<details>', 'View Full Terraform Plan']
);

runIntegrationTest(
  'Empty JSON file warning',
  [path.join(fixtures, 'sample_empty.txt'), 'Empty Test'],
  [
    '> [!WARNING]',
    'Terraform plan JSON file is empty.'
  ]
);

runIntegrationTest(
  'Missing plan file error',
  ['non_existent.json'],
  [
    'Plan file not found'
  ]
);

// Test resolution of GitHub runner input env vars (e.g. INPUT_PLAN-FILE)
runIntegrationTest(
  'Resolves input via INPUT_PLAN-FILE runner env var',
  [],
  ['### 📊 Plan Summary'],
  { 'INPUT_PLAN-FILE': path.join(fixtures, 'sample_plan.json'), 'INPUT_TITLE': 'Runner Env Test' },
  ['<details>']
);

// Test writing to GITHUB_STEP_SUMMARY when variable is set
const tmpSummaryFile = path.join(os.tmpdir(), `test-summary-${Date.now()}-${Math.floor(Math.random() * 1000)}.md`);
runIntegrationTest(
  'Writes to GITHUB_STEP_SUMMARY file when variable is present',
  [path.join(fixtures, 'sample_plan.json'), 'File Summary Test'],
  ['## File Summary Test'],
  { GITHUB_STEP_SUMMARY: tmpSummaryFile }
);
total++;
if (fs.existsSync(tmpSummaryFile) && fs.readFileSync(tmpSummaryFile, 'utf8').includes('## File Summary Test')) {
  console.log('  ✅ PASS: GITHUB_STEP_SUMMARY file contains expected markdown');
  passed++;
  fs.unlinkSync(tmpSummaryFile);
} else {
  console.error('  ❌ FAIL: GITHUB_STEP_SUMMARY file was not created or empty');
}

console.log('\n--------------------------------------------------');
console.log(`Integration Test Results: ${passed} / ${total} passed`);
console.log('--------------------------------------------------');

if (passed !== total) {
  process.exit(1);
}
