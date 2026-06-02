import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Inbox, Sparkles, CheckCircle2, AlertCircle, Archive, Loader2, Send, Reply, RotateCw, PenLine, History } from "lucide-react";
import { useDebtors } from "@/lib/data-store";
import {
  useInbox,
  addMessage,
  updateMessage,
  addFollowUp,
  CATEGORY_META,
  COMPANY_EMAIL,
  ORAYA_INBOX_EMAIL,
  type InboxMessage,
} from "@/lib/inbox-store";
import { classifyMessage } from "@/lib/inbox.functions";
import { getSettings, composeOutgoingBody } from "@/lib/settings-store";
import {
  useAuditLog,
  logAudit,
  getActionMeta,
  AUDIT_IA_LABEL,
  AUDIT_USER_LABEL,
} from "@/lib/audit-log-store";

export const Route = createFileRoute("/_authenticated/inbox")({
  component: InboxPage,
});

// Scénarios fictifs pour démo
const FAKE_SCENARIOS: Array<{
  from: string;
  from_name: string;
  subject: string;
  body: string;
  debtor_hint?: string;
}> = [
  {
    from: "compta@delaunay.fr",
    from_name: "Marc Delaunay",
    subject: "Re: Relance facture F-2024-1042",
    body: "Bonjour,\n\nMerci pour votre relance. Désolé pour le retard, nous avons eu un souci de trésorerie ce mois-ci.\nJe procède au virement le 15 juin au plus tard.\n\nCordialement,\nMarc Delaunay",
  },
  {
    from: "p.marlon@marlon-ind.com",
    from_name: "Pierre Marlon",
    subject: "Re: Mise en demeure F-2024-0987",
    body: "Madame, Monsieur,\n\nNous contestons formellement cette facture. Le service livré ne correspond pas du tout à ce qui était convenu dans le devis initial. Notre avocat va vous contacter sous peu.\n\nPierre Marlon",
  },
  {
    from: "sophie@verrelumiere.fr",
    from_name: "Sophie Bernard",
    subject: "Re: Facture F-2024-1108 en attente",
    body: "Bonjour,\n\nPourriez-vous me renvoyer vos coordonnées bancaires (RIB) ? Je n'arrive plus à remettre la main dessus et je voudrais régler cette semaine.\n\nMerci,\nSophie",
  },
  {
    from: "compta@delaunay.fr",
    from_name: "Marc Delaunay",
    subject: "Re: Re: Facture F-2024-1042",
    body: "Bonjour,\n\nSerait-il possible d'étaler le paiement sur 3 mois ? La situation est compliquée actuellement et un règlement en une fois nous mettrait en difficulté.\n\nMerci de votre compréhension,\nMarc",
    debtor_hint: "Bâtisserie Delaunay SAS",
  },
  {
    from: "noreply@autoreply.fr",
    from_name: "Mail Système",
    subject: "Out of office",
    body: "Je suis absent jusqu'au 20 juin. Pour toute urgence, contactez mon collègue.",
  },
];

let scenarioIdx = 0;

function InboxPage() {
  const debtors = useDebtors();
  const inbox = useInbox();
  const classify = useServerFn(classifyMessage);
  const [tab, setTab] = useState<"pending" | "auto" | "all">("pending");
  const [simulating, setSimulating] = useState(false);
  const [reclassifyingId, setReclassifyingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (tab === "pending") return inbox.filter((m) => m.status === "pending");
    if (tab === "auto") return inbox.filter((m) => m.status === "auto_processed");
    return inbox;
  }, [inbox, tab]);

  const counts = useMemo(
    () => ({
      pending: inbox.filter((m) => m.status === "pending").length,
      auto: inbox.filter((m) => m.status === "auto_processed").length,
      total: inbox.length,
    }),
    [inbox],
  );

  const selected = selectedId ? inbox.find((m) => m.id === selectedId) : filtered[0];

  async function runClassification(opts: {
    id: string;
    subject: string;
    body: string;
    from: string;
    debtorCompany?: string;
    isReclassify?: boolean;
  }) {
    const result = await classify({
      data: {
        subject: opts.subject,
        body: opts.body,
        from: opts.from,
        debtor_company: opts.debtorCompany,
      },
    });

    if ("error" in result) {
      updateMessage(opts.id, { ai_summary: `❌ ${result.error}` });
      return;
    }

    const meta = CATEGORY_META[result.category];
    const settings = getSettings();
    const hasDraft = result.draft_body.trim().length > 0;
    const includeRib =
      result.category === "demande_rib" || result.category === "promesse_paiement";
    const fullDraftBody = hasDraft
      ? composeOutgoingBody(result.draft_body, settings, { includeRib })
      : "";
    const autoOk = meta.auto && result.confidence >= settings.auto_send_threshold;

    updateMessage(opts.id, {
      category: result.category,
      confidence: result.confidence,
      ai_summary: result.summary,
      ai_action_taken: autoOk ? result.suggested_action : undefined,
      payment_promised_date: result.payment_promised_date,
      ai_draft_subject: result.draft_subject,
      ai_draft_body: fullDraftBody,
      sent_subject: autoOk && hasDraft ? result.draft_subject : undefined,
      sent_body: autoOk && hasDraft ? fullDraftBody : undefined,
      sent_to: autoOk && hasDraft ? opts.from : undefined,
      sent_bcc: autoOk && hasDraft ? COMPANY_EMAIL : undefined,
      sent_reply_to: autoOk && hasDraft ? ORAYA_INBOX_EMAIL : undefined,
      sent_at: autoOk && hasDraft ? new Date().toISOString() : undefined,
      status: autoOk ? "auto_processed" : "pending",
    });

    // Audit : classement IA (+ envoi auto le cas échéant)
    logAudit({
      message_id: opts.id,
      actor: "ia",
      actor_label: AUDIT_IA_LABEL,
      action: opts.isReclassify ? "reclassified" : "classified",
      version: {
        subject: result.draft_subject,
        body: fullDraftBody,
        confidence: result.confidence,
        category: result.category,
      },
      note: meta.label,
    });
    if (autoOk && hasDraft) {
      logAudit({
        message_id: opts.id,
        actor: "ia",
        actor_label: AUDIT_IA_LABEL,
        action: "auto_sent",
        version: {
          subject: result.draft_subject,
          body: fullDraftBody,
          confidence: result.confidence,
          category: result.category,
        },
        note: `Confiance ${Math.round(result.confidence * 100)}% ≥ seuil ${Math.round(settings.auto_send_threshold * 100)}%`,
      });
    }
  }

  async function simulateIncoming() {
    setSimulating(true);
    try {
      const scenario = FAKE_SCENARIOS[scenarioIdx % FAKE_SCENARIOS.length];
      scenarioIdx += 1;

      const matched = debtors.find(
        (d) => d.email.toLowerCase() === scenario.from.toLowerCase(),
      );

      const id = `m_${Date.now()}`;
      const baseMsg: InboxMessage = {
        id,
        received_at: new Date().toISOString(),
        from_email: scenario.from,
        from_name: scenario.from_name,
        subject: scenario.subject,
        body: scenario.body,
        matched_debtor_id: matched?.id,
        matched_debtor_company: matched?.company ?? scenario.debtor_hint,
        status: "pending",
      };
      addMessage(baseMsg);
      setSelectedId(id);
      logAudit({
        message_id: id,
        actor: "ia",
        actor_label: AUDIT_IA_LABEL,
        action: "received",
        note: `De ${scenario.from_name || scenario.from}`,
      });

      await runClassification({
        id,
        subject: scenario.subject,
        body: scenario.body,
        from: scenario.from,
        debtorCompany: matched?.company ?? scenario.debtor_hint,
      });
    } finally {
      setSimulating(false);
    }
  }

  async function reclassify(id: string) {
    const m = inbox.find((x) => x.id === id);
    if (!m) return;
    setReclassifyingId(id);
    // Réinitialise l'analyse précédente pour montrer le re-traitement
    updateMessage(id, {
      category: undefined,
      confidence: undefined,
      ai_summary: undefined,
      ai_draft_subject: undefined,
      ai_draft_body: undefined,
      payment_promised_date: null,
      status: "pending",
      sent_subject: undefined,
      sent_body: undefined,
      sent_to: undefined,
      sent_bcc: undefined,
      sent_reply_to: undefined,
      sent_at: undefined,
      ai_action_taken: undefined,
    });
    try {
      await runClassification({
        id,
        subject: m.subject,
        body: m.body,
        from: m.from_email,
        debtorCompany: m.matched_debtor_company,
        isReclassify: true,
      });
    } finally {
      setReclassifyingId(null);
    }
  }

  function sendDraft(id: string, subject: string, body: string) {
    const m = inbox.find((x) => x.id === id);
    if (!m) return;
    const wasAiDraft =
      subject === (m.ai_draft_subject ?? "") && body === (m.ai_draft_body ?? "");
    updateMessage(id, {
      status: "manual_validated",
      sent_subject: subject,
      sent_body: body,
      sent_to: m.from_email,
      sent_bcc: COMPANY_EMAIL,
      sent_reply_to: ORAYA_INBOX_EMAIL,
      sent_at: new Date().toISOString(),
      ai_action_taken: "Réponse envoyée après validation manuelle",
    });
    logAudit({
      message_id: id,
      actor: "user",
      actor_label: AUDIT_USER_LABEL,
      action: "manual_validated",
      version: { subject, body, confidence: m.confidence, category: m.category },
      note: wasAiDraft
        ? "Brouillon IA validé tel quel"
        : m.ai_draft_body
          ? "Brouillon IA modifié avant envoi"
          : "Rédaction 100% manuelle",
    });
  }

  function sendFollowUp(id: string, subject: string, body: string) {
    const m = inbox.find((x) => x.id === id);
    if (!m) return;
    addFollowUp(id, {
      to: m.from_email,
      bcc: COMPANY_EMAIL,
      subject,
      body,
    });
    logAudit({
      message_id: id,
      actor: "user",
      actor_label: AUDIT_USER_LABEL,
      action: "follow_up_sent",
      version: { subject, body },
    });
  }

  function archive(id: string) {
    updateMessage(id, { status: "archived" });
    logAudit({
      message_id: id,
      actor: "user",
      actor_label: AUDIT_USER_LABEL,
      action: "archived",
    });
  }

  return (
    <div className="px-6 lg:px-10 py-8 max-w-[1400px] mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Inbox className="h-6 w-6 text-[var(--highlight)]" />
            Boîte de réception
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Réponses des débiteurs — classées et pré-traitées par l'IA.
          </p>
        </div>
        <button
          onClick={simulateIncoming}
          disabled={simulating}
          className="inline-flex items-center gap-2 bg-[var(--navy)] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-[var(--navy)]/90 disabled:opacity-50 transition"
        >
          {simulating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Simuler un mail entrant
        </button>
      </div>

      {/* Onglets */}
      <div className="flex items-center gap-1 mb-4 bg-white border border-border rounded-lg p-1 w-fit">
        <TabBtn active={tab === "pending"} onClick={() => setTab("pending")} count={counts.pending} accent="amber">
          À vérifier
        </TabBtn>
        <TabBtn active={tab === "auto"} onClick={() => setTab("auto")} count={counts.auto} accent="emerald">
          Auto-traités
        </TabBtn>
        <TabBtn active={tab === "all"} onClick={() => setTab("all")} count={counts.total} accent="slate">
          Tous
        </TabBtn>
      </div>

      {inbox.length === 0 ? (
        <div className="bg-white border border-border rounded-xl p-12 text-center">
          <Inbox className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            Aucune réponse pour le moment. Cliquez sur <strong>Simuler un mail entrant</strong> pour tester le pipeline IA.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-4">
          {/* Liste */}
          <div className="space-y-2">
            {filtered.length === 0 && (
              <div className="text-sm text-muted-foreground bg-white border border-border rounded-lg p-6 text-center">
                Aucun message dans cet onglet.
              </div>
            )}
            {filtered.map((m) => (
              <MessageCard
                key={m.id}
                message={m}
                selected={selected?.id === m.id}
                onClick={() => setSelectedId(m.id)}
              />
            ))}
          </div>

          {/* Détail */}
          <div className="bg-white border border-border rounded-xl p-6 lg:sticky lg:top-20 h-fit">
            {selected ? (
              <MessageDetail
                message={selected}
                onSend={(subject, body) => sendDraft(selected.id, subject, body)}
                onFollowUp={(subject, body) => sendFollowUp(selected.id, subject, body)}
                onArchive={() => archive(selected.id)}
                onReclassify={() => reclassify(selected.id)}
                reclassifying={reclassifyingId === selected.id}
              />

            ) : (
              <div className="text-sm text-muted-foreground text-center py-12">
                Sélectionnez un message.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  count,
  accent,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  accent: "amber" | "emerald" | "slate";
  children: React.ReactNode;
}) {
  const dot =
    accent === "amber" ? "bg-amber-500" : accent === "emerald" ? "bg-emerald-500" : "bg-slate-400";
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition ${
        active ? "bg-[var(--navy)] text-white" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
      <span
        className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] ${
          active ? "bg-white/20" : `${dot} text-white`
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function MessageCard({
  message,
  selected,
  onClick,
}: {
  message: InboxMessage;
  selected: boolean;
  onClick: () => void;
}) {
  const meta = message.category ? CATEGORY_META[message.category] : null;
  const isPending = message.status === "pending";
  return (
    <button
      onClick={onClick}
      className={`w-full text-left bg-white border rounded-lg p-3 transition hover:shadow-sm ${
        selected ? "border-[var(--highlight)] ring-2 ring-[var(--highlight)]/20" : "border-border"
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="text-xs font-medium text-foreground truncate">
          {message.from_name || message.from_email}
        </div>
        <span className="text-[10px] text-muted-foreground shrink-0">
          {new Date(message.received_at).toLocaleTimeString("fr-FR", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
      <div className="text-sm text-foreground truncate mb-1">{message.subject}</div>
      <div className="text-xs text-muted-foreground line-clamp-2 mb-2">{message.body}</div>
      <div className="flex items-center gap-2 flex-wrap">
        {meta ? (
          <span className={`text-[10px] px-2 py-0.5 rounded-full border ${meta.color}`}>
            {meta.emoji} {meta.label}
          </span>
        ) : (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
            <Loader2 className="inline h-2.5 w-2.5 animate-spin mr-1" />
            Classement en cours…
          </span>
        )}
        {message.confidence != null && (
          <span className="text-[10px] text-muted-foreground">
            {Math.round(message.confidence * 100)}% sûr
          </span>
        )}
        {isPending && message.category && (
          <span className="text-[10px] text-amber-600 font-medium ml-auto">À vérifier</span>
        )}
        {message.status === "auto_processed" && (
          <span className="text-[10px] text-emerald-600 font-medium ml-auto flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> Auto
          </span>
        )}
      </div>
    </button>
  );
}

function MessageDetail({
  message,
  onSend,
  onFollowUp,
  onArchive,
  onReclassify,
  reclassifying,
}: {
  message: InboxMessage;
  onSend: (subject: string, body: string) => void;
  onFollowUp: (subject: string, body: string) => void;
  onArchive: () => void;
  onReclassify: () => void;
  reclassifying: boolean;
}) {
  const meta = message.category ? CATEGORY_META[message.category] : null;
  const isSent = message.status === "auto_processed" || message.status === "manual_validated";
  const sentSubject = message.sent_subject ?? "";
  const sentBody = message.sent_body ?? "";

  // État local pour édition du brouillon (pending uniquement)
  const [draftSubject, setDraftSubject] = useState(message.ai_draft_subject ?? "");
  const [draftBody, setDraftBody] = useState(message.ai_draft_body ?? "");
  // Resync quand le message change ou que l'IA finit de classifier
  const draftKey = `${message.id}:${message.ai_draft_body ?? ""}`;
  const [lastKey, setLastKey] = useState(draftKey);
  if (lastKey !== draftKey) {
    setLastKey(draftKey);
    setDraftSubject(message.ai_draft_subject ?? "");
    setDraftBody(message.ai_draft_body ?? "");
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-4 pb-4 border-b border-border">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground mb-1">
            De {message.from_name ? `${message.from_name} <${message.from_email}>` : message.from_email}
          </div>
          <h2 className="text-base font-semibold truncate">{message.subject}</h2>
          {message.matched_debtor_company && (
            <div className="text-xs text-muted-foreground mt-1">
              Débiteur identifié : <span className="font-medium text-foreground">{message.matched_debtor_company}</span>
            </div>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground shrink-0">
          {new Date(message.received_at).toLocaleString("fr-FR")}
        </span>
      </div>

      <div className="bg-[var(--surface-soft)] rounded-lg p-4 text-sm whitespace-pre-wrap mb-4 text-foreground/90 max-h-48 overflow-y-auto">
        {message.body}
      </div>

      {/* Bloc Analyse IA */}
      {meta ? (
        <div className="border border-border rounded-lg p-4 mb-4 bg-gradient-to-br from-blue-50/40 to-white">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-3.5 w-3.5 text-[var(--highlight)]" />
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--highlight)]">
              Analyse IA
            </span>
            {message.confidence != null && (
              <span className="text-[10px] text-muted-foreground ml-auto">
                Confiance : <strong>{Math.round(message.confidence * 100)}%</strong>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className={`text-xs px-2 py-1 rounded-full border ${meta.color}`}>
              {meta.emoji} {meta.label}
            </span>
            {message.payment_promised_date && (
              <span className="text-xs px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                📆 Paiement promis : {new Date(message.payment_promised_date).toLocaleDateString("fr-FR")}
              </span>
            )}
          </div>
          {message.ai_summary && (
            <p className="text-sm text-foreground/90">{message.ai_summary}</p>
          )}
          <div className="mt-3 pt-3 border-t border-border/60 flex items-center justify-between gap-2">
            <span className="text-[10px] text-muted-foreground">
              Classement incorrect ? Relancez l'analyse IA.
            </span>
            <button
              onClick={onReclassify}
              disabled={reclassifying}
              className="inline-flex items-center gap-1.5 text-xs border border-border bg-white px-2.5 py-1.5 rounded-md hover:bg-[var(--surface-soft)] disabled:opacity-50 transition"
            >
              {reclassifying ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RotateCw className="h-3 w-3" />
              )}
              Reclasser
            </button>
          </div>
        </div>
      ) : (
        <div className="border border-border rounded-lg p-4 mb-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {reclassifying ? "Re-classement IA en cours…" : "Classement IA en cours…"}
        </div>
      )}

      {/* Réponse IA — envoyée OU brouillon à valider */}
      {isSent && sentBody && (
        <div className="border border-emerald-200 rounded-lg overflow-hidden mb-4">
          <div className="bg-emerald-50 px-4 py-2 flex items-center gap-2 border-b border-emerald-200">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span className="text-xs font-semibold text-emerald-800 uppercase tracking-wide">
              {message.status === "auto_processed" ? "Réponse envoyée automatiquement" : "Réponse envoyée"}
            </span>
            {message.sent_at && (
              <span className="text-[10px] text-emerald-700 ml-auto">
                {new Date(message.sent_at).toLocaleString("fr-FR")}
              </span>
            )}
          </div>
          <div className="p-4 bg-white">
            <div className="text-[11px] text-muted-foreground space-y-0.5 mb-3 font-mono">
              <div>À : <span className="text-foreground">{message.sent_to ?? message.from_email}</span></div>
              {message.sent_bcc && (
                <div>Cci : <span className="text-foreground">{message.sent_bcc}</span> <span className="text-muted-foreground">(votre archive)</span></div>
              )}
              {message.sent_reply_to && (
                <div>Reply-To : <span className="text-foreground">{message.sent_reply_to}</span></div>
              )}
            </div>
            <div className="text-sm font-medium text-foreground mb-2">{sentSubject}</div>
            <div className="text-sm whitespace-pre-wrap text-foreground/90">{sentBody}</div>
          </div>

          {/* Follow-ups (réponses ultérieures depuis Oraya) */}
          {message.follow_ups && message.follow_ups.length > 0 && (
            <div className="border-t border-emerald-200 bg-emerald-50/30 divide-y divide-emerald-100">
              {message.follow_ups.map((f) => (
                <div key={f.id} className="p-4">
                  <div className="text-[10px] text-emerald-700 mb-1 flex items-center gap-1.5">
                    <Reply className="h-3 w-3" /> Suite envoyée — {new Date(f.sent_at).toLocaleString("fr-FR")}
                  </div>
                  <div className="text-sm font-medium text-foreground mb-1">{f.subject}</div>
                  <div className="text-sm whitespace-pre-wrap text-foreground/90">{f.body}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {isSent && !sentBody && message.ai_action_taken && (
        <div className="text-xs bg-slate-50 border border-slate-200 rounded-md p-3 text-slate-700 mb-4">
          <strong>Action :</strong> {message.ai_action_taken} <span className="text-muted-foreground">(aucun email envoyé)</span>
        </div>
      )}

      {/* Composer pour relancer la conversation après traitement */}
      {isSent && (
        <FollowUpComposer message={message} onSend={onFollowUp} />
      )}


      {message.status === "pending" && meta && (
        <>
          {draftBody ? (
            <div className="border border-amber-200 rounded-lg overflow-hidden mb-4">
              <div className="bg-amber-50 px-4 py-2 flex items-center gap-2 border-b border-amber-200">
                <Sparkles className="h-4 w-4 text-amber-600" />
                <span className="text-xs font-semibold text-amber-800 uppercase tracking-wide">
                  Brouillon proposé par l'IA
                </span>
                <span className="text-[10px] text-amber-700 ml-auto">Modifiable avant envoi</span>
              </div>
              <div className="p-4 bg-white space-y-3">
                <div>
                  <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                    Sujet
                  </label>
                  <input
                    value={draftSubject}
                    onChange={(e) => setDraftSubject(e.target.value)}
                    className="w-full mt-1 text-sm border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--highlight)]/20 focus:border-[var(--highlight)]"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                    Message à {message.from_email}
                  </label>
                  <textarea
                    value={draftBody}
                    onChange={(e) => setDraftBody(e.target.value)}
                    rows={8}
                    className="w-full mt-1 text-sm border border-border rounded-md px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-[var(--highlight)]/20 focus:border-[var(--highlight)] resize-y"
                  />
                </div>
              </div>
            </div>
          ) : (
            <ManualReplyWorkflow message={message} onSend={onSend} onArchive={onArchive} />
          )}

          {draftBody && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => onSend(draftSubject, draftBody)}
                className="flex-1 inline-flex items-center justify-center gap-2 bg-[var(--highlight)] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-[var(--highlight)]/90 transition"
              >
                <Send className="h-4 w-4" />
                Valider et envoyer
              </button>
              <button
                onClick={onArchive}
                className="inline-flex items-center gap-2 border border-border bg-white px-3 py-2 rounded-md text-sm hover:bg-[var(--surface-soft)] transition"
              >
                <Archive className="h-4 w-4" />
                Archiver
              </button>
            </div>
          )}
        </>
      )}

      {isSent && (
        <div className="flex items-center justify-end">
          <button
            onClick={onArchive}
            className="inline-flex items-center gap-2 border border-border bg-white px-3 py-2 rounded-md text-sm hover:bg-[var(--surface-soft)] transition"
          >
            <Archive className="h-4 w-4" />
            Archiver
          </button>
        </div>
      )}

      <AuditTimeline messageId={message.id} />
    </div>
  );
}

function FollowUpComposer({
  message,
  onSend,
}: {
  message: InboxMessage;
  onSend: (subject: string, body: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const defaultSubject = (message.sent_subject ?? message.subject).startsWith("Re:")
    ? message.sent_subject ?? message.subject
    : `Re: ${message.subject}`;
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState("");

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full inline-flex items-center justify-center gap-2 border border-border bg-white px-4 py-2 rounded-md text-sm font-medium hover:bg-[var(--surface-soft)] transition mb-3"
      >
        <Reply className="h-4 w-4" />
        Répondre à {message.from_name || message.from_email}
      </button>
    );
  }

  return (
    <div className="border border-[var(--highlight)]/30 rounded-lg overflow-hidden mb-3">
      <div className="bg-[var(--highlight)]/5 px-4 py-2 flex items-center gap-2 border-b border-[var(--highlight)]/20">
        <Reply className="h-4 w-4 text-[var(--highlight)]" />
        <span className="text-xs font-semibold text-[var(--highlight)] uppercase tracking-wide">
          Nouveau message
        </span>
        <button onClick={() => setOpen(false)} className="ml-auto text-xs text-muted-foreground hover:text-foreground">
          Annuler
        </button>
      </div>
      <div className="p-4 bg-white space-y-3">
        <div className="text-[11px] text-muted-foreground space-y-0.5 font-mono">
          <div>À : <span className="text-foreground">{message.from_email}</span></div>
          <div>Cci : <span className="text-foreground">{COMPANY_EMAIL}</span></div>
          <div>Reply-To : <span className="text-foreground">{ORAYA_INBOX_EMAIL}</span></div>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Sujet</label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full mt-1 text-sm border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--highlight)]/20 focus:border-[var(--highlight)]"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Message</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            placeholder="Tapez votre message…"
            className="w-full mt-1 text-sm border border-border rounded-md px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-[var(--highlight)]/20 focus:border-[var(--highlight)] resize-y"
          />
        </div>
        <div className="flex justify-end">
          <button
            disabled={!body.trim() || !subject.trim()}
            onClick={() => {
              onSend(subject, body);
              setBody("");
              setOpen(false);
            }}
            className="inline-flex items-center gap-2 bg-[var(--highlight)] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-[var(--highlight)]/90 disabled:opacity-50 transition"
          >
            <Send className="h-4 w-4" />
            Envoyer
          </button>
        </div>
      </div>
    </div>
  );
}

function ManualReplyWorkflow({
  message,
  onSend,
  onArchive,
}: {
  message: InboxMessage;
  onSend: (subject: string, body: string) => void;
  onArchive: () => void;
}) {
  const isHorsSujet = message.category === "hors_sujet";
  const [step, setStep] = useState<"choose" | "compose" | "preview">("choose");
  const defaultSubject = message.subject.startsWith("Re:")
    ? message.subject
    : `Re: ${message.subject}`;
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState("");
  const settings = getSettings();
  const finalBody = body.trim() ? composeOutgoingBody(body, settings) : "";

  if (step === "choose") {
    return (
      <div className="border border-slate-200 rounded-lg overflow-hidden mb-4 bg-white">
        <div className="bg-slate-50 px-4 py-2 flex items-center gap-2 border-b border-slate-200">
          <AlertCircle className="h-4 w-4 text-slate-600" />
          <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
            {isHorsSujet ? "Message hors-sujet" : "Pas de brouillon IA"}
          </span>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-sm text-foreground/80">
            {isHorsSujet
              ? "L'IA a identifié ce message comme hors-sujet (auto-reply, spam, conversation sans lien avec une facture). Aucune réponse automatique ne sera envoyée."
              : "L'IA ne propose pas de brouillon pour cette catégorie. À vous de décider."}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              onClick={() => setStep("compose")}
              className="inline-flex items-center justify-center gap-2 bg-[var(--highlight)] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-[var(--highlight)]/90 transition"
            >
              <PenLine className="h-4 w-4" />
              Rédiger une réponse manuelle
            </button>
            <button
              onClick={onArchive}
              className="inline-flex items-center justify-center gap-2 border border-border bg-white px-4 py-2 rounded-md text-sm font-medium hover:bg-[var(--surface-soft)] transition"
            >
              <Archive className="h-4 w-4" />
              Ignorer et archiver
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === "compose") {
    return (
      <div className="border border-[var(--highlight)]/30 rounded-lg overflow-hidden mb-4">
        <Stepper current={1} />
        <div className="p-4 bg-white space-y-3">
          <div>
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
              Sujet
            </label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full mt-1 text-sm border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--highlight)]/20 focus:border-[var(--highlight)]"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
              Message à {message.from_email}
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={7}
              placeholder="Bonjour,&#10;&#10;Tapez votre réponse ici. La signature sera ajoutée automatiquement."
              className="w-full mt-1 text-sm border border-border rounded-md px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-[var(--highlight)]/20 focus:border-[var(--highlight)] resize-y"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              La signature configurée dans Paramètres est ajoutée automatiquement à l'étape suivante.
            </p>
          </div>
          <div className="flex items-center justify-between gap-2 pt-2">
            <button
              onClick={() => setStep("choose")}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              ← Retour
            </button>
            <button
              disabled={!body.trim() || !subject.trim()}
              onClick={() => setStep("preview")}
              className="inline-flex items-center gap-2 bg-[var(--navy)] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-[var(--navy)]/90 disabled:opacity-40 transition"
            >
              Aperçu avant envoi →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // preview
  return (
    <div className="border border-[var(--highlight)]/30 rounded-lg overflow-hidden mb-4">
      <Stepper current={2} />
      <div className="p-4 bg-white space-y-3">
        <div className="text-[11px] text-muted-foreground space-y-0.5 font-mono bg-[var(--surface-soft)] rounded p-3">
          <div>À : <span className="text-foreground">{message.from_email}</span></div>
          <div>Cci : <span className="text-foreground">{COMPANY_EMAIL}</span></div>
          <div>Reply-To : <span className="text-foreground">{ORAYA_INBOX_EMAIL}</span></div>
          <div>Sujet : <span className="text-foreground">{subject}</span></div>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
            Aperçu final
          </label>
          <pre className="mt-1 text-sm whitespace-pre-wrap font-mono border border-border rounded-md p-3 bg-white max-h-72 overflow-y-auto">
{finalBody}
          </pre>
        </div>
        <div className="flex items-center justify-between gap-2 pt-2">
          <button
            onClick={() => setStep("compose")}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            ← Modifier
          </button>
          <button
            onClick={() => onSend(subject, finalBody)}
            className="inline-flex items-center gap-2 bg-[var(--highlight)] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-[var(--highlight)]/90 transition"
          >
            <Send className="h-4 w-4" />
            Confirmer l'envoi
          </button>
        </div>
      </div>
    </div>
  );
}

function Stepper({ current }: { current: 0 | 1 | 2 }) {
  const steps = ["Choix", "Rédaction", "Aperçu & envoi"];
  return (
    <div className="bg-[var(--highlight)]/5 px-4 py-2 flex items-center gap-3 border-b border-[var(--highlight)]/20 text-xs">
      {steps.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <span
            className={`h-5 w-5 grid place-items-center rounded-full text-[10px] font-semibold ${
              i <= current
                ? "bg-[var(--highlight)] text-white"
                : "bg-white border border-border text-muted-foreground"
            }`}
          >
            {i + 1}
          </span>
          <span className={i === current ? "text-foreground font-medium" : "text-muted-foreground"}>
            {label}
          </span>
          {i < steps.length - 1 && <span className="text-muted-foreground/40">›</span>}
        </div>
      ))}
    </div>
  );
}

function AuditTimeline({ messageId }: { messageId: string }) {
  const entries = useAuditLog(messageId);
  const [open, setOpen] = useState(false);
  if (entries.length === 0) return null;

  // Ordre chronologique ascendant (le plus ancien en haut)
  const ordered = [...entries].reverse();

  return (
    <div className="mt-6 border-t border-border pt-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition"
      >
        <History className="h-3.5 w-3.5" />
        Journal d'audit
        <span className="text-[10px] text-muted-foreground/70 font-normal normal-case">
          ({entries.length} événement{entries.length > 1 ? "s" : ""})
        </span>
        <span className="ml-auto text-[10px]">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <ol className="mt-3 space-y-2">
          {ordered.map((e) => {
            const meta = getActionMeta(e.action);
            const isIa = e.actor === "ia";
            return (
              <li
                key={e.id}
                className="text-xs bg-[var(--surface-soft)] border border-border rounded-md p-2.5"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span>{meta.emoji}</span>
                  <span className="font-medium text-foreground">{meta.label}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
                      isIa
                        ? "bg-blue-50 text-blue-700 border-blue-200"
                        : "bg-emerald-50 text-emerald-700 border-emerald-200"
                    }`}
                  >
                    {e.actor_label}
                  </span>
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    {new Date(e.at).toLocaleString("fr-FR")}
                  </span>
                </div>
                {e.note && (
                  <p className="text-[11px] text-muted-foreground mt-1">{e.note}</p>
                )}
                {e.version && (e.version.subject || e.version.body) && (
                  <details className="mt-1.5">
                    <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground">
                      Voir la version utilisée
                      {e.version.confidence != null && (
                        <span className="ml-2">
                          · confiance {Math.round(e.version.confidence * 100)}%
                        </span>
                      )}
                    </summary>
                    <div className="mt-1.5 bg-white border border-border rounded p-2 font-mono text-[11px] space-y-1">
                      {e.version.subject && (
                        <div>
                          <span className="text-muted-foreground">Sujet : </span>
                          <span className="text-foreground">{e.version.subject}</span>
                        </div>
                      )}
                      {e.version.body && (
                        <pre className="whitespace-pre-wrap text-foreground/80 max-h-40 overflow-y-auto">
{e.version.body}
                        </pre>
                      )}
                    </div>
                  </details>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
