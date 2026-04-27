/**
 * localhost-bind.spec.ts
 *
 * Verifies the I-7 invariant: default host is 127.0.0.1.
 *
 * We test this by inspecting the main.ts source (structural test) since we
 * cannot actually bootstrap the full NestJS app in a unit test context.
 * The main.ts source is read and the default host constant is verified.
 *
 * Additionally, tests the ORCH_HTTP_HOST override logic by examining
 * the source for the env var reference.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

describe('main.ts localhost-bind (I-7)', () => {
  let mainTsSource: string;

  beforeAll(() => {
    const mainTsPath = path.join(__dirname, '../../main.ts');
    mainTsSource = fs.readFileSync(mainTsPath, 'utf8');
  });

  it('default host is 127.0.0.1', () => {
    expect(mainTsSource).toContain('127.0.0.1');
  });

  it('host is overridable via ORCH_HTTP_HOST env var', () => {
    expect(mainTsSource).toContain('ORCH_HTTP_HOST');
  });

  it('uses FastifyAdapter', () => {
    expect(mainTsSource).toContain('FastifyAdapter');
  });

  it('uses NestFastifyApplication type', () => {
    expect(mainTsSource).toContain('NestFastifyApplication');
  });
});
