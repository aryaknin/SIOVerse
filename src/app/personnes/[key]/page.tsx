import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpenText, Image as ImageIcon, UserRound } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getPersonProfile } from "@/lib/people";
import { PersonProfileEditor } from "@/components/person-profile-editor";

export default async function PersonPage({ params }: { params: Promise<{ key: string }> }) {
  const user = await requireUser();
  const { key } = await params;
  const profile = await getPersonProfile(key);
  if (!profile) notFound();
  const canEdit = user.role === "ADMIN" || key === `user:${user.id}`;
  return <main className="person-profile-page">
    <header className="person-profile-nav"><Link href="/sioverse/lore"><ArrowLeft size={17} /> Retour au wiki</Link><span>SIO<span>VERSE</span> ✳</span><Link href="/sioverse/memes">Les mèmes</Link></header>
    <div className="person-profile-container"><section className="person-profile-hero"><div className="person-profile-avatar"><UserRound size={58} /></div><div><small>{profile.person.kind === "STUDENT" ? "MEMBRE DE LA CLASSE" : profile.person.kind === "TEACHER" ? "PROFESSEUR" : "PERSONNE DU SIOVERSE"}</small><h1>{profile.person.name}</h1><p>{profile.headline || "Une histoire à découvrir dans SIOVerse."}</p></div></section>
      {canEdit ? <PersonProfileEditor personKey={key} initialHeadline={profile.headline} initialBio={profile.bio} /> : <section className="person-profile-about"><h2>À propos</h2><p>{profile.bio || "Cette fiche attend encore sa présentation."}</p></section>}
      <div className="person-profile-grid"><section><h2><BookOpenText size={21} /> Articles du wiki <span>{profile.articles.length}</span></h2>{profile.articles.map((article) => <Link className="person-profile-card" href={`/sioverse/lore?article=${article.id}`} key={article.id}><strong>{article.title}</strong><small>{article.body.slice(0, 160)}</small></Link>)}{!profile.articles.length && <p className="person-profile-empty">Aucun article associé pour le moment.</p>}</section><section><h2><ImageIcon size={21} /> Mèmes associés <span>{profile.memes.length}</span></h2><div className="person-profile-memes">{profile.memes.map((meme) => <Link href={`/sioverse/memes?meme=${meme.id}`} key={meme.id}><Image src={`/api/memes/gif/${meme.id}`} alt={meme.title} width={300} height={180} unoptimized /><strong>{meme.title}</strong></Link>)}</div>{!profile.memes.length && <p className="person-profile-empty">Aucun mème associé pour le moment.</p>}</section></div>
    </div>
  </main>;
}
