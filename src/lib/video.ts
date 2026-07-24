/**
 * Intégration YouTube de la fiche livre (onglet « La presse en parle ») —
 * transforme l'URL saisie dans /admin (watch, youtu.be, shorts, live ou déjà
 * embed) en URL d'intégration youtube-nocookie. `null` si l'URL n'est pas
 * une vidéo YouTube reconnue : la fiche n'affiche alors pas de vidéo plutôt
 * que d'intégrer une iframe cassée.
 */
export function youTubeEmbedUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m)\./, "");
  let id: string | null = null;
  if (host === "youtu.be") {
    id = url.pathname.split("/").filter(Boolean)[0] ?? null;
  } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const path = url.pathname.split("/").filter(Boolean);
    if (path[0] === "watch") {
      id = url.searchParams.get("v");
    } else if (["embed", "shorts", "live", "v"].includes(path[0] ?? "")) {
      id = path[1] ?? null;
    }
  }
  // Un id YouTube est un [A-Za-z0-9_-]{11} — tolérance sur la longueur au
  // cas où le format évoluerait, mais jamais de caractère hors alphabet
  // (l'id est interpolé dans un src d'iframe).
  if (!id || !/^[A-Za-z0-9_-]{6,20}$/.test(id)) return null;
  return `https://www.youtube-nocookie.com/embed/${id}`;
}
