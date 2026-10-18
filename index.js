#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { parsePlan } = require('./lib/parser');
const { formatSummary } = require('./lib/formatter');

function getInput(name) {
  // GitHub Actions runner sets env var as INPUT_<NAME_IN_UPPERCASE> preserving hyphens
  // e.g. "plan-file" -> process.env["INPUT_PLAN-FILE"]
  const keyWithHyphen = `INPUT_${name.replace(/ /g, '_').toUpperCase()}`;
  const keyWithUnderscore = `INPUT_${name.replace(/ /g, '_').replace(/-/g, '_').toUpperCase()}`;

  const val = process.env[keyWithHyphen] ?? process.env[keyWithUnderscore];
  if (val !== undefined && val !== '') {
    return val.trim();
  }
  return '';
}

function run() {
  try {
    const args = process.argv.slice(2);
    const planFile =
      getInput('plan-file') ||
      args[0] ||
      '';

    const title =
      getInput('title') ||
      args[1] ||
      '';

    if (!planFile) {
      console.error('::error::Missing required input: plan-file (path to Terraform plan JSON representation)');
      process.exit(1);
    }

    const resolvedPlanPath = path.resolve(process.cwd(), planFile);
    if (!fs.existsSync(resolvedPlanPath)) {
      console.error(`::error::Plan file not found: ${resolvedPlanPath}`);
      process.exit(1);
    }

    const rawJson = fs.readFileSync(resolvedPlanPath, 'utf8');
    if (!rawJson.trim()) {
      const emptyWarning = `${title ? `## ${title}\n\n` : ''}> [!WARNING]\n> Terraform plan JSON file is empty.`;
      writeOutput(emptyWarning);
      return;
    }

    const parsedPlan = parsePlan(rawJson);
    const markdown = formatSummary(parsedPlan, {
      title,
      rawJsonPlan: rawJson
    });

    writeOutput(markdown);
  } catch (err) {
    console.error(`::error::${err.message}`);
    process.exit(1);
  }
}

function writeOutput(markdown) {
  // Always output to stdout so logs show the summary
  process.stdout.write(`${markdown}\n`);

  // Write to GitHub Step Summary file if in GitHub Actions environment
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (summaryFile) {
    try {
      fs.appendFileSync(summaryFile, `${markdown}\n`, 'utf8');
    } catch (err) {
      console.error(`::warning::Failed to write to GITHUB_STEP_SUMMARY: ${err.message}`);
    }
  }
}

if (require.main === module) {
  run();
}

module.exports = { run, getInput };
