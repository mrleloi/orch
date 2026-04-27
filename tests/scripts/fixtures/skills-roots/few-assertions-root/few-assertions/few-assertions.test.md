# few-assertions — Test File

## Trigger

Use when testing assertion count validation.

## Expected behavior (PASS)

The validator reports a `test-too-few-assertions` error when minAssertionsPerTest is 3.

## Named failure modes

- **Too few assertions**: validator reports error.

## Assertions

1. The validator emits `test-too-few-assertions` when this file is checked.
2. The exit code is 1 when requireSiblingTest is true and this file is used.
