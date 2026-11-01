export type ServiceDefinition = {
  /** The service's name: a launchd label or a systemd unit's name. */
  label: string;
  /** The program and its arguments. */
  command: string[];
  /** The environment the service starts with; a service manager gives it almost none of its own. */
  env: Record<string, string>;
  /** Where its output goes. */
  logFile: string;
};

const xml = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/** A launchd agent that starts at login and is started again when it exits. */
export function launchdPlist(def: ServiceDefinition) {
  const args = def.command.map((word) => `    <string>${xml(word)}</string>`).join("\n");
  const env = Object.entries(def.env)
    .map(([key, value]) => `    <key>${xml(key)}</key>\n    <string>${xml(value)}</string>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xml(def.label)}</string>
  <key>ProgramArguments</key>
  <array>
${args}
  </array>
  <key>EnvironmentVariables</key>
  <dict>
${env}
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>5</integer>
  <key>StandardOutPath</key>
  <string>${xml(def.logFile)}</string>
  <key>StandardErrorPath</key>
  <string>${xml(def.logFile)}</string>
</dict>
</plist>
`;
}

// systemd reads a word in double quotes literally except for \ " and the % specifiers.
const quote = (text: string) =>
  `"${text.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("%", "%%")}"`;

/** A systemd user unit that starts with the user's session and is restarted when it exits. */
export function systemdUnit(def: ServiceDefinition) {
  const env = Object.entries(def.env)
    .map(([key, value]) => `Environment=${quote(`${key}=${value}`)}`)
    .join("\n");
  return `[Unit]
Description=Aven runner
After=network-online.target docker.service
Wants=network-online.target

[Service]
ExecStart=${def.command.map(quote).join(" ")}
${env}
Restart=always
RestartSec=5
StandardOutput=append:${def.logFile}
StandardError=append:${def.logFile}

[Install]
WantedBy=default.target
`;
}
