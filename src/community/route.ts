/**
 * Community hub locations and their URLs, so pages can be linked, shared and
 * bookmarked: /community, /community/forums/strategy, /community/forums/strategy/42.
 * The host serves the app for every /community path (vercel.json).
 */

export type CommunityRoute =
  | { page: "home" }
  | { page: "forums" }
  | { page: "forum"; slug: string; p: number }
  | { page: "thread"; slug: string; id: number; p: number }
  | { page: "compose"; slug: string }
  | { page: "rankings" }
  | { page: "players" };

const SLUG = /^[a-z0-9-]{1,40}$/;

/** The route for a path, or null when the path is not in the hub. */
export function parseCommunityPath(pathname: string, search = ""): CommunityRoute | null {
  const parts = pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  if (parts[0] !== "community") return null;
  const p = Math.max(1, Number(new URLSearchParams(search).get("page")) || 1);
  const [, section, slug, id] = parts;
  if (!section) return { page: "home" };
  if (section === "rankings") return { page: "rankings" };
  if (section === "players") return { page: "players" };
  if (section === "forums") {
    if (!slug) return { page: "forums" };
    if (!SLUG.test(slug)) return { page: "forums" };
    if (id === "new") return { page: "compose", slug };
    const n = Number(id);
    if (id && Number.isInteger(n) && n > 0) return { page: "thread", slug, id: n, p };
    return { page: "forum", slug, p };
  }
  return { page: "home" };
}

export function communityPath(route: CommunityRoute): string {
  const page = (p: number) => (p > 1 ? `?page=${p}` : "");
  switch (route.page) {
    case "home": return "/community";
    case "forums": return "/community/forums";
    case "forum": return `/community/forums/${route.slug}${page(route.p)}`;
    case "thread": return `/community/forums/${route.slug}/${route.id}${page(route.p)}`;
    case "compose": return `/community/forums/${route.slug}/new`;
    case "rankings": return "/community/rankings";
    case "players": return "/community/players";
  }
}
