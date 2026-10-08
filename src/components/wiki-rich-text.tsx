import type { ReactNode } from "react";
import type { ArticleLinkTarget } from "@/lib/wiki-links";
import { tokenizeWikiLinks } from "@/lib/wiki-links";

type Props = { text: string; articles: ArticleLinkTarget[]; currentId?: string; onNavigate?: (id: string) => void; onCreate?: (title: string) => void };

function linked(text: string, props: Props): ReactNode[] {
  return tokenizeWikiLinks(text, props.articles, props.currentId).map((token, index) => {
    if (token.kind === "article" && token.articleId) return <a key={index} className="wiki-internal-link" href={"/sioverse/lore?article=" + token.articleId} onClick={props.onNavigate ? (event) => { event.preventDefault(); props.onNavigate?.(token.articleId!); } : undefined}>{token.text}</a>;
    if (token.kind === "missing") return props.onCreate ? <button type="button" key={index} className="wiki-redlink" title="Créer cet article" onClick={() => props.onCreate?.(token.targetTitle ?? token.text)}>{token.text}</button> : <span key={index} className="wiki-redlink">{token.text}</span>;
    return token.text;
  });
}

function inlineText(text: string, props: Props): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\(https?:\/\/[^)]+\))/g).flatMap((piece, index) => {
    if (piece.startsWith("**") && piece.endsWith("**")) return <strong key={index}>{linked(piece.slice(2, -2), props)}</strong>;
    if (piece.startsWith("*") && piece.endsWith("*")) return <em key={index}>{linked(piece.slice(1, -1), props)}</em>;
    const link = /^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/.exec(piece);
    if (link) return <a key={index} href={link[2]} target="_blank" rel="noreferrer">{link[1]} ↗</a>;
    return linked(piece, props);
  });
}

export function WikiRichText(props: Props) {
  const blocks = props.text.trim().split(/\n\s*\n/).filter(Boolean);
  if (!blocks.length) return <p className="wiki-empty-text">Cette partie n’a pas encore de contenu. Tu peux l’enrichir.</p>;
  return <div className="wiki-prose">{blocks.map((block, index) => {
    const lines = block.split("\n");
    if (lines.every((line) => /^[-•] /.test(line))) return <ul key={index}>{lines.map((line, lineIndex) => <li key={lineIndex}>{inlineText(line.replace(/^[-•] /, ""), props)}</li>)}</ul>;
    if (lines.every((line) => /^\d+\. /.test(line))) return <ol key={index}>{lines.map((line, lineIndex) => <li key={lineIndex}>{inlineText(line.replace(/^\d+\. /, ""), props)}</li>)}</ol>;
    if (lines.every((line) => /^> /.test(line))) return <blockquote key={index}>{lines.map((line, lineIndex) => <p key={lineIndex}>{inlineText(line.slice(2), props)}</p>)}</blockquote>;
    return <p key={index}>{lines.map((line, lineIndex) => <span key={lineIndex}>{lineIndex > 0 && <br />}{inlineText(line, props)}</span>)}</p>;
  })}</div>;
}
