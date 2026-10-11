import { redirect } from "next/navigation";
import { UndercoverWordManager } from "@/components/undercover-word-manager";
import { requireUser } from "@/lib/auth";
import { listUndercoverWords } from "@/lib/undercover";

export default async function UndercoverWordsPage() {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/sioverse/undercover");
  return <UndercoverWordManager initialWords={await listUndercoverWords()} />;
}
