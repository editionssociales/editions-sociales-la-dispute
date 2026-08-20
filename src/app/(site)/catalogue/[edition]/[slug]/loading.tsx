import { BookPageFallback } from "@/components/book-page-fallback";

/**
 * Filet de première génération ISR (`generateStaticParams` vide — cf.
 * `page.tsx`) : streamé à l'instant du clic, pendant la lecture Postgres.
 */
export default function LoadingBookPage() {
  return <BookPageFallback />;
}
