"use client";
import { useLanguage } from "./i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import type { WorkspaceAccess } from "./cloud";
import type { Session } from "../shared/model";
type Status = {
  pdfUrl: string | null;
  workerConfigured: boolean;
  job: { status: string; last_error: string | null } | null;
};
export default function ReportDelivery({ access, session }: {
  access: WorkspaceAccess; session: Session; readOnly: boolean;
}) {
  const { t } = useLanguage();
  const [status, setStatus] = useState<Status>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const reportId = session.report!.id;
  const pending = session.cloud?.pending;
  const refresh = useCallback(async () => {
    const id = ++generation.current;
    if (pending) return;
    setBusy(true);
    try {
      const auth = await access.client.auth.getSession();
      const result = await fetch(`/api/cam/deliveries?report=${encodeURIComponent(reportId)}`, {
        headers: { Authorization: `Bearer ${auth.data.session?.access_token || ""}`, "x-workspace-id": access.workspaceId },
        signal: AbortSignal.timeout(15000), cache: "no-store",
      });
      const data = await result.json();
      if (!result.ok) throw new Error(data.error || "Could not load PDF status.");
      if (id === generation.current) { setStatus(data); setError(""); }
    } catch (cause) {
      if (id === generation.current) setError(cause instanceof Error ? cause.message : "Could not load PDF status.");
    } finally { if (id === generation.current) setBusy(false); }
  }, [access, reportId, pending]);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 10000);
    return () => { clearInterval(timer); generation.current += 1; };
  }, [refresh]);
  const label = error || (pending ? "Saving report…" : status?.pdfUrl ? "PDF ready. This is the first generated version; saved edits appear in this visit."
    : status && !status.workerConfigured ? "PDF processing is not connected yet. Your report is saved."
    : status?.job?.last_error ? "Your report is saved. PDF processing needs attention."
    : "Report saved. Preparing PDF…");
  return <aside className="report-delivery no-print" aria-live="polite">
    <div><strong>{t("Report PDF")}</strong><p>{t(label)}</p></div>
    <div className="button-row report-delivery-actions">
      {status?.pdfUrl && <a className="button primary" href={status.pdfUrl} target="_blank" rel="noreferrer"><Download size={22} />{t("Download PDF")}</a>}
      <button className="button" onClick={() => void refresh()} disabled={busy || pending}><RefreshCw size={22} />{busy ? t("Checking…") : t("Refresh")}</button>
    </div>
  </aside>;
}
