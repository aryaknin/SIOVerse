import { redirect } from "next/navigation";
import { MemeStudio } from "@/components/meme-studio";
import { requireUser } from "@/lib/auth";
import { listMemeStudio } from "@/lib/makeitsio";

export default async function MemeStudioPage() {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/sioverse/makeitsio");
  return <MemeStudio initialState={await listMemeStudio()} />;
}
