'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getSupabase, request as liveRequest } from '@/lib/client';
import { createShowcaseClient } from '@/lib/showcase';

type UploadPayload = { name: string; size: number; project_id: string | null; title: string; category: string };
type WorkspaceRuntime = {
  isShowcase: boolean;
  request: typeof liveRequest;
  uploadFile: (file: File, payload: UploadPayload, onStage?: (stage: string) => void) => Promise<void>;
  resetDemo: () => void;
  initialProjectId: string;
};
const RuntimeContext = createContext<WorkspaceRuntime | null>(null);

export function WorkspaceRuntimeProvider({ showcase, children }: { showcase: boolean; children: ReactNode }) {
  // Each mounted showcase owns its data. A private workspace never creates it.
  const [showcaseClient] = useState(() => showcase ? createShowcaseClient() : null);
  useEffect(() => () => { showcaseClient?.dispose(); }, [showcaseClient]);
  const runtime = useMemo<WorkspaceRuntime>(() => {
    if (showcaseClient) return {
      isShowcase: true,
      request: showcaseClient.request,
      uploadFile: showcaseClient.uploadFile,
      resetDemo: showcaseClient.reset,
      initialProjectId: showcaseClient.initialProjectId,
    };
    return {
      isShowcase: false,
      request: liveRequest,
      initialProjectId: 'all',
      resetDemo: () => {},
      uploadFile: async (file, payload, onStage) => {
        onStage?.('Preparing upload…');
        const prepared = await liveRequest<{ path: string; token: string; contentType: string; bucket: string }>('/api/files/prepare', { method: 'POST', body: JSON.stringify(payload) });
        onStage?.('Uploading securely…');
        const supabase = getSupabase();
        if (!supabase) throw new Error('The workspace connection is not configured.');
        const { error } = await supabase.storage.from(prepared.bucket).uploadToSignedUrl(prepared.path, prepared.token, file, { contentType: prepared.contentType, upsert: false });
        if (error) throw error;
        onStage?.('Verifying file…');
        await liveRequest('/api/files/complete', { method: 'POST', body: JSON.stringify({ ...payload, path: prepared.path }) });
      },
    };
  }, [showcaseClient]);
  return <RuntimeContext.Provider value={runtime}>{children}</RuntimeContext.Provider>;
}

export function useWorkspaceRuntime() {
  const runtime = useContext(RuntimeContext);
  if (!runtime) throw new Error('WorkspaceRuntimeProvider is required.');
  return runtime;
}
