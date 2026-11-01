import { expect, test } from "bun:test";

import { launchdPlist, systemdUnit, type ServiceDefinition } from "./service-files";

const def: ServiceDefinition = {
  label: "dev.anvia.aven-runner",
  command: ["/opt/aven & co/aven", "runner", "run"],
  env: { PATH: "/usr/local/bin:/usr/bin", NOTE: 'a "b" 100%' },
  logFile: "/home/me/.aven/logs/runner.log",
};

test("the launchd agent runs the command, restarts it and escapes what XML would break on", () => {
  const plist = launchdPlist(def);
  expect(plist).toContain("<string>/opt/aven &amp; co/aven</string>");
  expect(plist).toContain("<key>PATH</key>\n    <string>/usr/local/bin:/usr/bin</string>");
  expect(plist).toContain("<key>KeepAlive</key>\n  <true/>");
  expect(plist).toContain(
    "<key>StandardErrorPath</key>\n  <string>/home/me/.aven/logs/runner.log</string>",
  );
});

test("the systemd unit quotes the command and the environment, and logs to the file", () => {
  const unit = systemdUnit(def);
  expect(unit).toContain('ExecStart="/opt/aven & co/aven" "runner" "run"');
  expect(unit).toContain('Environment="NOTE=a \\"b\\" 100%%"');
  expect(unit).toContain("Restart=always");
  expect(unit).toContain("StandardOutput=append:/home/me/.aven/logs/runner.log");
  expect(unit).toContain("WantedBy=default.target");
});
