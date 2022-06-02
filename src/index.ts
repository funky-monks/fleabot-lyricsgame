import { loadConfig } from "./utils/configLoader";

import { REST } from "@discordjs/rest";

import { Routes } from "discord-api-types/v9";
import { logger } from "./utils/logger";
import { SlashCommandBuilder } from "@discordjs/builders";
import { Client, Intents, TextChannel } from "discord.js";
import { handleLyricsGame } from "./lyricsTriviaHandler";
import {channel} from "diagnostics_channel";

const BAND_OPTION_KEY = "band";
const lyricsCommand: Omit<
  SlashCommandBuilder,
  "addSubcommand" | "addSubcommandGroup"
> = new SlashCommandBuilder()
  .setName("lyricsgame")
  .setDescription("Start a new lyrics game")
  .addStringOption((option) =>
    option
      .setName(BAND_OPTION_KEY)
      .setDescription("The band to retrieve lyrics for")
      .setRequired(true)
  );

const commands = [lyricsCommand.toJSON()];

(async () => {
  try {
    const config = loadConfig();
    const rest = new REST({ version: "9" }).setToken(config.token);

    logger.info("Started refreshing application (/) commands.");
    await rest.put(Routes.applicationCommands(config.clientId), {
      body: commands,
    });
    logger.info("Successfully reloaded application (/) commands.");
    const client = new Client({
      intents: [
        Intents.FLAGS.GUILD_MESSAGES,
        Intents.FLAGS.GUILD_MESSAGE_TYPING,
      ],
    });

    client.on("ready", () => {
      logger.info("Client ready");
    });

    client.on("interactionCreate", async (interaction) => {
      if (!interaction.isCommand()) return;
      if (interaction.commandName === lyricsCommand.name) {
        const band = interaction.options.getString(BAND_OPTION_KEY, true);
        const channelId = interaction.channelId;
        logger.info(`Using channel with id ${channelId}`)
        const channel = (await client.channels.fetch(channelId)) as TextChannel;
        logger.info(`Loaded channel with id ${channel.id}`)
        await interaction.reply({
          content: `Starting lyrics game for band ${band}. Please wait while I fetch lyrics...`,
        })
        await handleLyricsGame(channel, band);
      }
    });
    await client.login(config.token);
  } catch (error) {
    logger.error(error);
  }
})();
