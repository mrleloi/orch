/**
 * ConsoleNotifierService spec
 *
 * Covers:
 *  - notify('info') logs at info level
 *  - notify('warn') logs at warn level
 *  - notify('error') logs at error level
 *  - returns a resolved Promise
 *  - context fields are included in log payload
 */

import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { ConsoleNotifierService } from './console-notifier.service.js';

describe('ConsoleNotifierService', () => {
  let service: ConsoleNotifierService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [ConsoleNotifierService],
    }).compile();

    service = module.get(ConsoleNotifierService);
  });

  it('notify returns a Promise', async () => {
    const result = service.notify('info', 'test message');
    expect(result).toBeInstanceOf(Promise);
    await expect(result).resolves.toBeUndefined();
  });

  it('notify info calls Logger.log', async () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    await service.notify('info', 'info message', { key: 'val' });
    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({ msg: 'info message', key: 'val' }),
    );
    logSpy.mockRestore();
  });

  it('notify warn calls Logger.warn', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    await service.notify('warn', 'warn message');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ msg: 'warn message' }),
    );
    warnSpy.mockRestore();
  });

  it('notify error calls Logger.error', async () => {
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    await service.notify('error', 'error message');
    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ msg: 'error message' }),
    );
    errorSpy.mockRestore();
  });
});
