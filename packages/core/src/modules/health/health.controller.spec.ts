/**
 * HealthController spec
 *
 * Covers:
 *  - GET /healthz returns 200 { status: 'ok', uptime: <number> }
 */

import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    controller = module.get(HealthController);
  });

  describe('check()', () => {
    it('returns status ok', () => {
      const result = controller.check();
      expect(result.status).toBe('ok');
    });

    it('returns a numeric uptime', () => {
      const result = controller.check();
      expect(typeof result.uptime).toBe('number');
      expect(result.uptime).toBeGreaterThanOrEqual(0);
    });
  });
});
