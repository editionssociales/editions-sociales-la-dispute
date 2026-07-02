import { redirect } from "next/navigation";

/**
 * Pendant le lancement (souscription), la page d'entrée principale du site
 * est `/souscription`. À retirer une fois la campagne terminée pour revenir
 * à une page d'accueil dédiée.
 */
export default function Home() {
  redirect("/souscription");
}
