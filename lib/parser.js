/**
 * Parser for Terraform plan JSON representation (terraform show -json).
 * Specification: https://developer.hashicorp.com/terraform/internals/json-format
 */

function parsePlan(jsonString) {
  let plan;
  try {
    plan = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;
  } catch (err) {
    throw new Error(`Failed to parse Terraform plan JSON: ${err.message}`);
  }

  const rawChanges = plan.resource_changes || [];
  const rawOutputs = plan.output_changes || {};

  const resourceChanges = [];
  let addCount = 0;
  let changeCount = 0;
  let destroyCount = 0;
  let replaceCount = 0;
  let importCount = 0;
  let readCount = 0;

  for (const rc of rawChanges) {
    const change = rc.change || {};
    const actions = change.actions || [];
    const isImport = Boolean(change.importing && change.importing.id);
    const isMove = Boolean(rc.previous_address);

    let actionType = 'no-op';
    let badge = '⚪ `no-op`';
    let details = '';

    if (isMove && (!actions.length || actions.includes('no-op'))) {
      actionType = 'move';
      badge = '📦 `move`';
      details = `from \`${rc.previous_address}\``;
    } else if (actions.includes('create') && actions.includes('delete')) {
      actionType = 'replace';
      badge = '⚠️ `replace`';
      replaceCount++;
      addCount++;
      destroyCount++;
      if (rc.action_reason) {
        details = formatActionReason(rc.action_reason);
      }
    } else if (actions.includes('create')) {
      if (isImport) {
        actionType = 'import';
        badge = '📥 `import`';
        importCount++;
        details = `id: \`${change.importing.id}\``;
      } else {
        actionType = 'create';
        badge = '➕ `create`';
        addCount++;
      }
    } else if (actions.includes('delete')) {
      actionType = 'delete';
      badge = '🗑️ `destroy`';
      destroyCount++;
    } else if (actions.includes('update')) {
      actionType = 'update';
      badge = '🔄 `update`';
      changeCount++;
    } else if (actions.includes('read')) {
      actionType = 'read';
      badge = '📖 `read`';
      readCount++;
    }

    if (actionType !== 'no-op') {
      resourceChanges.push({
        address: rc.address,
        type: rc.type,
        name: rc.name,
        mode: rc.mode,
        actionType,
        badge,
        details,
        previousAddress: rc.previous_address
      });
    }
  }

  const outputChanges = [];
  for (const [name, out] of Object.entries(rawOutputs)) {
    const actions = (out && out.change && out.change.actions) || [];
    let badge = '';
    let actionType = 'no-op';

    if (actions.includes('create')) {
      badge = '➕ `create`';
      actionType = 'create';
    } else if (actions.includes('update')) {
      badge = '🔄 `update`';
      actionType = 'update';
    } else if (actions.includes('delete')) {
      badge = '🗑️ `delete`';
      actionType = 'delete';
    }

    if (actionType !== 'no-op') {
      outputChanges.push({
        name,
        actionType,
        badge,
        sensitive: Boolean(out.change && (out.change.before_sensitive || out.change.after_sensitive))
      });
    }
  }

  const hasChanges =
    addCount > 0 ||
    changeCount > 0 ||
    destroyCount > 0 ||
    replaceCount > 0 ||
    importCount > 0 ||
    outputChanges.length > 0;

  return {
    formatVersion: plan.format_version,
    terraformVersion: plan.terraform_version,
    counts: {
      add: addCount,
      change: changeCount,
      destroy: destroyCount,
      replace: replaceCount,
      import: importCount,
      read: readCount
    },
    hasChanges,
    resourceChanges,
    outputChanges
  };
}

function formatActionReason(reason) {
  switch (reason) {
    case 'replace_because_cannot_update':
      return 'requires new resource';
    case 'replace_because_tainted':
      return 'resource is tainted';
    case 'replace_by_request':
      return 'requested replace';
    default:
      return reason.replace(/_/g, ' ');
  }
}

module.exports = {
  parsePlan,
  formatActionReason
};
