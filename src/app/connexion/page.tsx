import { redirect } from "next/navigation";
import { LoginScreen } from "@/components/login-screen";
import { countUsers, getCurrentUser } from "@/lib/auth";

export const metadata = { title: "Ouvrir une session" };

export default async function LoginPage() {
  let signedIn = false;
  try { signedIn = Boolean(await getCurrentUser()); } catch { /* Show the database warning below. */ }
  if (signedIn) redirect("/");
  let firstAccount = false;
  let databaseReady = true;
  try { firstAccount = await countUsers() === 0; }
  catch { databaseReady = false; }
  return <LoginScreen firstAccount={firstAccount} databaseReady={databaseReady} />;
}
