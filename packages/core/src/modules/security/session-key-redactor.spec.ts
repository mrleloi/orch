import { redactSessionKey } from './session-key-redactor.js';

describe('redactSessionKey', () => {
  afterEach(() => {
    delete process.env['ORCH_DEBUG_SESSION_KEYS'];
  });

  it('default — returns sha256 hex prefix (12 chars), not the raw input', () => {
    const raw = 'myProject:default:hello world this is a test prompt';
    const result = redactSessionKey(raw);

    expect(result).not.toBe(raw);
    expect(result).toMatch(/^[a-f0-9]{12}$/);

    // deterministic
    const result2 = redactSessionKey(raw);
    expect(result2).toBe(result);
  });

  it('with ORCH_DEBUG_SESSION_KEYS=1 — round-trips raw input', () => {
    process.env['ORCH_DEBUG_SESSION_KEYS'] = '1';

    const raw = 'myProject:default:hello world this is a test prompt';
    const result = redactSessionKey(raw);

    expect(result).toBe(raw);
  });
});
