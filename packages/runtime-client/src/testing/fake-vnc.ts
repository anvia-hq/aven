import { ByteQueue } from "../byte-queue";
import { vncResponse } from "../rfb";

export type FakeVncEvent =
  | { type: "key"; down: boolean; keysym: number }
  | { type: "pointer"; buttons: number; x: number; y: number };

const CHALLENGE = Buffer.from("0123456789abcdef");

export function startFakeVnc(
  options: { password?: string; width?: number; height?: number; resizeOnRequest?: boolean } = {},
) {
  const password = options.password ?? "secret";
  let width = options.width ?? 4;
  let height = options.height ?? 3;
  const events: FakeVncEvent[] = [];
  const encodings: number[][] = [];
  let connections = 0;

  const pixel = (x: number, y: number) => [x * 10, y * 10, 200, 0];

  const serve = async (queue: ByteQueue, write: (data: Uint8Array) => void) => {
    write(Buffer.from("RFB 003.008\n"));
    await queue.take(12);
    write(Buffer.from([1, 2]));
    await queue.take(1);
    write(CHALLENGE);
    const response = await queue.take(16);
    if (!response.equals(vncResponse(password, CHALLENGE))) {
      write(Buffer.from([0, 0, 0, 1, 0, 0, 0, 6, ...Buffer.from("denied")]));
      return;
    }
    write(Buffer.alloc(4));
    await queue.take(1);
    const init = Buffer.alloc(24 + 4);
    init.writeUInt16BE(width, 0);
    init.writeUInt16BE(height, 2);
    init[4] = 32;
    init[5] = 24;
    init[7] = 1;
    init.writeUInt32BE(4, 20);
    init.write("fake", 24);
    write(init);
    for (;;) {
      const type = (await queue.take(1))[0]!;
      if (type === 0) await queue.take(19);
      else if (type === 2) {
        const head = await queue.take(3);
        const count = head.readUInt16BE(1);
        const list = await queue.take(count * 4);
        encodings.push(Array.from({ length: count }, (_, index) => list.readInt32BE(index * 4)));
      } else if (type === 3) {
        await queue.take(9);
        if (options.resizeOnRequest && width === (options.width ?? 4)) {
          width += 2;
          height += 1;
          const resize = Buffer.alloc(4 + 12);
          resize.writeUInt16BE(1, 2);
          resize.writeUInt16BE(width, 8);
          resize.writeUInt16BE(height, 10);
          resize.writeInt32BE(-223, 12);
          write(resize);
          continue;
        }
        const head = Buffer.alloc(4 + 12);
        head.writeUInt16BE(1, 2);
        head.writeUInt16BE(width, 8);
        head.writeUInt16BE(height, 10);
        const pixels = Buffer.alloc(width * height * 4);
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++)
            Buffer.from(pixel(x, y)).copy(pixels, (y * width + x) * 4);
        }
        write(Buffer.concat([head, pixels]));
      } else if (type === 4) {
        const body = await queue.take(7);
        events.push({ type: "key", down: body[0] === 1, keysym: body.readUInt32BE(3) });
      } else if (type === 5) {
        const body = await queue.take(5);
        events.push({
          type: "pointer",
          buttons: body[0]!,
          x: body.readUInt16BE(1),
          y: body.readUInt16BE(3),
        });
      } else throw new Error(`unknown client message ${type}`);
    }
  };

  const server = Bun.listen({
    hostname: "127.0.0.1",
    port: 0,
    socket: {
      open(socket) {
        connections += 1;
        const queue = new ByteQueue();
        Object.assign(socket, { queue });
        void serve(queue, (data) => socket.write(data)).catch(() => socket.end());
      },
      data(socket, data) {
        (socket as unknown as { queue: ByteQueue }).queue.push(new Uint8Array(data));
      },
      close(socket) {
        (socket as unknown as { queue: ByteQueue }).queue.end();
      },
    },
  });

  return {
    port: server.port,
    password,
    events,
    encodings,
    connections: () => connections,
    pixel,
    close: () => server.stop(true),
  };
}
