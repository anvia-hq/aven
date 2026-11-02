import { describe, expect, test } from "bun:test";

import { homeRepairArgs } from "./container-home";

describe("homeRepairArgs", () => {
  test("runs as root in the container and is given the user's uid and gid", () => {
    const args = homeRepairArgs("aven-sandbox-t1", "1002:1003");

    expect(args.slice(0, 6)).toEqual(["exec", "-u", "0", "aven-sandbox-t1", "sh", "-c"]);
    expect(args.slice(-3)).toEqual(["sh", "1002", "1003"]);
  });

  test("does nothing on an image whose home is already open to any user", () => {
    const script = homeRepairArgs("c", "1002:1002")[6]!;

    // The first thing it does, before anything is changed.
    expect(script.trim().split("\n")[0]).toBe('[ "$(stat -c %a /home/node)" = 777 ] && exit 0');
  });

  test("opens only what is not writable already, since touching every file copies it into the layer", () => {
    const script = homeRepairArgs("c", "1002:1002")[6]!;

    expect(script).toContain("! -perm -o=rw -exec chmod a+rwX {} +");
    expect(script).not.toContain("chmod -R");
    for (const tree of ["/home/node", "/opt/venv", "/usr/local/rustup", "/usr/local/cargo"]) {
      expect(script).toContain(tree);
    }
  });

  test("a bare uid is its own gid", () => {
    expect(homeRepairArgs("c", "4242").slice(-3)).toEqual(["sh", "4242", "4242"]);
  });
});
