const TREES = ["/home/node", "/opt/venv", "/usr/local/rustup", "/usr/local/cargo"];

const REPAIR = `
[ "$(stat -c %a /home/node)" = 777 ] && exit 0
chmod 0777 /home/node
find ${TREES.join(" ")} \\( -type f -o -type d \\) ! -perm -o=rw -exec chmod a+rwX {} +
chmod 0666 /etc/passwd /etc/group
getent group "$2" >/dev/null || echo "aven:x:$2:" >> /etc/group
getent passwd "$1" >/dev/null || echo "aven:x:$1:$2:Aven sandbox:/home/node:/bin/bash" >> /etc/passwd
`;

export function homeRepairArgs(container: string, user: string) {
  const [uid = "", gid = ""] = user.split(":");
  return ["exec", "-u", "0", container, "sh", "-c", REPAIR, "sh", uid, gid || uid];
}
