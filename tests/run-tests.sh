#!/bin/bash
# Run tests with ES module support
# Usage: ./tests/run-tests.sh [test-file]

set -e

# Save original package.json
cp package.json package.json.bak

# Temporarily switch to ES modules
sed -i.tmp 's/"type": "commonjs"/"type": "module"/' package.json
rm -f package.json.tmp

# Run the tests
if [ -n "$1" ]; then
    node "tests/$1" || TEST_RESULT=$?
else
    # Run all test files
    for testfile in tests/*.test.js; do
        if [ -f "$testfile" ]; then
            echo "Running $testfile..."
            node "$testfile" || TEST_RESULT=$?
        fi
    done
fi

# Restore original package.json
mv package.json.bak package.json

exit ${TEST_RESULT:-0}
