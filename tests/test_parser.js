const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { parsePlan } = require('../lib/parser');
const { formatSummary } = require('../lib/formatter');

describe('Terraform Plan JSON Parser', () => {
  const sampleJson = fs.readFileSync(path.join(__dirname, 'fixtures', 'sample_plan.json'), 'utf8');
  const noChangesJson = fs.readFileSync(path.join(__dirname, 'fixtures', 'sample_no_changes.json'), 'utf8');

  test('parses counts correctly from sample plan', () => {
    const result = parsePlan(sampleJson);
    assert.equal(result.hasChanges, true);
    assert.equal(result.counts.add, 3);
    assert.equal(result.counts.change, 1);
    assert.equal(result.counts.destroy, 2);
    assert.equal(result.counts.replace, 1);
    assert.equal(result.counts.import, 1);
    assert.equal(result.counts.read, 1);
  });

  test('extracts resource changes with appropriate action types and badges', () => {
    const result = parsePlan(sampleJson);
    const resources = result.resourceChanges;

    const web = resources.find(r => r.address === 'aws_instance.web');
    assert.ok(web);
    assert.equal(web.actionType, 'update');
    assert.match(web.badge, /update/);

    const bucket = resources.find(r => r.address === 'aws_s3_bucket.data_bucket');
    assert.ok(bucket);
    assert.equal(bucket.actionType, 'create');
    assert.match(bucket.badge, /create/);

    const sg = resources.find(r => r.address === 'aws_security_group_rule.legacy');
    assert.ok(sg);
    assert.equal(sg.actionType, 'delete');
    assert.match(sg.badge, /destroy/);

    const eip = resources.find(r => r.address === 'aws_eip.ip');
    assert.ok(eip);
    assert.equal(eip.actionType, 'replace');
    assert.match(eip.badge, /replace/);
    assert.equal(eip.details, 'requires new resource');

    const role = resources.find(r => r.address === 'aws_iam_role.imported_role');
    assert.ok(role);
    assert.equal(role.actionType, 'import');
    assert.match(role.badge, /import/);
    assert.equal(role.details, 'id: `existing-role`');

    const subnet = resources.find(r => r.address === 'aws_subnet.app_subnet');
    assert.ok(subnet);
    assert.equal(subnet.actionType, 'move');
    assert.match(subnet.badge, /move/);
    assert.equal(subnet.details, 'from `aws_subnet.old_app_subnet`');
  });

  test('extracts output changes', () => {
    const result = parsePlan(sampleJson);
    assert.equal(result.outputChanges.length, 1);
    assert.equal(result.outputChanges[0].name, 'new_url');
    assert.equal(result.outputChanges[0].actionType, 'create');
  });

  test('handles no changes plan correctly', () => {
    const result = parsePlan(noChangesJson);
    assert.equal(result.hasChanges, false);
    assert.equal(result.resourceChanges.length, 0);
  });

  test('throws descriptive error on invalid JSON', () => {
    assert.throws(() => parsePlan('{ invalid json }'), /Failed to parse Terraform plan JSON/);
  });
});

describe('Markdown Formatter', () => {
  const sampleJson = fs.readFileSync(path.join(__dirname, 'fixtures', 'sample_plan.json'), 'utf8');
  const noChangesJson = fs.readFileSync(path.join(__dirname, 'fixtures', 'sample_no_changes.json'), 'utf8');

  test('renders title, summary, and tables without attaching the full plan', () => {
    const parsed = parsePlan(sampleJson);
    const md = formatSummary(parsed, {
      title: 'Production Deployment'
    });

    assert.match(md, /## Production Deployment/);
    assert.match(md, /### 📊 Plan Summary/);
    assert.match(md, /\|\s*➕ Add\s*\|\s*🔄 Change\s*\|\s*🗑️ Destroy\s*\|\s*⚠️ Replace\s*\|\s*📥 Import\s*\|/);
    assert.match(md, /\|\s*3\s*\|\s*1\s*\|\s*2\s*\|\s*1\s*\|\s*1\s*\|/);
    assert.match(md, /### 📦 Resource Changes/);
    assert.match(md, /`aws_instance\.web`/);
    assert.match(md, /`aws_eip\.ip`/);
    assert.match(md, /requires new resource/);
    assert.match(md, /### 📤 Output Changes/);
    assert.match(md, /`new_url`/);
    // Full plan is not attached
    assert.doesNotMatch(md, /<details>/);
    assert.doesNotMatch(md, /```json/);
  });

  test('renders note alert for no changes plan without attaching full plan', () => {
    const parsed = parsePlan(noChangesJson);
    const md = formatSummary(parsed, {
      title: 'No Changes Test'
    });

    assert.match(md, /> \[!NOTE\]/);
    assert.match(md, /No changes\./);
    assert.doesNotMatch(md, /<details>/);
    assert.doesNotMatch(md, /```json/);
  });
});
