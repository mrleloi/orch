/**
 * Jest global setup — runs before each test file in the worker process.
 *
 * Sets NODE_ENV=test so that test-only guards (resetOrchContextForTest, etc.)
 * behave correctly regardless of the outer shell's NODE_ENV value.
 */
process.env['NODE_ENV'] = 'test';
