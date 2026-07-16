/** Helpers for normalizing a person's name into URL fragments. */

export interface NameParts {
  first: string;
  last: string;
  /** Full name, single-spaced. */
  full: string;
}

/**
 * Split a free-form name into first/last. First token is the first name, last
 * token is the last name; anything in between (middle names) is ignored for
 * URL-building purposes. Robust to extra whitespace.
 */
export function parseName(raw: string): NameParts {
  const tokens = raw.trim().split(/\s+/).filter(Boolean);
  const full = tokens.join(" ");
  const first = tokens[0] ?? "";
  const last = tokens.length > 1 ? tokens[tokens.length - 1] : "";
  return { first, last, full };
}

/** Lowercased, hyphen-joined slug (e.g. "Jane Q Doe" -> "jane-q-doe"). */
export function slugifyName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Fill a broker search-URL template with a subject's name.
 * Supported tokens: {first} {last} {name} {slug}.
 */
export function fillSearchUrl(template: string, rawName: string): string {
  const { first, last, full } = parseName(rawName);
  return template
    .replaceAll("{first}", encodeURIComponent(first))
    .replaceAll("{last}", encodeURIComponent(last))
    .replaceAll("{name}", encodeURIComponent(full))
    .replaceAll("{slug}", slugifyName(rawName));
}
