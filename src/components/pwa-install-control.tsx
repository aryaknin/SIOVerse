"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Download, Globe2, Info, LockKeyhole, MonitorDown, ShieldAlert, Smartphone, X } from "lucide-react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Platform = "samsung" | "android" | "ios" | "desktop";
type CheckState = "checking" | "ok" | "error";

function currentPlatform(): Platform {
  const agent = navigator.userAgent;
  if (/SamsungBrowser/i.test(agent)) return "samsung";
  if (/Android/i.test(agent)) return "android";
  if (/iPad|iPhone|iPod/i.test(agent)) return "ios";
  return "desktop";
}

function currentlyInstalled(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches
    || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

export function PwaInstallControl() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [platform, setPlatform] = useState<Platform>("desktop");
  const [installed, setInstalled] = useState(false);
  const [secure, setSecure] = useState(true);
  const [manifest, setManifest] = useState<CheckState>("checking");
  const [worker, setWorker] = useState<CheckState>("checking");

  useEffect(() => {
    const initialize = window.setTimeout(() => {
      setPlatform(currentPlatform());
      setInstalled(currentlyInstalled());
      setSecure(window.isSecureContext);
      if (!("serviceWorker" in navigator)) setWorker("error");
    }, 0);
    const capture = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    const installedEvent = () => { setInstalled(true); setPrompt(null); };
    const displayMode = window.matchMedia("(display-mode: standalone)");
    const displayModeChanged = () => setInstalled(currentlyInstalled());
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", installedEvent);
    displayMode.addEventListener("change", displayModeChanged);

    fetch("/manifest.webmanifest", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("manifest");
      const data = await response.json() as { icons?: { sizes?: string }[] };
      const sizes = data.icons?.map((icon) => icon.sizes) ?? [];
      setManifest(sizes.includes("192x192") && sizes.includes("512x512") ? "ok" : "error");
    }).catch(() => setManifest("error"));

    if ("serviceWorker" in navigator) navigator.serviceWorker.ready.then(() => setWorker("ok")).catch(() => setWorker("error"));

    return () => {
      window.clearTimeout(initialize);
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("appinstalled", installedEvent);
      displayMode.removeEventListener("change", displayModeChanged);
    };
  }, []);

  async function requestInstall() {
    if (!prompt) {
      dialog.current?.showModal();
      return;
    }
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === "accepted") setPrompt(null);
  }

  const platformName = platform === "samsung" ? "Samsung Internet" : platform === "android" ? "Chrome sur Android" : platform === "ios" ? "Safari sur iPhone/iPad" : "Navigateur ordinateur";
  const buttonLabel = installed ? "SIOVerse est installée" : prompt ? "Installer SIOVerse maintenant" : !secure ? "Installation : HTTPS requis" : "Installer SIOVerse";

  return <>
    <button type="button" className={`start-settings pwa-install-trigger ${installed ? "installed" : ""}`} onClick={() => void requestInstall()}>
      {installed ? <Check size={17} /> : <Download size={17} />} {buttonLabel}
    </button>
    <dialog ref={dialog} className="ent-dialog pwa-install-dialog">
      <form method="dialog" className="ent-dialog-close"><button aria-label="Fermer"><X size={18} /></button></form>
      <div className="pwa-install-heading"><span><MonitorDown size={23} /></span><small>APPLICATION SIO OS</small><h3>{installed ? "SIOVerse est déjà installée." : "Installer SIOVerse"}</h3><p>Ajoute le bureau à ton écran d’accueil et ouvre-le comme une véritable application.</p></div>
      <div className="pwa-checks" aria-label="Diagnostic d’installation">
        <PwaCheck icon={<LockKeyhole size={15} />} label="Connexion sécurisée" state={secure ? "ok" : "error"} detail={secure ? "HTTPS actif" : `Adresse ${location.protocol}// non sécurisée`} />
        <PwaCheck icon={<Globe2 size={15} />} label="Manifeste Android" state={manifest} detail={manifest === "ok" ? "Icônes 192 et 512 prêtes" : manifest === "error" ? "Manifeste incomplet" : "Vérification…"} />
        <PwaCheck icon={<Smartphone size={15} />} label="Service d’application" state={worker} detail={worker === "ok" ? "Service worker actif" : worker === "error" ? "Service worker indisponible" : "Activation…"} />
      </div>
      {!secure ? <div className="pwa-install-warning"><ShieldAlert size={18} /><p><b>Une adresse HTTPS est obligatoire.</b> Ouvre la version déployée de SIOVerse. Une adresse locale du type <code>http://192.168…</code> ne peut pas déclencher l’installation Android.</p></div>
        : installed ? <div className="pwa-install-guide"><Check size={18} /><p>L’application fonctionne déjà en mode autonome sur cet appareil.</p></div>
          : platform === "samsung" ? <div className="pwa-install-guide"><Smartphone size={18} /><p>Dans <b>Samsung Internet</b>, ouvre le menu <b>☰</b>, puis <b>Ajouter la page à</b> → <b>Écran d’accueil</b>.</p></div>
            : platform === "android" ? <div className="pwa-install-guide"><Smartphone size={18} /><p>Dans <b>Chrome</b>, ouvre le menu <b>⋮</b>, puis choisis <b>Installer l’application</b> ou <b>Ajouter à l’écran d’accueil</b>.</p></div>
              : platform === "ios" ? <div className="pwa-install-guide"><Smartphone size={18} /><p>Dans <b>Safari</b>, touche <b>Partager</b>, puis <b>Sur l’écran d’accueil</b> et active <b>Ouvrir comme app</b>.</p></div>
                : <div className="pwa-install-guide"><Info size={18} /><p>Utilise l’icône d’installation dans la barre d’adresse ou le menu de ton navigateur.</p></div>}
      {prompt && !installed && secure && <button type="button" className="pwa-install-primary" onClick={() => void requestInstall()}><Download size={17} /> Ouvrir l’installation Android</button>}
      {!prompt && !installed && secure && <p className="pwa-install-note">Si l’option n’apparaît pas encore, recharge la page après quelques secondes. Le navigateur peut attendre une première interaction avant de proposer l’installation.</p>}
      <div className="pwa-browser"><span>Navigateur détecté</span><strong>{platformName}</strong></div>
    </dialog>
  </>;
}

function PwaCheck({ icon, label, state, detail }: { icon: React.ReactNode; label: string; state: CheckState; detail: string }) {
  return <div className={`pwa-check ${state}`}>{icon}<span><strong>{label}</strong><small>{detail}</small></span>{state === "ok" ? <Check size={15} /> : state === "error" ? <X size={15} /> : <i />}</div>;
}
