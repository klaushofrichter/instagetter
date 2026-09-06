import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { replicaWarning } from '../src/config';

const original = process.env.MAX_SCALE;

beforeEach(() => {
  delete process.env.MAX_SCALE;
});

afterEach(() => {
  if (original === undefined) delete process.env.MAX_SCALE;
  else process.env.MAX_SCALE = original;
});

describe('replicaWarning', () => {
  it('is silent at exactly one replica', () => {
    process.env.MAX_SCALE = '1';

    expect(replicaWarning()).toBeNull();
  });

  it('warns when scaled out, naming the multiplier', () => {
    // The failure this exists to catch: nothing errors, every caller simply
    // gets 3x the limit because each replica counts on its own.
    process.env.MAX_SCALE = '3';

    const warning = replicaWarning();

    expect(warning).toContain('3x');
    expect(warning).toContain('shared store');
  });

  it('warns when the count is absent, rather than assuming it is safe', () => {
    // Silence here would be indistinguishable from "verified as 1".
    expect(replicaWarning()).toContain('cannot be checked');
  });

  it('warns on a value that is not a replica count', () => {
    process.env.MAX_SCALE = 'unlimited';

    expect(replicaWarning()).toContain('not a replica count');
  });

  it('treats zero as unusable rather than as fewer than one', () => {
    process.env.MAX_SCALE = '0';

    expect(replicaWarning()).not.toBeNull();
  });
});
