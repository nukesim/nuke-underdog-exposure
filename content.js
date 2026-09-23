(() => {
  const PLAYER_HINTS = ["QB","RB","WR","TE","K","DST"];
  let timer;

  function clean(s) { return (s || "").replace(/\s+/g, " ").trim(); }

  function detectWeek(text) {
    const m = text.match(/(?:NFL\s*)?Week\s*(\d{1,2})/i);
    return m ? `Week ${m[1]}` : "Unknown";
  }

  function detectContest() {
    const h = [...document.querySelectorAll("h1,h2,h3,[role=heading]")]
      .map(x => clean(x.textContent)).find(t => /draft|nfl|daily/i.test(t) && t.length < 120);
    return h || "Unknown Contest";
  }

  function extractPlayers() {
    const seen = new Map();
    const nodes = [...document.querySelectorAll("body *")];
    for (const el of nodes) {
      const text = clean(el.textContent);
      if (!text || text.length > 90) continue;
      const pos = PLAYER_HINTS.find(p => new RegExp(`(^|\\s)${p}(\\s|$)`).test(text));
      if (!pos) continue;
      const bits = text.split(/\n| · | - /).map(clean).filter(Boolean);
      const candidate = bits.find(x => x.length >= 4 && x.length <= 35 && !PLAYER_HINTS.includes(x));
      if (candidate && /[A-Za-z]/.test(candidate)) seen.set(candidate, { name: candidate, position: pos });
    }
    return [...seen.values()].slice(0, 12);
  }

  function isCompletedDraft(text, players) {
    return players.length >= 5 && /(completed|final roster|draft results|results)/i.test(text);
  }

  async function scan() {
    const body = clean(document.body?.innerText);
    if (!body) return;
    const players = extractPlayers();
    if (!isCompletedDraft(body, players)) return;

    const draftId = location.pathname.match(/drafts?\/([^/?#]+)/i)?.[1] || null;
    chrome.runtime.sendMessage({
      type: "NUKE_SAVE_DRAFT",
      draft: {
        draftId,
        sport: "NFL",
        format: "Daily Draft",
        week: detectWeek(body),
        contest: detectContest(),
        players,
        sourceUrl: location.href,
        capturedAt: new Date().toISOString()
      }
    });
  }

  const observer = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(scan, 800);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(scan, 1500);
})();
