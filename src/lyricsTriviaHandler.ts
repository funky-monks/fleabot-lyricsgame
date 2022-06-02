import { HexColorString, MessageEmbed, TextChannel } from "discord.js";
import { logger } from "./utils/logger";
import fs from "fs";
import { Client } from "genius-lyrics";
import { getRandomInt, nthOccurrence } from "./utils/utils";
import retry from "async-retry";

const WAIT_TIME_SECONDS = 15;

type SongDetailsWithSection = SongDetails & { section: string };

type SongTitleAndArtist = {
  songTitle: string;
  songArtist: string;
};

type ArtistIdAndName = {
  artistId: number;
  artistName: string;
};

type SongDetails = {
  lyrics: string;
  title: string;
  art: string;
  url: string;
  artist: string;
};

const config = JSON.parse(fs.readFileSync("./config.json", "utf8"));
logger.info(`Setting up genius with token ${config.geniusToken}`);
const geniusClient = new Client(config.geniusToken);

export const handleLyricsGame = async (
  channel: TextChannel,
  band: string
): Promise<void> => {
  logger.info(`Starting lyricsTrivia game with band ${band}`);
  await channel.sendTyping();
  const embedColor: HexColorString = `#${Math.floor(
    Math.random() * 16777215
  ).toString(16)}`;

  logger.info(`Message arguments: ${band}.`);

  if (!band) return;

  try {
    const songObject = await getRandomSongSectionByArtist(channel, band);
    if (!songObject) {
      await channel.send(
        "An error happened 😬 Please try again, it might work."
      );
      return;
    }

    try {
      const songEmbed = new MessageEmbed()
        .setColor(embedColor)
        .setTitle("Guess this song from " + songObject.artist)
        .setDescription(songObject.section)
        .setTimestamp()
        .setThumbnail(
          "https://ichef.bbci.co.uk/news/976/cpsprodpb/13F53/production/_83874718_thinkstockphotos-104548222.jpg"
        )
        .setFooter({
          text: `💿 Guess in ${WAIT_TIME_SECONDS} seconds`,
        });

      const songSecondEmbed = new MessageEmbed()
        .setColor(embedColor)
        .setTitle(songObject.title)
        .setTimestamp()
        .setImage(songObject.art)
        .setURL(songObject.url)
        .setFooter({
          text: "💿 - " + songObject.artist,
        });
      await channel.send({ embeds: [songEmbed] });
      setTimeout(() => {
        channel.send({
          embeds: [songSecondEmbed],
        });
      }, WAIT_TIME_SECONDS * 1000);
    } catch (error) {
      const songSecondEmbed = new MessageEmbed()
        .setColor(embedColor)
        .setDescription("An error happened 😬, try again!")
        .setTimestamp();

      await channel.send({ embeds: [songSecondEmbed] });
    }
  } catch (error) {
    logger.error(error);
    await channel.send("An error happened 😬 Please try again, it might work.");
  }
};

async function getArtistID(artist: string): Promise<ArtistIdAndName> {
  const searches = await geniusClient.songs.search(artist);
  if (searches.length === 0) {
    throw new Error(`No result found for artist ${artist}`);
  }
  const firstSong = searches[getRandomInt(1, 3)]; // max 10, coldplay returns coldplay and chainsmokers at 1 so we start at second entry.

  if (!firstSong?.artist) {
    throw new Error("No song or artist found");
  }

  return {
    artistId: firstSong.artist?.id,
    artistName: firstSong?.artist?.name,
  };
}

// Choose a song title from the most popular 50 songs from given ID
async function getSongNameAndTitle(
  artistObject: ArtistIdAndName
): Promise<SongTitleAndArtist> {
  const artist = await geniusClient.artists.get(artistObject.artistId);
  if (!artist) {
    throw new Error(`No artist found for id ${artistObject.artistId}`);
  }
  const totalPagesToLoad = 3;

  const foundSongs = [];

  for (let pageIndex = 1; pageIndex <= totalPagesToLoad; pageIndex++) {
    let popularSongs = await artist.songs({
      perPage: 50,
      sort: "popularity",
      page: pageIndex,
    });
    let filteredByArtist = popularSongs.filter(
      (song: any) =>
        song.artist.name.toLowerCase() === artistObject.artistName.toLowerCase()
    );
    foundSongs.push(...filteredByArtist);
    if (foundSongs.length >= 51) {
      break;
    }
  }

  if (foundSongs.length === 0) {
    throw new Error(`No songs found for id ${artistObject.artistId}`);
  }

  const randomNumb = await getRandomInt(0, foundSongs.length);
  return {
    songTitle: foundSongs[randomNumb].title,
    songArtist: foundSongs[randomNumb].artist.name,
  };
}

async function getSongObject(sa: SongTitleAndArtist): Promise<SongDetails> {
  logger.info("Making search request to genius API");
  const searches = await geniusClient.songs.search(
    geniusClient.songs.sanitizeQuery(sa.songTitle + " " + sa.songArtist)
  );

  if (!searches || searches.length === 0) {
    throw new Error(
      `No result found for artist ${sa.songArtist} and title ${sa.songTitle}`
    );
  }

  // Pick first one
  const chosenSong = searches[0];

  logger.info("Making lyrics request to genius API");
  const songLyrics = await chosenSong.lyrics();
  const songTitle = chosenSong.title;
  const songArt = chosenSong.thumbnail;
  const songUrl = chosenSong.url;
  return {
    lyrics: songLyrics,
    title: songTitle,
    art: songArt,
    url: songUrl,
    artist: sa.songArtist,
  };
}

function getSectionFromSongObject(songObject: SongDetails): string {
  // purifies lyrics string a bit
  try {
    songObject.lyrics = songObject.lyrics.replace("]\n\n[", "");
    songObject.lyrics = songObject.lyrics.replace("Embed", "");
  } catch (error) {}

  // counts how many sections in the song with lyrics are there
  const count = (songObject.lyrics.match(/]\n/g) || []).length;

  const randomSectionNumber = getRandomInt(0, count);

  // locates and slices section
  const position1 =
    nthOccurrence(songObject.lyrics, "]\n", randomSectionNumber) + 1; // Plus one is needed to delete ']' character
  const position2 = nthOccurrence(
    songObject.lyrics,
    "\n[",
    randomSectionNumber
  );

  return songObject.lyrics.slice(position1, position2);
}

async function generateLyricsSectionForMessage(
  channel: TextChannel,
  messageContent: string
) {
  try {
    await channel.sendTyping();
    logger.info(`Retrieving random song for message ${messageContent}`);
    const artistId = await getArtistID(messageContent);
    logger.info(
      `Artist ID for message ${messageContent} is ${artistId.artistId}`
    );
    const songChosen = await getSongNameAndTitle(artistId);
    logger.info(
      `Song title found for artist id ${artistId.artistId}: ${songChosen.songTitle}`
    );
    const songObject = await getSongObject(songChosen);
    logger.info(`Retrieving section from song ${songChosen.songTitle}`);
    let section = getSectionFromSongObject(songObject);
    if (!section) {
      throw new Error(
        `Did not retrieve section for song ${songChosen.songTitle}`
      );
    }
    return {
      ...songObject,
      section,
    };
  } catch (e) {
    logger.error("Failed to load song section", e);
    throw e;
  }
}

async function loadThree(channel: TextChannel, messageContent: string) {
  const ps: Promise<SongDetailsWithSection | null>[] = [];
  for (let i = 0; i < 3; i++) {
    ps.push(generateLyricsSectionForMessage(channel, messageContent));
  }

  const settled: PromiseSettledResult<SongDetailsWithSection | null>[] =
    await Promise.allSettled(ps);

  const fulfilled: PromiseFulfilledResult<SongDetailsWithSection>[] =
    settled.filter(
      (r) => r.status === "fulfilled"
    ) as PromiseFulfilledResult<SongDetailsWithSection>[];
  if (fulfilled.length > 0) {
    return fulfilled[0].value;
  } else {
    throw new Error("No valid result");
  }
}

async function getRandomSongSectionByArtist(
  channel: TextChannel,
  messageContent: string
): Promise<SongDetailsWithSection | null> {
  logger.info(`Getting random song for message ${messageContent}`);
  return retry(async () => await loadThree(channel, messageContent), {
    retries: 5,
    minTimeout: 0,
    factor: 1,
  });
}
