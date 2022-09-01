import { describe, expect, test } from 'vitest';
import { run } from '../src';

describe('Test action', function () {
  test('run', async () => {
    expect(true).toBeTruthy();
    run();
  });
});
