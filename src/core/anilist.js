/**
 * ============================================================
 *  APIKuoshi — src/core/anilist.js
 * ============================================================
 *  Canonical anime identity via AniList GraphQL (free, keyless).
 *  Used ONLY by the unified layer to anchor romaji/English titles
 *  to one canonical entry so dedup is reliable.
 *  ============================================================
 */
import axios from "axios";
import { withCache } from "./cache.js";

const CLIENT = axios.create({
  baseURL: "https://graphql.anilist.co",
  timeout: 12000,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
    "User-Agent": "APIKuoshi/1.0 (+unified dedup layer)",
  },
});

const SEARCH_QUERY = `
query ($search: String, $perPage: Int) {
  Page(page: 1, perPage: $perPage) {
    media(search: $search, type: ANIME, sort: SEARCH_MATCH, isAdult: false) {
      id
      idMal
      title { romaji english native }
      synonyms
      episodes
      format
      status
      seasonYear
      coverImage { large medium }
      bannerImage
    }
  }
}`;

const BY_ID_QUERY = `
query ($id: Int) {
  Media(id: $id, type: ANIME) {
    id
    idMal
    title { romaji english native }
    synonyms
    episodes
    format
    status
    seasonYear
    coverImage { large medium }
    bannerImage
  }
}`;

const SEASON_QUERY = `
query ($season: MediaSeason, $year: Int) {
  Page(page: 1, perPage: 30) {
    media(season: $season, seasonYear: $year, type: ANIME, sort: POPULARITY_DESC, isAdult: false) {
      id
      idMal
      title { romaji english native }
      episodes
      format
      status
      seasonYear
      coverImage { large medium }
    }
  }
}`;

const DETAIL_QUERY = `
query ($id: Int) {
  Media(id: $id, type: ANIME) {
    id
    idMal
    title { romaji english native }
    synonyms
    episodes
    duration
    format
    status
    season
    seasonYear
    averageScore
    meanScore
    popularity
    favourites
    genres
    description(asHtml: false)
    coverImage { large medium }
    bannerImage
    studios(isMain: true) { nodes { name } }
    trailer { id site }
    externalLinks { site url }
    nextAiringEpisode { episode airingAt timeUntilAiring }
  }
}`;

const CHARACTERS_QUERY = `
query ($id: Int, $perPage: Int) {
  Media(id: $id, type: ANIME) {
    characters(perPage: $perPage, sort: [ROLE, RELEVANCE]) {
      edges {
        role
        node { id name { full } image { large } }
        voiceActors(language: JAPANESE) { id name { full } image { large } }
      }
    }
  }
}`;

const RECOMMENDATIONS_QUERY = `
query ($id: Int, $perPage: Int) {
  Media(id: $id, type: ANIME) {
    recommendations(perPage: $perPage, sort: RATING_DESC) {
      nodes {
        rating
        mediaRecommendation {
          id
          idMal
          title { romaji english }
          coverImage { large }
          format
          episodes
          averageScore
        }
      }
    }
  }
}`;

function shapeMedia(m) {
  if (!m) return null;
  return {
    anilistId: m.id,
    malId: m.idMal ?? null,
    title: m.title?.english || m.title?.romaji || null,
    titleRomaji: m.title?.romaji || null,
    titleEnglish: m.title?.english || null,
    titleNative: m.title?.native || null,
    synonyms: m.synonyms || [],
    episodes: m.episodes ?? null,
    format: m.format || null,
    status: m.status || null,
    year: m.seasonYear ?? null,
    poster: m.coverImage?.large || m.coverImage?.medium || null,
    banner: m.bannerImage || null,
  };
}

/** Search AniList for canonical matches (24h cache). */
export async function anilistSearch(query, perPage = 8) {
  if (!query) return [];
  return withCache(`al:search:${query.toLowerCase()}:${perPage}`, 86400, async () => {
    try {
      const res = await CLIENT.post("", {
        query: SEARCH_QUERY,
        variables: { search: query, perPage },
      });
      const list = res.data?.data?.Page?.media ?? [];
      return list.map(shapeMedia).filter(Boolean);
    } catch (err) {
      console.error("[APIKUOSHI][anilist] search failed:", err.message);
      return [];
    }
  });
}

/** Fetch one canonical entry by AniList id (24h cache). */
export async function anilistById(anilistId) {
  return withCache(`al:id:${anilistId}`, 86400, async () => {
    try {
      const res = await CLIENT.post("", {
        query: BY_ID_QUERY,
        variables: { id: parseInt(anilistId, 10) },
      });
      return shapeMedia(res.data?.data?.Media);
    } catch (err) {
      console.error("[APIKUOSHI][anilist] byId failed:", err.message);
      return null;
    }
  });
}

/** Currently airing this season (1h cache) — used by /api/airing. */
export async function anilistAiringSeason() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const season =
    month <= 3 ? "WINTER" : month <= 6 ? "SPRING" : month <= 9 ? "SUMMER" : "FALL";
  const year = now.getFullYear();
  return withCache(`al:season:${season}:${year}`, 3600, async () => {
    try {
      const res = await CLIENT.post("", {
        query: SEASON_QUERY,
        variables: { season, year },
      });
      const list = res.data?.data?.Page?.media ?? [];
      return list.map(shapeMedia).filter(Boolean);
    } catch (err) {
      console.error("[APIKUOSHI][anilist] season failed:", err.message);
      return [];
    }
  });
}

/**
 * Rich canonical metadata, straight from AniList.
 * Used by GET /api/meta — the
 * unified surface without touching its engine files.
 */
export async function anilistDetail(anilistId) {
  return withCache(`al:detail:${anilistId}`, 21600, async () => {
    try {
      const res = await CLIENT.post("", {
        query: DETAIL_QUERY,
        variables: { id: parseInt(anilistId, 10) },
      });
      const m = res.data?.data?.Media;
      if (!m) return null;
      return {
        ...shapeMedia(m),
        season: m.season || null,
        duration: m.duration ?? null,
        averageScore: m.averageScore ?? null,
        meanScore: m.meanScore ?? null,
        popularity: m.popularity ?? null,
        favourites: m.favourites ?? null,
        genres: m.genres || [],
        synopsis: m.description || null,
        studios: (m.studios?.nodes || []).map((s) => s.name),
        trailer: m.trailer ? { id: m.trailer.id, site: m.trailer.site } : null,
        externalLinks: m.externalLinks || [],
        nextAiringEpisode: m.nextAiringEpisode
          ? {
              episode: m.nextAiringEpisode.episode,
              airingAt: m.nextAiringEpisode.airingAt,
              countdownSeconds: m.nextAiringEpisode.timeUntilAiring,
            }
          : null,
      };
    } catch (err) {
      console.error("[APIKUOSHI][anilist] detail failed:", err.message);
      return null;
    }
  });
}

/** Characters + JP voice actors (6h cache). Used by GET /api/meta/characters. */
export async function anilistCharacters(anilistId, perPage = 24) {
  return withCache(`al:chars:${anilistId}:${perPage}`, 21600, async () => {
    try {
      const res = await CLIENT.post("", {
        query: CHARACTERS_QUERY,
        variables: { id: parseInt(anilistId, 10), perPage },
      });
      const edges = res.data?.data?.Media?.characters?.edges ?? [];
      return edges.map((e) => ({
        role: e.role || null,
        character: {
          id: e.node?.id ?? null,
          name: e.node?.name?.full || null,
          image: e.node?.image?.large || null,
        },
        voiceActor: e.voiceActors?.[0]
          ? { id: e.voiceActors[0].id, name: e.voiceActors[0].name?.full, image: e.voiceActors[0].image?.large }
          : null,
      }));
    } catch (err) {
      console.error("[APIKUOSHI][anilist] characters failed:", err.message);
      return [];
    }
  });
}

/** Top recommendations (6h cache). Used by GET /api/meta/recommendations. */
export async function anilistRecommendations(anilistId, perPage = 12) {
  return withCache(`al:recs:${anilistId}:${perPage}`, 21600, async () => {
    try {
      const res = await CLIENT.post("", {
        query: RECOMMENDATIONS_QUERY,
        variables: { id: parseInt(anilistId, 10), perPage },
      });
      const nodes = res.data?.data?.Media?.recommendations?.nodes ?? [];
      return nodes
        .filter((n) => n.mediaRecommendation)
        .map((n) => ({
          rating: n.rating ?? null,
          anilistId: n.mediaRecommendation.id,
          malId: n.mediaRecommendation.idMal ?? null,
          title: n.mediaRecommendation.title?.english || n.mediaRecommendation.title?.romaji || null,
          titleRomaji: n.mediaRecommendation.title?.romaji || null,
          poster: n.mediaRecommendation.coverImage?.large || null,
          format: n.mediaRecommendation.format || null,
          episodes: n.mediaRecommendation.episodes ?? null,
          averageScore: n.mediaRecommendation.averageScore ?? null,
        }));
    } catch (err) {
      console.error("[APIKUOSHI][anilist] recommendations failed:", err.message);
      return [];
    }
  });
}

/** Seasonal anime grid. Used by GET /api/meta/season?season=&year=. */
const SEASON_PAGED_QUERY = `
query ($season: MediaSeason, $year: Int, $page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { total currentPage lastPage hasNextPage }
    media(season: $season, seasonYear: $year, type: ANIME, sort: POPULARITY_DESC, isAdult: false) {
      id
      idMal
      title { romaji english native }
      synonyms
      episodes
      format
      status
      seasonYear
      coverImage { large medium }
    }
  }
}`;

export async function anilistSeason(season, year, page = 1) {
  const perPage = 30;
  return withCache(`al:season:${season}:${year}:${page}`, 10800, async () => {
    try {
      const res = await CLIENT.post("", {
        query: SEASON_PAGED_QUERY,
        variables: { season, year, page, perPage },
      });
      const pg = res.data?.data?.Page;
      const list = pg?.media ?? [];
      return {
        pageInfo: pg?.pageInfo || null,
        results: list.map(shapeMedia).filter(Boolean),
      };
    } catch (err) {
      console.error("[APIKUOSHI][anilist] season failed:", err.message);
      return { pageInfo: null, results: [] };
    }
  });
}
