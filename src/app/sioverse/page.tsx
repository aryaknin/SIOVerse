import Link from "next/link";
import type { Metadata } from "next";
import { ArrowDownRight, ArrowLeft, ArrowUpRight, MoveUpRight, Sparkles, Zap } from "lucide-react";
import { universes } from "@/lib/universes";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: { absolute: "SIOVerse — La promo sans filtre" },
  description: "Lore, mèmes, Undercover et MakeItSIO : la communauté SIO dans une autre dimension.",
};

export default async function SioversePage() {
  await requireUser();
  return <main className="verse-shell verse-intro">
    <div className="verse-orb orb-one" /><div className="verse-orb orb-two" />
    <header className="verse-nav"><Link href="/" className="verse-back"><ArrowLeft size={17} /> Retour au bureau</Link><span className="verse-logo">SIO<span>VERSE</span><i>✳</i></span><span className="verse-nav-right"><span /> UN MONDE À PART</span></header>
    <section className="verse-hero"><div className="verse-hero-copy"><span className="verse-kicker"><Zap size={16} fill="currentColor" /> BIENVENUE DANS L’AUTRE DIMENSION</span><h1>LA PROMO<br /><em>SANS FILTRE<span>.</span></em></h1><p>Histoires, mèmes, missions et soirées improbables. Choisis ton univers et entre dans le jeu.</p><a href="#univers" className="verse-cta">Explorer les univers <ArrowDownRight size={21} /></a></div><div className="verse-sticker" aria-hidden="true"><div className="sticker-ring">SIOVERSE · OPEN YOUR WORLD ·</div><Sparkles size={67} strokeWidth={1.2} /></div></section>
    <div className="verse-ticker"><span>✳ BIENVENUE DANS SIOVERSE ✳ LORE ✳ MÈMES ✳ UNDERCOVER ✳ MAKEITSIO ✳ BIENVENUE DANS SIOVERSE ✳ LORE ✳ MÈMES ✳ UNDERCOVER ✳ MAKEITSIO</span></div>
    <section className="verse-worlds" id="univers"><div className="verse-section-heading"><div><span>CHOISIS TON MONDE</span><h2>Quatre façons<br />de tout raconter.</h2></div><p>Chaque univers a ses propres règles.<br />Le point commun ? C’est la promo qui écrit la suite.</p></div><div className="world-grid">{universes.map((world) => <Link href={`/sioverse/${world.slug}`} className={`world-card ${world.className}`} key={world.slug}><div className="world-top"><span>{world.number} / 04</span><MoveUpRight size={24} /></div><world.icon className="world-icon" strokeWidth={1.35} /><div className="world-content"><span>{world.subtitle}</span><h3>{world.name}</h3><p>{world.description}</p></div><span className="world-open">ENTRER DANS L’UNIVERS <ArrowUpRight size={16} /></span></Link>)}</div></section>
    <footer className="verse-footer"><span>SIOVERSE © 2026</span><span>FABRIQUÉ POUR LA PROMO ✳</span></footer>
  </main>;
}
