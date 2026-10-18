#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ACTION_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Resolve node binary
NODE_BIN="${NODE_CMD:-$(command -v node 2>/dev/null || command -v node.exe 2>/dev/null || echo "/mnt/c/tools/node-v24.14.1-win-x64/node.exe")}"

echo "🧪 Running unit tests (node:test) using ${NODE_BIN}..."
"$NODE_BIN" --test "${SCRIPT_DIR}/test_parser.js"

echo ""
echo "🧪 Running CLI integration tests for terraform-summary-action..."

TOTAL_TESTS=0
PASSED_TESTS=0

assert_contains() {
    local text="$1"
    local expected="$2"
    local test_name="$3"
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    if echo "$text" | grep -Fq -- "$expected"; then
        echo "  ✅ PASS: $test_name"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo "  ❌ FAIL: $test_name (expected to find '$expected')"
        return 1
    fi
}

echo ""
echo "▶️ Test 1: Full Plan JSON + Text execution"
OUTPUT_1=$("$NODE_BIN" "${ACTION_DIR}/index.js" "${SCRIPT_DIR}/fixtures/sample_plan.json" "Staging Plan" "${SCRIPT_DIR}/fixtures/sample_plan.txt")
assert_contains "$OUTPUT_1" "## Staging Plan" "Header title rendered"
assert_contains "$OUTPUT_1" "### 📊 Plan Summary" "Plan summary section present"
assert_contains "$OUTPUT_1" "| ➕ Add | 🔄 Change | 🗑️ Destroy | ⚠️ Replace | 📥 Import |" "Summary table headers present"
assert_contains "$OUTPUT_1" "| 3 | 1 | 2 | 1 | 1 |" "Summary counts match"
assert_contains "$OUTPUT_1" "### 📦 Resource Changes" "Resource changes section present"
assert_contains "$OUTPUT_1" '| 🔄 `update` | `aws_instance.web` |' "Update action detected"
assert_contains "$OUTPUT_1" '| ➕ `create` | `aws_s3_bucket.data_bucket` |' "Create action detected"
assert_contains "$OUTPUT_1" '| 🗑️ `destroy` | `aws_security_group_rule.legacy` |' "Destroy action detected"
assert_contains "$OUTPUT_1" '| ⚠️ `replace` | `aws_eip.ip` | requires new resource |' "Replace action detected with reason"
assert_contains "$OUTPUT_1" '| 📥 `import` | `aws_iam_role.imported_role` | id: `existing-role` |' "Import action detected with id"
assert_contains "$OUTPUT_1" '| 📦 `move` | `aws_subnet.app_subnet` | from `aws_subnet.old_app_subnet` |' "Move action detected"
assert_contains "$OUTPUT_1" "### 📤 Output Changes" "Output changes section present"
assert_contains "$OUTPUT_1" "<details>" "Collapsible details open tag present"
assert_contains "$OUTPUT_1" "<summary>📋 View Full Terraform Plan</summary>" "Collapsible summary tag present"
assert_contains "$OUTPUT_1" '```terraform' "Terraform syntax block present"
assert_contains "$OUTPUT_1" "</details>" "Collapsible details closing tag present"

echo ""
echo "▶️ Test 2: Full Plan JSON Only (no text plan provided)"
OUTPUT_2=$("$NODE_BIN" "${ACTION_DIR}/index.js" "${SCRIPT_DIR}/fixtures/sample_plan.json" "JSON Only")
assert_contains "$OUTPUT_2" "<summary>📋 View Full Terraform Plan (JSON)</summary>" "JSON summary tag present"
assert_contains "$OUTPUT_2" '```json' "JSON syntax block present"

echo ""
echo "▶️ Test 3: No Changes JSON handling"
OUTPUT_3=$("$NODE_BIN" "${ACTION_DIR}/index.js" "${SCRIPT_DIR}/fixtures/sample_no_changes.json")
assert_contains "$OUTPUT_3" "> [!NOTE]" "Note alert present"
assert_contains "$OUTPUT_3" "**No changes.** Your infrastructure matches the configuration." "No changes message present"

echo ""
echo "▶️ Test 4: Empty input file handling"
OUTPUT_4=$("$NODE_BIN" "${ACTION_DIR}/index.js" "${SCRIPT_DIR}/fixtures/sample_empty.txt" "Empty JSON Test")
assert_contains "$OUTPUT_4" "> [!WARNING]" "Warning alert present for empty file"
assert_contains "$OUTPUT_4" "Terraform plan JSON file is empty." "Empty file warning text present"

echo ""
echo "▶️ Test 5: Missing file handling"
OUTPUT_5=$("$NODE_BIN" "${ACTION_DIR}/index.js" "non_existent_file.json" 2>&1 || true)
assert_contains "$OUTPUT_5" "Plan file not found" "Missing file error caught"

echo ""
echo "--------------------------------------------------"
echo "Integration Test Results: $PASSED_TESTS / $TOTAL_TESTS passed"
echo "--------------------------------------------------"

if [[ "$PASSED_TESTS" -ne "$TOTAL_TESTS" ]]; then
    exit 1
fi
