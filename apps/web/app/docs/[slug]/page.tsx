import { V2Console } from '@/components/dashboard/v2-console';

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
  return <V2Console view="docs" />;
}
