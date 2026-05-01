import { useQuery } from '@tanstack/react-query';
import { apiBase, authHeaders } from '@/lib/api';

export function useArtifactTextQuery(path: string, enabled: boolean) {
  return useQuery({
    queryKey: ['artifacts', 'text', path],
    enabled: enabled && Boolean(path),
    queryFn: async () => {
      const response = await fetch(artifactResourceUrl(path), {
        credentials: 'include',
        headers: authHeaders(),
      });
      if (!response.ok) throw new Error(await response.text());
      return response.text();
    },
    staleTime: 60_000,
  });
}

export function useArtifactJsonQuery(path: string, enabled = true) {
  return useQuery({
    queryKey: ['artifacts', 'json', path],
    enabled: enabled && Boolean(path),
    queryFn: async () => {
      const response = await fetch(artifactResourceUrl(path), {
        credentials: 'include',
        headers: authHeaders(),
      });
      if (!response.ok) throw new Error(await response.text());
      return response.json() as Promise<unknown>;
    },
    staleTime: 60_000,
  });
}

function artifactResourceUrl(path: string): string {
  return `${apiBase}/artifacts?path=${encodeURIComponent(path)}`;
}
