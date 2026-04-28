import { redirect } from 'next/navigation';

const slugs = [
  'quick-start',
  'mental-model',
  'project-env',
  'api-suite',
  'api-auth',
  'api-chain',
  'web-suite',
  'web-form',
  'selectors',
  'upload',
  'variables',
  'results',
  'troubleshooting',
];

export function generateStaticParams() {
  return slugs.map((slug) => ({ slug }));
}

export default async function DocsSubPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  void slug;
  redirect('/v2');
}
