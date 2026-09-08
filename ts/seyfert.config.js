const { config } = require('seyfert');
const fs = require('node:fs');
const path = require('node:path');

// Safe, zero-dependency .env loader that checks multiple locations
function loadEnv() {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '..', '.env'),
    path.resolve(__dirname, '.env'),
    path.resolve(__dirname, '..', '.env'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      try {
        const content = fs.readFileSync(candidate, 'utf8');
        for (const line of content.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx !== -1) {
            const key = trimmed.slice(0, eqIdx).trim();
            let val = trimmed.slice(eqIdx + 1).trim();
            if (
              (val.startsWith('"') && val.endsWith('"')) ||
              (val.startsWith("'") && val.endsWith("'"))
            ) {
              val = val.slice(1, -1);
            }
            if (!process.env[key] && val.length > 0) {
              process.env[key] = val;
            }
          }
        }
        break;
      } catch {}
    }
  }
}

loadEnv();

module.exports = config.bot({
  token: process.env.DISCORD_TOKEN ?? "",
  intents: ["Guilds", "GuildMessages", "MessageContent", "GuildVoiceStates"],
  locations: {
    base: "src",
    output: "dist",
    commands: "commands",
    events: "events",
    components: "components"
  }
});
