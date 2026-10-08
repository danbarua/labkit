import {
  appendFileSync,
  closeSync,
  existsSync,
  fsyncSync,
  openSync,
  renameSync,
  statSync,
} from "node:fs";

/** Synchronous writes keep the queue bounded and preserve records before a crash. */
export function rotatingFileSink(path: string, maxBytes: number, backups: number) {
  let bytes = existsSync(path) ? statSync(path).size : 0;
  let descriptor = openSync(path, "a", 0o600);
  let closed = false;
  return {
    write(line: string) {
      if (closed) throw new Error("Diagnostic sink is closed");
      const size = Buffer.byteLength(line);
      if (bytes > 0 && bytes + size > maxBytes) {
        fsyncSync(descriptor);
        closeSync(descriptor);
        descriptor = -1;
        for (let index = backups; index >= 1; index--) {
          const source = index === 1 ? path : `${path}.${index - 1}`;
          const destination = `${path}.${index}`;
          if (existsSync(source)) renameSync(source, destination);
        }
        descriptor = openSync(path, "a", 0o600);
        bytes = 0;
      }
      appendFileSync(descriptor, line);
      bytes += size;
    },
    close() {
      if (closed) return;
      closed = true;
      if (descriptor >= 0) {
        try {
          fsyncSync(descriptor);
        } finally {
          closeSync(descriptor);
        }
      }
    },
  };
}
