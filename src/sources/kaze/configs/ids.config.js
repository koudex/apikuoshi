/*
 * ======= • ======= • ======= • ======= • =======• =======
 * APIKuoshi — internal lane module
 *
 *
 * @description
 *   Mapping configuration for anime metadata IDs used by the AniKoto
 *   site's filtering system. Contains human-readable slugs mapped
 *   to the values the site's /filter form actually submits.
 *
 *   IMPORTANT (v2.1 fix): Previous versions mapped slugs to NUMERIC
 *   IDs for type/status/rating/source/season/sort. Live probing of
 *   the upstream filter form showed the site expects:
 *     - genre[]    → numeric IDs (1, 2, 3, ...)
 *     - term_type[]→ UPPERCASE string names ("TV", "Movie", "ONA", ...)
 *     - status[]   → slug strings ("currently-airing", "finished-airing", "not-yet-aired")
 *     - rating[]   → UPPERCASE codes ("G", "PG", "PG-13", "R", "R+", "Rx")
 *     - source[]   → underscore slug strings ("manga", "light_novel", ...)
 *     - season[]   → lowercase strings ("spring", "summer", "fall", "winter")
 *     - sort       → slug strings ("default", "score", "name-az", ...)
 *   The mappings below now produce those exact values.
 *
 * @exports
 *   GENRE_IDS, TYPE_IDS, STATUS_IDS, RATING_IDS, SORT_IDS, SOURCE_IDS, SEASON_IDS
 *
 * @author  Shinei Nouzen
 * @license MIT
 * ======= • ======= • ======= • ======= • =======• =======
 */

// ══════════════════════════════════════════════════════════════
// GENRE ID MAPPING (numeric IDs — site expects numbers here)
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Genre slug to numeric ID mapping ----
/**
 * Maps human-readable genre slugs to their corresponding numeric IDs
 * used in AniKoto's filtering system. Contains 52 different anime genres
 * scraped directly from the live /filter page's checkbox list.
 *
 * @type {Object}
 * @example
 *   GENRE_IDS["action"]   // "1"
 *   GENRE_IDS["comedy"]   // "8"
 *   GENRE_IDS["sci-fi"]   // "12"
 */
const GENRE_IDS = {
  "action": "1",
  "action-and-adventure": "2344",
  "adventure": "2",
  "animation": "2345",
  "award-winning": "2357",
  "boys-love": "2330",
  "cars": "538",
  "comedy": "8",
  "dementia": "453",
  "demons": "119",
  "drama": "62",
  "ecchi": "214",
  "erotica": "2322",
  "fantasy": "3",
  "game": "180",
  "girls-love": "2328",
  "gourmet": "2326",
  "harem": "215",
  "historical": "70",
  "horror": "222",
  "isekai": "74",
  "josei": "404",
  "kids": "46",
  "magic": "203",
  "mahou-shoujo": "2310",
  "martial-arts": "114",
  "mecha": "123",
  "military": "125",
  "music": "242",
  "mystery": "57",
  "parody": "162",
  "police": "136",
  "psychological": "73",
  "romance": "28",
  "samurai": "163",
  "school": "14",
  "sci-fi": "12",
  "sci-fi-and-fantasy": "2352",
  "seinen": "50",
  "shoujo": "252",
  "shoujo-ai": "235",
  "shounen": "15",
  "shounen-ai": "233",
  "slice-of-life": "35",
  "space": "124",
  "sports": "29",
  "super-power": "16",
  "supernatural": "9",
  "suspense": "2316",
  "thriller": "54",
  "unknown": "32",
  "vampire": "58"
};

// ══════════════════════════════════════════════════════════════
// ANIME TYPE ID MAPPING (UPPERCASE strings — site expects "TV", "Movie", etc.)
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Anime type slug to site value mapping ----
/**
 * Maps anime type slugs to the values AniKoto's /filter form submits
 * for the `term_type[]` parameter. The site expects UPPERCASE string
 * names (not numeric IDs), e.g. "TV", "Movie", "ONA".
 *
 * Accepts lowercase/normalized input from API consumers and emits
 * the canonical case-sensitive value the upstream form expects.
 *
 * @type {Object}
 * @example
 *   TYPE_IDS["tv"]     // "TV"
 *   TYPE_IDS["movie"]  // "Movie"
 *   TYPE_IDS["ova"]    // "OVA"
 */
const TYPE_IDS = {
  "movie": "Movie",
  "music": "Music",
  "ona": "ONA",
  "ova": "OVA",
  "special": "Special",
  "tv": "TV",
  "tv-short": "TV_SHORT",
  "tv_short": "TV_SHORT",
  "tv-special": "TV Special",
  "tv_special": "TV Special"
};

// ══════════════════════════════════════════════════════════════
// AIRING STATUS ID MAPPING (slug strings — site expects "currently-airing", etc.)
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Airing status slug to site value mapping ----
/**
 * Maps anime airing status slugs to the values AniKoto's /filter form
 * submits for the `status[]` parameter. The site expects full slug
 * strings (not numeric IDs), e.g. "currently-airing", "finished-airing".
 *
 * Also accepts common short forms (airing, completed, ongoing, upcoming,
 * finished) and normalizes them to the canonical slug.
 *
 * @type {Object}
 * @example
 *   STATUS_IDS["airing"]              // "currently-airing"
 *   STATUS_IDS["currently-airing"]    // "currently-airing"
 *   STATUS_IDS["completed"]           // "finished-airing"
 *   STATUS_IDS["upcoming"]            // "not-yet-aired"
 */
const STATUS_IDS = {
  "currently-airing": "currently-airing",
  "airing": "currently-airing",
  "ongoing": "currently-airing",
  "finished-airing": "finished-airing",
  "completed": "finished-airing",
  "finished": "finished-airing",
  "not-yet-aired": "not-yet-aired",
  "upcoming": "not-yet-aired"
};

// ══════════════════════════════════════════════════════════════
// AGE RATING ID MAPPING (UPPERCASE codes — site expects "G", "PG-13", etc.)
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Age rating slug to site value mapping ----
/**
 * Maps age rating slugs to the values AniKoto's /filter form submits
 * for the `rating[]` parameter. The site expects UPPERCASE rating codes
 * (not numeric IDs), e.g. "G", "PG", "PG-13", "R", "R+", "Rx".
 *
 * @type {Object}
 * @example
 *   RATING_IDS["pg-13"]  // "PG-13"
 *   RATING_IDS["r"]      // "R"
 */
const RATING_IDS = {
  "g": "G",
  "pg": "PG",
  "pg-13": "PG-13",
  "r": "R",
  "r+": "R+",
  "rx": "Rx"
};

// ══════════════════════════════════════════════════════════════
// SORT ORDER ID MAPPING (slug strings — site expects "score", "name-az", etc.)
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Sort order slug to query parameter mapping ----
/**
 * Maps sort order slugs to the values AniKoto's /filter form submits
 * for the `sort` parameter. The site expects slug strings (not numeric IDs),
 * e.g. "default", "score", "name-az".
 *
 * @type {Object}
 * @example
 *   SORT_IDS["score"]     // "score"
 *   SORT_IDS["name-az"]   // "name-az"
 */
const SORT_IDS = {
  "default": "default",
  "latest-updated": "latest-updated",
  "latest-added": "latest-added",
  "score": "score",
  "name-az": "name-az",
  "release-date": "release-date",
  "most-viewed": "most-viewed",
  "number_of_episodes": "number_of_episodes",
  "number-of-episodes": "number_of_episodes"
};

// ══════════════════════════════════════════════════════════════
// SOURCE TYPE ID MAPPING (underscore slugs — site expects "manga", "light_novel", etc.)
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Source type slug to site value mapping ----
/**
 * Maps anime source type slugs to the values AniKoto's /filter form
 * submits for the `source[]` parameter. The site expects underscore-separated
 * slug strings (not numeric IDs), e.g. "manga", "light_novel", "video_game".
 *
 * Accepts both dash-separated and underscore-separated input for ergonomics.
 *
 * @type {Object}
 * @example
 *   SOURCE_IDS["manga"]         // "manga"
 *   SOURCE_IDS["light-novel"]   // "light_novel"
 *   SOURCE_IDS["video-game"]    // "video_game"
 */
const SOURCE_IDS = {
  "4-koma-manga": "4-koma_manga",
  "4-koma_manga": "4-koma_manga",
  "book": "book",
  "card-game": "card_game",
  "card_game": "card_game",
  "game": "game",
  "light-novel": "light_novel",
  "light_novel": "light_novel",
  "manga": "manga",
  "mixed-media": "mixed_media",
  "mixed_media": "mixed_media",
  "music": "music",
  "novel": "novel",
  "original": "original",
  "other": "other",
  "picture-book": "picture_book",
  "picture_book": "picture_book",
  "radio": "radio",
  "unknown": "unknown",
  "video-game": "video_game",
  "video_game": "video_game",
  "visual-novel": "visual_novel",
  "visual_novel": "visual_novel",
  "web-manga": "web_manga",
  "web_manga": "web_manga",
  "web-novel": "web_novel",
  "web_novel": "web_novel"
};

// ══════════════════════════════════════════════════════════════
// SEASON ID MAPPING (lowercase strings — site expects "spring", "summer", etc.)
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Season slug to site value mapping ----
/**
 * Maps anime season slugs to the values AniKoto's /filter form submits
 * for the `season[]` parameter. The site expects lowercase slug strings
 * (not numeric IDs), e.g. "spring", "summer", "fall", "winter".
 *
 * @type {Object}
 * @example
 *   SEASON_IDS["spring"]  // "spring"
 *   SEASON_IDS["autumn"]  // "fall" (alias)
 */
const SEASON_IDS = {
  "spring": "spring",
  "summer": "summer",
  "fall": "fall",
  "autumn": "fall",
  "winter": "winter"
};

// ══════════════════════════════════════════════════════════════
// TV-SPECIFIC TYPE IDS
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Extended type slug to site value mapping ----
/**
 * Extended type mappings including TV-specific formats.
 *
 * @type {Object}
 */
const EXTENDED_TYPE_IDS = {
  ...TYPE_IDS,
  "tv-short": "TV_SHORT",
  "tv-special": "TV Special"
};

export { GENRE_IDS, TYPE_IDS, STATUS_IDS, RATING_IDS, SORT_IDS, SOURCE_IDS, SEASON_IDS, EXTENDED_TYPE_IDS };
// ══════════════════════════════════════════════════════════════ END: ids.config.js
