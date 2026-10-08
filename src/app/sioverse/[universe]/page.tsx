import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Sparkles } from "lucide-react";
import { universes } from "@/lib/universes";
import { requireUser } from "@/lib/auth";
import { listLoreEntries } from "@/lib/lore";
import { LoreBoard } from "@/components/lore-board";
import { ensureMemesSchema, listArticleMemeLinks, listMemes } from "@/lib/memes";
import { MemesBoard } from "@/components/memes-board";
import { listContentPeople, listPeopleOptions } from "@/lib/people";

export default async function UniversePage({ params }: { params: Promise<{ universe: string }> }) {
  const user = await requireUser();
  const { universe } = await params;
  const world = universes.find((item) => item.slug === universe);
  if (!world) notFound();

  if (universe === "lore") {
    await ensureMemesSchema();
    const [entries, links, memes, people, concerned] = await Promise.all([listLoreEntries(), listArticleMemeLinks(), listMemes(), listPeopleOptions(), listContentPeople()]);
    return <main className="verse-shell universe-screen lore"><header className="verse-nav"><Link href="/sioverse" className="verse-back"><ArrowLeft size={17} /> Tous les univers</Link><span className="verse-logo">SIO<span>VERSE</span><i>✳</i></span><Link className="verse-nav-right" href="/">BUREAU SIO OS <ArrowUpRight size={15} /></Link></header><LoreBoard initialEntries={entries} initialLinks={links} initialConcerned={concerned} initialPeople={people} memes={memes} canManage={user.role === "ADMIN"} /></main>;
  }

  if (universe === "memes") {
    const [memes, people] = await Promise.all([listMemes(user.id), user.role === "ADMIN" ? listPeopleOptions() : Promise.resolve([])]);
    return <main className="verse-shell universe-screen memes"><header className="verse-nav"><Link href="/sioverse" className="verse-back"><ArrowLeft size={17} /> Tous les univers</Link><span className="verse-logo">SIO<span>VERSE</span><i>✳</i></span><Link className="verse-nav-right" href="/">BUREAU SIO OS <ArrowUpRight size={15} /></Link></header><MemesBoard initialMemes={memes} initialPeople={people} canManage={user.role === "ADMIN"} /></main>;
  }

  return <main className={`verse-shell universe-screen ${world.className}`}><header className="verse-nav"><Link href="/sioverse" className="verse-back"><ArrowLeft size={17} /> Tous les univers</Link><span className="verse-logo">SIO<span>VERSE</span><i>✳</i></span><Link className="verse-nav-right" href="/">BUREAU SIO OS <ArrowUpRight size={15} /></Link></header><section className="universe-landing"><span className="universe-label"><Sparkles size={16} /> UNIVERS {world.number} / 04</span><world.icon size={82} strokeWidth={1.15} /><h1>{world.name}<span>.</span></h1><p>{world.description}</p><div className="universe-coming">Cet univers prend forme. Prochaine étape : ses contenus et ses interactions.</div><Link href="/sioverse" className="verse-cta">Explorer les autres univers <ArrowUpRight size={18} /></Link></section></main>;
}
