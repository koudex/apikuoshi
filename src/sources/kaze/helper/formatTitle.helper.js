/*
 * ======= • ======= • ======= • ======= • =======• =======
 * APIKuoshi — internal lane module

 *
 * @description
 *   String utility function for normalizing anime titles into
 *   URL-safe slug format. Converts titles to lowercase, replaces
 *   special characters with hyphens, and trims leading/trailing dashes.
 *
 * @exports
 *   formatTitle
 *
 * @author  Shinei Nouzen
 * @license MIT
 * ======= • ======= • ======= • ======= • =======• =======
 */

// ══════════════════════════════════════════════════════════════
// TITLE FORMATTING UTILITY
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Convert title string to URL-safe slug format ----
/**
 * Formats an anime title into a URL-safe slug format.
 * - Converts to lowercase
 * - Replaces non-alphanumeric characters with hyphens
 * - Removes leading and trailing hyphens
 *
 * @param {string} title - The anime title to format
 * @returns {string} URL-safe slug version of the title
 *
 * @example
 *   // Basic title formatting
 *   formatTitle("One Piece") // "one-piece"
 *
 * @example
 *   // Title with special characters
 *   formatTitle(" Attack on Titan: The Final Season! ")
 *   // "attack-on-titan-the-final-season"
 *
 * @example
 *   // Edge cases
 *   formatTitle("") // ""
 *   formatTitle(null) // ""
 *   formatTitle("  ---  ") // ""
 *
 * @note
 *   This function preserves alphanumeric characters and replaces
 *   all other characters (spaces, punctuation, symbols) with hyphens.
 *   Multiple consecutive special characters become a single hyphen.
 */
const formatTitle = (title) => {
  if (!title) return "";
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

export { formatTitle };
// ══════════════════════════════════════════════════════════════ END: formatTitle.helper.js