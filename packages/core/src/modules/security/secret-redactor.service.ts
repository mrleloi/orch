/**
 * SecretRedactorService — thin NestJS DI wrapper over the pure redactSecrets() function.
 *
 * Delegates all logic to the pure function. Zero additional business logic here.
 */

import { Injectable } from '@nestjs/common';
import { redactSecrets } from './secret-redactor.js';

@Injectable()
export class SecretRedactorService {
  /**
   * Redact secrets from `input`. Delegates to the pure `redactSecrets()` function.
   */
  redact(input: string): string {
    return redactSecrets(input);
  }
}
