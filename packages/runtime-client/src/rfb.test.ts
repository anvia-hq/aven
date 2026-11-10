import { afterEach, describe, expect, test } from "bun:test";

import { RfbClient } from "./rfb";
import { startFakeVnc } from "./testing/fake-vnc";

const open: { close(): void }[] = [];
afterEach(() => {
  for (const item of open.splice(0)) item.close();
});

const server = (options?: Parameters<typeof startFakeVnc>[0]) => {
  const fake = startFakeVnc(options);
  open.push(fake);
  return fake;
};

const connect = async (fake: ReturnType<typeof startFakeVnc>, password = fake.password) => {
  const client = await RfbClient.connect({ host: "127.0.0.1", port: fake.port, password });
  open.push(client);
  return client;
};

describe("an RFB client", () => {
  test("logs in with the VNC password and learns the screen's size and name", async () => {
    const client = await connect(server({ width: 8, height: 6 }));
    expect([client.width, client.height, client.name]).toEqual([8, 6, "fake"]);
  });

  test("says the password was refused", async () => {
    const fake = server();
    await expect(connect(fake, "wrong")).rejects.toThrow("refused the password");
  });

  test("asks for the pseudo-encodings Apple's server insists on, besides raw", async () => {
    const fake = server();
    const client = await connect(fake);
    await client.refresh();
    expect(fake.encodings[0]).toEqual([0, 1, -223, -308, -239, -307]);
  });

  test("a refresh gives the whole picture as RGBA", async () => {
    const fake = server({ width: 4, height: 3 });
    const frame = await (await connect(fake)).refresh();
    expect([frame.width, frame.height]).toEqual([4, 3]);
    const at = (x: number, y: number) => [
      ...frame.rgba.subarray((y * 4 + x) * 4, (y * 4 + x) * 4 + 4),
    ];
    expect(at(0, 0)).toEqual([0, 0, 200, 255]);
    expect(at(3, 2)).toEqual([30, 20, 200, 255]);
  });

  test("follows a change of the screen's size and refreshes again for the new picture", async () => {
    const fake = server({ width: 4, height: 3, resizeOnRequest: true });
    const client = await connect(fake);
    const frame = await client.refresh();
    expect([frame.width, frame.height]).toEqual([6, 4]);
    expect(frame.rgba[(3 * 6 + 5) * 4 + 3]).toBe(255);
  });

  test("sends the pointer and the keys it is told to", async () => {
    const fake = server();
    const client = await connect(fake);
    client.move(2, 1, 1);
    client.key(0x61, true);
    client.key(0x61, false);
    client.move(3.4, 2, 0);
    await client.refresh();
    expect(fake.events).toEqual([
      { type: "pointer", buttons: 1, x: 2, y: 1 },
      { type: "key", down: true, keysym: 0x61 },
      { type: "key", down: false, keysym: 0x61 },
      { type: "pointer", buttons: 0, x: 3, y: 2 },
    ]);
    expect(client.pointer).toEqual({ x: 3.4, y: 2, buttons: 0 });
  });

  test("says so when the desktop goes away, instead of waiting for a picture", async () => {
    const fake = server();
    const client = await connect(fake);
    fake.close();
    client.close();
    await expect(client.refresh()).rejects.toThrow();
    expect(client.open).toBe(false);
  });
});
