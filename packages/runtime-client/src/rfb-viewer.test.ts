import { afterEach, describe, expect, test } from "bun:test";

import { openVncViewer } from "./rfb-viewer";
import { startFakeVnc } from "./testing/fake-vnc";

const open: { close(): void }[] = [];
afterEach(() => {
  for (const item of open.splice(0)) item.close();
});

async function reader(output: AsyncIterable<Uint8Array>) {
  const iterator = output[Symbol.asyncIterator]();
  let buffered = Buffer.alloc(0);
  return async (count: number) => {
    while (buffered.length < count) {
      const next = await iterator.next();
      if (next.done) throw new Error("ended");
      buffered = Buffer.concat([buffered, next.value]);
    }
    const out = buffered.subarray(0, count);
    buffered = buffered.subarray(count);
    return out;
  };
}

describe("the relay that gives a browser the desktop without its password", () => {
  test("speaks RFB with no login to the browser, logs in itself, then passes bytes both ways", async () => {
    const fake = startFakeVnc({ width: 4, height: 3 });
    open.push(fake);
    const tunnel = await openVncViewer({
      host: "127.0.0.1",
      port: fake.port,
      password: fake.password,
    });
    open.push(tunnel);
    const take = await reader(tunnel.output);

    expect((await take(12)).toString()).toBe("RFB 003.008\n");
    await tunnel.write("RFB 003.008\n");
    expect([...(await take(2))]).toEqual([1, 1]);
    await tunnel.write(Buffer.from([1]));
    expect([...(await take(4))]).toEqual([0, 0, 0, 0]);

    await tunnel.write(Buffer.from([1]));
    const init = await take(28);
    expect([init.readUInt16BE(0), init.readUInt16BE(2), init.subarray(24).toString()]).toEqual([
      4,
      3,
      "fake",
    ]);

    const key = Buffer.from([4, 1, 0, 0, 0, 0, 0, 0x61]);
    await tunnel.write(key);
    await tunnel.write(Buffer.from([3, 0, 0, 0, 0, 0, 0, 4, 0, 3]));
    await take(4 + 12 + 4 * 3 * 4);
    expect(fake.events).toEqual([{ type: "key", down: true, keysym: 0x61 }]);
  });

  test("refuses to open when the password is wrong", async () => {
    const fake = startFakeVnc();
    open.push(fake);
    await expect(
      openVncViewer({ host: "127.0.0.1", port: fake.port, password: "wrong" }),
    ).rejects.toThrow("refused");
  });

  test("ends when the desktop does, and a close ends the output", async () => {
    const fake = startFakeVnc();
    open.push(fake);
    const tunnel = await openVncViewer({
      host: "127.0.0.1",
      port: fake.port,
      password: fake.password,
    });
    tunnel.close();
    expect(await tunnel.exit).toEqual({ reason: "closed" });
    expect(await Array.fromAsync(tunnel.output)).toEqual([Buffer.from("RFB 003.008\n")]);
    await expect(tunnel.write("x")).rejects.toThrow("ended");
  });
});
