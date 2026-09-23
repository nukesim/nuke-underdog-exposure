const DEFAULTS = { drafts: [], settings: { week: "ALL", contest: "ALL" } };

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(["drafts", "settings"]);
  await chrome.storage.local.set({
    drafts: current.drafts || DEFAULTS.drafts,
    settings: current.settings || DEFAULTS.settings
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "NUKE_SAVE_DRAFT") {
    saveDraft(message.draft).then(sendResponse);
    return true;
  }
});

async function saveDraft(draft) {
  if (!draft?.players?.length) return { ok: false, reason: "no_players" };
  const data = await chrome.storage.local.get({ drafts: [] });
  const drafts = data.drafts || [];
  const key = draft.draftId || fingerprint(draft);
  if (drafts.some(d => (d.draftId || fingerprint(d)) === key)) {
    return { ok: true, duplicate: true };
  }
  drafts.unshift({ ...draft, draftId: key, capturedAt: draft.capturedAt || new Date().toISOString() });
  await chrome.storage.local.set({ drafts });
  return { ok: true, duplicate: false };
}

function fingerprint(d) {
  return [d.week, d.contest, ...(d.players || []).map(p => p.name).sort()].join("|");
}
