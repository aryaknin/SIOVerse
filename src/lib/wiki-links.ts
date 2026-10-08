export type ArticleLinkTarget = { id: string; title: string };
export type WikiLinkToken = { kind: "text" | "article" | "missing"; text: string; articleId?: string; targetTitle?: string };

function wordCharacter(character: string | undefined) {
  return Boolean(character && /[\p{L}\p{N}]/u.test(character));
}

function candidates(articles: ArticleLinkTarget[], currentId?: string) {
  const full = articles.filter((item) => item.id !== currentId && item.title.trim()).map((article) => ({ article, label: article.title }));
  const fullLabels = new Set(full.map((item) => item.label.toLocaleLowerCase("fr")));
  const aliases = articles.filter((item) => item.id !== currentId).flatMap((article) => {
    const short = article.title.split(" — ")[0].trim();
    return short !== article.title && short.length >= 3 && !fullLabels.has(short.toLocaleLowerCase("fr")) ? [{ article, label: short }] : [];
  });
  const counts = new Map<string, number>();
  for (const item of aliases) counts.set(item.label.toLocaleLowerCase("fr"), (counts.get(item.label.toLocaleLowerCase("fr")) ?? 0) + 1);
  return [...full, ...aliases.filter((item) => counts.get(item.label.toLocaleLowerCase("fr")) === 1)].sort((a, b) => b.label.length - a.label.length);
}

function linkPlainText(text: string, articles: ArticleLinkTarget[], currentId?: string): WikiLinkToken[] {
  const targets = candidates(articles, currentId);
  const lower = text.toLocaleLowerCase("fr");
  const output: WikiLinkToken[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    let found: { article: ArticleLinkTarget; label: string; index: number } | null = null;
    for (const candidate of targets) {
      const needle = candidate.label.toLocaleLowerCase("fr");
      let index = lower.indexOf(needle, cursor);
      while (index >= 0 && (wordCharacter(text[index - 1]) || wordCharacter(text[index + needle.length]))) index = lower.indexOf(needle, index + 1);
      if (index >= 0 && (!found || index < found.index || (index === found.index && candidate.label.length > found.label.length))) found = { ...candidate, index };
    }
    if (!found) { output.push({ kind: "text", text: text.slice(cursor) }); break; }
    if (found.index > cursor) output.push({ kind: "text", text: text.slice(cursor, found.index) });
    output.push({ kind: "article", text: text.slice(found.index, found.index + found.label.length), articleId: found.article.id });
    cursor = found.index + found.label.length;
  }
  return output;
}

export function tokenizeWikiLinks(text: string, articles: ArticleLinkTarget[], currentId?: string): WikiLinkToken[] {
  const output: WikiLinkToken[] = [];
  const pattern = /\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/g;
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) output.push(...linkPlainText(text.slice(cursor, index), articles, currentId));
    const target = candidates(articles).find((item) => item.label.toLocaleLowerCase("fr") === match[1].trim().toLocaleLowerCase("fr"))?.article;
    output.push(target ? { kind: "article", text: match[2]?.trim() || target.title, articleId: target.id } : { kind: "missing", text: match[2]?.trim() || match[1].trim(), targetTitle: match[1].trim() });
    cursor = index + match[0].length;
  }
  if (cursor < text.length) output.push(...linkPlainText(text.slice(cursor), articles, currentId));
  return output;
}
