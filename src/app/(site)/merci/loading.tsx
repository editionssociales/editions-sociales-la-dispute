import { Container } from "@/components/container";

/**
 * Filet pendant `lookupOrder` (relecture de la session Stripe, `page.tsx`) :
 * l'écran restait BLANC le temps de l'appel réseau — au retour d'un
 * paiement, le pire moment pour un vide. Sobre et NEUTRE par construction :
 * ni remerciement ni montant tant que la session n'est pas relue (le titre
 * final dépend de `payment_status`), même traitement textuel que l'état
 * `!ready` du panier (`cart-view.tsx`).
 */
export default function LoadingMerciPage() {
  return (
    <Container className="bg-paper py-12 sm:py-16">
      <p aria-busy="true" className="py-16 text-center font-sans text-sm text-muted">
        Vérification du paiement…
      </p>
    </Container>
  );
}
