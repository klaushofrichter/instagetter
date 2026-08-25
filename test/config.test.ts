import { describe, it, expect, afterEach } from 'vitest';
import { assertRequiredEnv } from '../src/config';

const original = process.env.INSTA_API_TOKENS;

afterEach(() => {
  process.env.INSTA_API_TOKENS = original;
});

describe('assertRequiredEnv', () => {
  it('passes when every required variable is set', () => {
    expect(() => assertRequiredEnv()).not.toThrow();
  });

  it('throws naming the missing variable', () => {
    delete process.env.INSTA_API_TOKENS;

    expect(() => assertRequiredEnv()).toThrow(/INSTA_API_TOKENS/);
  });
});
