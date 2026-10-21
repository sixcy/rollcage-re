import { open } from 'node:fs/promises';
import { inflateRaw } from 'node:zlib';
import { openFirebugsDisc } from '../../src/ps1-disc.mjs';

export async function openFirebugsZip(filename, options = {}) {
  const handle = await open(filename, 'r');
  try {
    const source = {
      size: (await handle.stat()).size,
      async read(offset, length) {
        const bytes = Buffer.alloc(length);
        let position = 0;
        while (position < length) {
          const { bytesRead } = await handle.read(bytes, position, length - position, offset + position);
          if (!bytesRead) throw new Error('Truncated ZIP file read.');
          position += bytesRead;
        }
        return bytes;
      },
    };
    const disc = await openFirebugsDisc(source, {
      ...options,
      inflateRaw: (bytes, size) => new Promise((resolve, reject) => {
        inflateRaw(bytes, { maxOutputLength: Math.max(1, size) }, (error, result) => error ? reject(error) : resolve(result));
      }),
    });
    return { ...disc, async close() {} };
  } finally { await handle.close(); }
}
