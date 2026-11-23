import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { existsSync, statSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import {
  credentialsPath,
  endpoint,
  failureOf,
  fake,
  runOk,
  setUp,
  tearDown,
} from './command-fixtures.ts';
import { fakeModels } from './fake-models.ts';

beforeEach(() => setUp(spyOn));
afterEach(tearDown);

describe('keepsake login', () => {
  it('stores a key the provider accepts where only the owner can read it', async () => {
    await rm(credentialsPath());
    fake.stdin = `${fakeModels.key}\n`;
    const result = await runOk(
      'login',
      'azure',
      '--endpoint',
      `${endpoint}/openai/deployments/`,
    );
    expect(result).toEqual({
      provider: 'azure',
      signedIn: true,
      endpoint,
      models: 1,
    });
    expect(JSON.parse(await readFile(credentialsPath(), 'utf8'))).toEqual({
      azure: { endpoint, apiKey: fakeModels.key },
    });
    expect(statSync(credentialsPath()).mode % 0o1000).toBe(0o600);
  });

  it('keeps the old key when the provider refuses the new one', async () => {
    fake.stdin = 'wrong';
    const failure = await failureOf('login', 'azure');
    expect(failure._tag).toBe('NotSignedIn');
    expect(failure.message).not.toContain('wrong');
    expect(await readFile(credentialsPath(), 'utf8')).toContain(fakeModels.key);
  });

  it('keeps the keys of other providers', async () => {
    fake.stdin = fakeModels.key;
    await runOk('login', 'openai');
    const stored = JSON.parse(await readFile(credentialsPath(), 'utf8'));
    expect(stored).toEqual({
      azure: { endpoint, apiKey: fakeModels.key },
      openai: { endpoint: null, apiKey: fakeModels.key },
    });
  });

  it.each(['', 'two words'])('refuses %j as a key', async (key) => {
    fake.stdin = key;
    expect((await failureOf('login', 'azure'))._tag).toBe('InvalidInput');
  });

  it('asks for the address of the Azure resource', async () => {
    await rm(credentialsPath());
    fake.stdin = fakeModels.key;
    const failure = await failureOf('login', 'azure');
    expect(failure.message).toContain('--endpoint');
  });

  it.each(['http://example.openai.azure.com', 'example'])(
    'refuses %s as an endpoint',
    async (address) => {
      fake.stdin = fakeModels.key;
      const failure = await failureOf('login', 'azure', '--endpoint', address);
      expect(failure._tag).toBe('InvalidInput');
    },
  );
});

describe('keepsake status and logout', () => {
  it('shows which providers have a key', async () => {
    expect(await runOk('status')).toEqual({
      providers: [
        { provider: 'azure', signedIn: true },
        { provider: 'openai', signedIn: false },
        { provider: 'anthropic', signedIn: false },
        { provider: 'google', signedIn: false },
      ],
    });
  });

  it('removes a key', async () => {
    expect(await runOk('logout', 'azure')).toEqual({
      provider: 'azure',
      signedIn: false,
      removedKey: true,
    });
    expect(existsSync(credentialsPath())).toBe(true);
    expect(await readFile(credentialsPath(), 'utf8')).not.toContain(
      fakeModels.key,
    );
    expect((await runOk('logout', 'azure')).removedKey).toBe(false);
  });
});
