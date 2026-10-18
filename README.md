# Terraform Summary Action

A high-performance GitHub Action that generates a rich, structured [Job Summary](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands#adding-a-job-summary) by parsing the machine-readable Terraform/OpenTofu plan JSON representation ([HashiCorp JSON Output Format](https://developer.hashicorp.com/terraform/internals/json-format)).

---

## Features

- 📊 **Overview Metrics**: Summary table with counts for Added, Changed, Destroyed, Replaced, and Imported resources.
- 📦 **Structured Resource Changes Table**: Clear visual table with intuitive action badges:
  - `➕ create`
  - `🔄 update`
  - `⚠️ replace` (with specific replacement reasons such as *requires new resource* or *resource is tainted*)
  - `🗑️ destroy`
  - `📥 import` (with target import ID)
  - `📦 move` (with prior resource address)
  - `📖 read` (data sources)
- 📤 **Output Changes Table**: Highlights changes to root module outputs.
- 📋 **Collapsible Full Plan**: The complete plan is preserved inside an expandable `<details>` section formatted in JSON.
- ✅ **No Changes Detection**: Renders a clean GitHub callout (`> [!NOTE]`) when infrastructure matches configuration.
- ⚡ **Zero-Dependency Node.js Action**: Built on native Node 20 with zero external npm dependencies.
- 🛡️ **Payload Limit Guard**: Safely enforces a threshold to protect against GitHub Step Summary's 1024 KiB payload limit.

---

## Rendered Summary Example

### 📊 Plan Summary

| ➕ Add | 🔄 Change | 🗑️ Destroy | ⚠️ Replace | 📥 Import |
| :---: | :---: | :---: | :---: | :---: |
| 3 | 1 | 2 | 1 | 1 |

### 📦 Resource Changes

| Action | Resource | Details |
| :--- | :--- | :--- |
| 🔄 `update` | `aws_instance.web` | — |
| ➕ `create` | `aws_s3_bucket.data_bucket` | — |
| 🗑️ `destroy` | `aws_security_group_rule.legacy` | — |
| ⚠️ `replace` | `aws_eip.ip` | requires new resource |
| ➕ `create` | `module.network.aws_route53_record.dns["app"]` | — |
| 📥 `import` | `aws_iam_role.imported_role` | id: `existing-role` |
| 📦 `move` | `aws_subnet.app_subnet` | from `aws_subnet.old_app_subnet` |
| 📖 `read` | `data.aws_ami.ubuntu` | — |

### 📤 Output Changes

| Action | Output |
| :--- | :--- |
| ➕ `create` | `new_url` |

<details>
<summary>📋 View Full Terraform Plan (JSON)</summary>

```json
{
  "format_version": "1.2",
  "terraform_version": "1.9.0",
  ...
}
```

</details>

---

## Usage

```yaml
- name: Terraform Plan
  run: |
    terraform plan -out=tfplan.binary
    terraform show -json tfplan.binary > tfplan.json

- name: Generate Terraform Plan Job Summary
  uses: seatling/terraform-summary-action@v1.0.0
```

## Inputs

| Input | Required | Default | Description |
| :--- | :---: | :---: | :--- |
| `plan-file` | **Yes** | — | Path to the Terraform plan JSON representation (generated via `terraform show -json tfplan.binary > tfplan.json`). |
| `title` | No | `""` | Optional header title displayed above the summary. |
| `log-file` | No | `""` | Backward-compatibility alias for `plan-file`. |

---

## Running Tests

Run the test suite locally:

```bash
node tests/run_all.js
```
