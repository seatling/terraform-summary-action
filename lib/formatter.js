/**
 * Formatter for GitHub Step Summary.
 */

function formatSummary(parsedPlan, options = {}) {
  const { title = '' } = options;
  const sections = [];

  // Title
  if (title) {
    sections.push(`## ${title}`);
  }

  // No changes scenario
  if (!parsedPlan.hasChanges) {
    sections.push('> [!NOTE]\n> **No changes.** Your infrastructure matches the configuration.');
    return sections.join('\n\n');
  }

  // Summary counts table
  const { counts } = parsedPlan;
  const summaryHeaders = ['➕ Add', '🔄 Change', '🗑️ Destroy'];
  const summaryValues = [String(counts.add), String(counts.change), String(counts.destroy)];

  if (counts.replace > 0) {
    summaryHeaders.push('⚠️ Replace');
    summaryValues.push(String(counts.replace));
  }
  if (counts.import > 0) {
    summaryHeaders.push('📥 Import');
    summaryValues.push(String(counts.import));
  }

  const headerLine = `| ${summaryHeaders.join(' | ')} |`;
  const alignLine = `| ${summaryHeaders.map(() => ':---:').join(' | ')} |`;
  const valueLine = `| ${summaryValues.join(' | ')} |`;

  sections.push(`### 📊 Plan Summary\n\n${headerLine}\n${alignLine}\n${valueLine}`);

  // Resource Changes Table
  if (parsedPlan.resourceChanges.length > 0) {
    const hasAnyDetails = parsedPlan.resourceChanges.some(r => Boolean(r.details));
    let table = '';

    if (hasAnyDetails) {
      table += '| Action | Resource | Details |\n| :--- | :--- | :--- |\n';
      for (const res of parsedPlan.resourceChanges) {
        const escapedAddress = res.address.replace(/\|/g, '\\|');
        const detailText = res.details ? res.details.replace(/\|/g, '\\|') : '—';
        table += `| ${res.badge} | \`${escapedAddress}\` | ${detailText} |\n`;
      }
    } else {
      table += '| Action | Resource |\n| :--- | :--- |\n';
      for (const res of parsedPlan.resourceChanges) {
        const escapedAddress = res.address.replace(/\|/g, '\\|');
        table += `| ${res.badge} | \`${escapedAddress}\` |\n`;
      }
    }
    sections.push(`### 📦 Resource Changes\n\n${table.trim()}`);
  }

  // Output Changes Table
  if (parsedPlan.outputChanges.length > 0) {
    let outTable = '| Action | Output |\n| :--- | :--- |\n';
    for (const out of parsedPlan.outputChanges) {
      const sensitiveNote = out.sensitive ? ' *(sensitive)*' : '';
      outTable += `| ${out.badge} | \`${out.name}\`${sensitiveNote} |\n`;
    }
    sections.push(`### 📤 Output Changes\n\n${outTable.trim()}`);
  }

  return sections.join('\n\n');
}

module.exports = {
  formatSummary
};
