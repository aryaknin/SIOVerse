import Link from "next/link";
import { UsersRound } from "lucide-react";
import type { PersonOption } from "@/lib/people";

export function ConcernedPeopleDisplay({ people }: { people: PersonOption[] }) {
  if (!people.length) return null;
  return <div className="content-people"><span><UsersRound size={15} /> Personnes concernées</span><div>{people.map((person) => person.key.startsWith("former:") ? <span className={`content-person content-person-${person.kind.toLowerCase()}`} key={person.key}>{person.name}</span> : <Link className={`content-person content-person-${person.kind.toLowerCase()}`} href={`/personnes/${encodeURIComponent(person.key)}`} key={person.key}>{person.name}</Link>)}</div></div>;
}
