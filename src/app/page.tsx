import { Desktop } from "@/components/desktop";
import { requireUser } from "@/lib/auth";

export default async function Home() { return <Desktop user={await requireUser()} />; }
