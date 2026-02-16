import { describe, it, expect } from 'vitest';
import { BinaryTokenWriter } from './writer.js';
import { Writable } from 'node:stream';

describe('BinaryTokenWriter Security', () => {
  const createMockStream = () => new Writable({
    write(chunk, encoding, callback) {
      callback();
    }
  });

  it('enforces maxUniqueStrings limit', async () => {
    const tokenStream = createMockStream();
    const metaStream = createMockStream();
    const writer = new BinaryTokenWriter(tokenStream, metaStream, undefined, {
      maxUniqueStrings: 2
    });

    await writer.writeString('one');
    await writer.writeString('two');

    // Should fail on third unique string
    await expect(async () => {
      await writer.writeString('three');
    }).rejects.toThrow(/limit reached/);
  });

  it('enforces maxStringTableBytes limit', async () => {
    const tokenStream = createMockStream();
    const metaStream = createMockStream();
    const writer = new BinaryTokenWriter(tokenStream, metaStream, undefined, {
      maxStringTableBytes: 10
    });

    // 'one' (3 bytes)
    await writer.writeString('one');
    // 'two' (3 bytes) -> total 6
    await writer.writeString('two');

    // 'three' (5 bytes) -> total 11 > 10
    await expect(async () => {
      await writer.writeString('three');
    }).rejects.toThrow(/limit reached/);
  });
});
