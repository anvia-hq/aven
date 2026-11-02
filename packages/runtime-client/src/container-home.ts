// A thread keeps the image it started from, so an environment saved from a sandbox image before
// decision 0095 keeps that image's home, which only uid 1000 can use, and has no entry for the host
// user's uid. When the container runs as the host user, `gh`, git and the package caches then fail
// with "Permission denied". This is the fix the new image has, made to a container whose image has
// not: run as root in the started container, and a no-op on an image that already has it.

// The folders the sandbox image makes writable by any user: the home, the Python environment and
// the Rust toolchain.
const TREES = ["/home/node", "/opt/venv", "/usr/local/rustup", "/usr/local/cargo"];

// `$1` is the uid and `$2` the gid. Only the entries that are not writable already are changed:
// `chmod -R` touches every file, and each one touched is copied into the container's layer.
const REPAIR = `
[ "$(stat -c %a /home/node)" = 777 ] && exit 0
chmod 0777 /home/node
find ${TREES.join(" ")} \\( -type f -o -type d \\) ! -perm -o=rw -exec chmod a+rwX {} +
chmod 0666 /etc/passwd /etc/group
getent group "$2" >/dev/null || echo "aven:x:$2:" >> /etc/group
getent passwd "$1" >/dev/null || echo "aven:x:$1:$2:Aven sandbox:/home/node:/bin/bash" >> /etc/passwd
`;

/** The `docker exec` arguments that repair `container`'s home for `user` (`uid:gid`), as root. */
export function homeRepairArgs(container: string, user: string) {
  const [uid = "", gid = ""] = user.split(":");
  return ["exec", "-u", "0", container, "sh", "-c", REPAIR, "sh", uid, gid || uid];
}
