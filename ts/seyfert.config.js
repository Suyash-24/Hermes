const { config } = require('seyfert');
require('dotenv').config({ path: '../.env' });

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
