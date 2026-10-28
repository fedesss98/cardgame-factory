import { blankTheme, type GameTheme } from "./theme.ts";

export type NewGameOptions = {
  title?: string;
  language?: string;
  theme?: GameTheme;
  resourceName?: string;
  resourceInitial?: number;
  chapterName?: string;
};

export type BlankProject = {
  game: any;
  images: Record<string, string>;
  starter: true;
};

const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

function text(value: string | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed || fallback;
}

export function createBlankProject(
  options: NewGameOptions & { artwork: string },
): BlankProject {
  const title = text(options.title, "Untitled story");
  const chapterName = text(options.chapterName, "Chapter one");
  const resourceName = text(options.resourceName, "Resolve");
  const resourceInitial = Math.max(
    0,
    Math.min(100, Math.round(options.resourceInitial ?? 50)),
  );
  const theme = structuredClone(options.theme ?? blankTheme());

  const gameId = id("game");
  const assetId = id("art");
  const statId = id("stat");
  const cardId = id("card");
  const deckId = id("deck");
  const chapterId = id("chapter");
  const endingId = id("ending");

  return {
    starter: true,
    images: { [assetId]: options.artwork },
    game: {
      schemaVersion: "1.0.0",
      id: gameId,
      title,
      contentVersion: 1,
      saveCompatibilityVersion: 1,
      language: options.language || "en",
      theme,
      assets: [
        {
          id: assetId,
          kind: "image",
          path: "assets/placeholder.png",
          credit: "Neutral placeholder created for this project",
          license: "Project-owned placeholder",
        },
      ],
      stats: [
        {
          id: statId,
          name: resourceName,
          min: 0,
          max: 100,
          initial: resourceInitial,
        },
      ],
      flags: [],
      cards: [
        {
          id: cardId,
          character: "Narrator",
          text: "This is your opening scene. Replace it with the first decision your player will face.",
          imageAssetId: assetId,
          imageAlt: "Neutral placeholder artwork",
          repeat: "oncePerRun",
          left: { label: "First choice", effects: [] },
          right: { label: "Second choice", effects: [] },
        },
      ],
      decks: [
        {
          id: deckId,
          name: "Main deck",
          mode: "ordered",
          cards: [{ cardId, weight: 1 }],
        },
      ],
      chapters: [
        {
          id: chapterId,
          name: chapterName,
          onEnter: [],
          decks: [{ deckId, weight: 1 }],
          transitions: [],
        },
      ],
      endings: [
        {
          id: endingId,
          title: "The end",
          text: "This story ends here. Replace this ending with your own.",
          priority: 0,
        },
      ],
      startChapterId: chapterId,
      fallbackEndingId: endingId,
      android: {
        applicationId:
          "com.example.story" +
          crypto.randomUUID().replaceAll("-", "").slice(0, 12),
        displayName: title,
        versionName: "0.1.0",
        versionCode: 1,
      },
    },
  };
}
