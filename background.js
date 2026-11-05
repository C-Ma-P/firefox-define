const MENU_ID = "define-selection";
const MAX_SELECTION_LENGTH = 240;
const API_BASE = "https://en.wiktionary.org/api/rest_v1/page/definition/";

browser.runtime.onInstalled.addListener(async () => {
  await browser.contextMenus.removeAll();
  browser.contextMenus.create({
    id: MENU_ID,
    title: "Define",
    contexts: ["selection"],
  });
});

browser.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab?.id) {
    return;
  }

  await defineTerm(tab.id, info.selectionText ?? "");
});

browser.commands.onCommand.addListener(async (command, tab) => {
  if (command !== "define-selection" || !tab?.id) {
    return;
  }

  try {
    const [{ result: selectionText = "" } = {}] = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      func: getSelectedText,
    });

    await defineTerm(tab.id, selectionText);
  } catch (error) {
    // Restricted pages such as about: pages and the built-in PDF viewer do not allow injection.
    console.warn("Define: unable to read selection on this page", error);
  }
});

function getSelectedText() {
  const active = document.activeElement;

  if (
    active &&
    (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) &&
    typeof active.selectionStart === "number" &&
    typeof active.selectionEnd === "number" &&
    active.selectionEnd > active.selectionStart
  ) {
    return active.value.slice(active.selectionStart, active.selectionEnd);
  }

  return window.getSelection()?.toString() ?? "";
}

async function defineTerm(tabId, rawSelection) {
  const term = normalizeSelection(rawSelection);
  if (!term) {
    return;
  }

  if (term.length > MAX_SELECTION_LENGTH) {
    await render(tabId, term, {
      state: "error",
      message: `Selection is too long to treat as a dictionary term (${term.length} characters).`,
    });
    return;
  }

  // Show something immediately; don't leave the user wondering whether the command worked.
  try {
    await render(tabId, term, { state: "loading" });
  } catch (error) {
    // Restricted pages such as about: pages do not allow script injection.
    console.warn("Define: unable to open popup on this page", error);
    return;
  }

  try {
    const response = await fetch(API_BASE + encodeURIComponent(term), {
      headers: {
        "Accept": "application/json",
      },
    });

    if (response.status === 404) {
      await render(tabId, term, {
        state: "not-found",
        sourceUrl: wiktionaryUrl(term),
      });
      return;
    }

    if (!response.ok) {
      throw new Error(`Wiktionary returned HTTP ${response.status}`);
    }

    const data = await response.json();
    const entries = extractEnglishEntries(data);

    if (!entries.length) {
      await render(tabId, term, {
        state: "not-found",
        sourceUrl: wiktionaryUrl(term),
      });
      return;
    }

    await render(tabId, term, {
      state: "ready",
      entries,
      sourceUrl: wiktionaryUrl(term),
    });
  } catch (error) {
    console.error("Define lookup failed", error);
    await render(tabId, term, {
      state: "error",
      message: "Could not load a definition from Wiktionary.",
      sourceUrl: wiktionaryUrl(term),
    });
  }
}

function normalizeSelection(text) {
  return text.replace(/\s+/g, " ").trim();
}

function wiktionaryUrl(term) {
  return `https://en.wiktionary.org/wiki/${encodeURIComponent(term.replace(/ /g, "_"))}`;
}

function extractEnglishEntries(data) {
  const english = Array.isArray(data?.en) ? data.en : [];
  const entries = [];

  for (const block of english) {
    const definitions = Array.isArray(block?.definitions) ? block.definitions : [];
    const senses = definitions
      .map(item => ({
        definition: typeof item?.definition === "string" ? item.definition : "",
        examples: Array.isArray(item?.examples)
          ? item.examples.filter(example => typeof example === "string").slice(0, 1)
          : [],
      }))
      .filter(item => item.definition)
      .slice(0, 4);

    if (!senses.length) {
      continue;
    }

    entries.push({
      partOfSpeech: typeof block?.partOfSpeech === "string" ? block.partOfSpeech : "",
      senses,
    });

    // A compact popup should not become an entire dictionary page.
    if (entries.length >= 3) {
      break;
    }
  }

  return entries;
}

async function render(tabId, term, result) {
  await browser.scripting.executeScript({
    target: { tabId },
    func: showDefinePopup,
    args: [term, result],
  });
}

// This function is serialized and injected into the page by scripting.executeScript().
// Keep it self-contained: it cannot reference outer-scope variables.
function showDefinePopup(term, result) {
  const HOST_ID = "__firefox_define_popup_host__";
  let host = document.getElementById(HOST_ID);

  if (!host) {
    host = document.createElement("div");
    host.id = HOST_ID;
    host.style.all = "initial";
    host.style.position = "fixed";
    host.style.zIndex = "2147483647";
    host.style.left = "0";
    host.style.top = "0";
    document.documentElement.appendChild(host);

    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        *, *::before, *::after { box-sizing: border-box; }

        .panel {
          width: min(390px, calc(100vw - 24px));
          max-height: min(430px, calc(100vh - 24px));
          overflow: auto;
          padding: 14px 16px 12px;
          border: 1px solid light-dark(rgb(200, 200, 205), rgb(82, 82, 88));
          border-radius: 8px;
          background: light-dark(rgb(255, 255, 255), rgb(43, 42, 51));
          color: light-dark(rgb(21, 20, 26), rgb(251, 251, 254));
          box-shadow:
            0 8px 28px rgb(0 0 0 / 0.22),
            0 1px 3px rgb(0 0 0 / 0.16);
          font: menu;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          font-size: 13px;
          line-height: 1.35;
          color-scheme: light dark;
        }

        .header {
          display: flex;
          align-items: start;
          gap: 10px;
          margin-bottom: 8px;
        }

        .term {
          flex: 1;
          min-width: 0;
          margin: 0;
          font-size: 15px;
          font-weight: 650;
          line-height: 1.25;
          overflow-wrap: anywhere;
        }

        .close {
          appearance: none;
          border: 0;
          border-radius: 5px;
          background: transparent;
          color: inherit;
          width: 28px;
          height: 28px;
          margin: -4px -6px 0 0;
          font: inherit;
          font-size: 18px;
          line-height: 26px;
          cursor: pointer;
        }

        .close:hover {
          background: light-dark(rgb(240, 240, 244), rgb(66, 65, 77));
        }

        .status {
          color: light-dark(rgb(91, 91, 102), rgb(191, 190, 201));
          font-size: 12px;
          padding: 2px 0 5px;
        }

        .entry + .entry {
          border-top: 1px solid light-dark(rgb(224, 224, 230), rgb(72, 71, 82));
          margin-top: 10px;
          padding-top: 10px;
        }

        .pos {
          margin: 0 0 5px;
          color: light-dark(rgb(91, 91, 102), rgb(191, 190, 201));
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 0.02em;
          text-transform: uppercase;
        }

        ol {
          margin: 0;
          padding-left: 1.45em;
        }

        li + li {
          margin-top: 5px;
        }

        .definition {
          overflow-wrap: anywhere;
        }

        .example {
          margin-top: 3px;
          color: light-dark(rgb(91, 91, 102), rgb(191, 190, 201));
          font-size: 12px;
          font-style: italic;
        }

        .footer {
          display: flex;
          justify-content: flex-end;
          margin-top: 10px;
          padding-top: 8px;
          border-top: 1px solid light-dark(rgb(224, 224, 230), rgb(72, 71, 82));
          font-size: 10.5px;
        }

        .source {
          color: light-dark(rgb(0, 97, 224), rgb(128, 180, 255));
          text-decoration: none;
        }

        .source:hover {
          text-decoration: underline;
        }
      </style>
      <section class="panel" role="dialog" aria-label="Definition">
        <div class="header">
          <h2 class="term"></h2>
          <button class="close" type="button" aria-label="Close">×</button>
        </div>
        <div class="body"></div>
      </section>
    `;

    shadow.querySelector(".close").addEventListener("click", () => host.remove());

    const onKeyDown = event => {
      if (event.key === "Escape") {
        host.remove();
        document.removeEventListener("keydown", onKeyDown, true);
      }
    };
    document.addEventListener("keydown", onKeyDown, true);

    const onPointerDown = event => {
      if (!event.composedPath().includes(host)) {
        host.remove();
        document.removeEventListener("pointerdown", onPointerDown, true);
      }
    };
    // Delay so the context-menu click itself can't immediately dismiss the popup.
    setTimeout(() => document.addEventListener("pointerdown", onPointerDown, true), 0);
  }

  const shadow = host.shadowRoot;
  shadow.querySelector(".term").textContent = term;
  const body = shadow.querySelector(".body");
  body.replaceChildren();

  const htmlToText = html => {
    const template = document.createElement("template");
    template.innerHTML = html;
    return template.content.textContent?.replace(/\s+/g, " ").trim() ?? "";
  };

  const makeStatus = text => {
    const node = document.createElement("div");
    node.className = "status";
    node.textContent = text;
    body.appendChild(node);
  };

  if (result.state === "loading") {
    makeStatus("Looking up definition…");
  } else if (result.state === "not-found") {
    makeStatus("No English Wiktionary entry found for this selection.");
  } else if (result.state === "error") {
    makeStatus(result.message || "Could not load definition.");
  } else if (result.state === "ready") {
    for (const entry of result.entries) {
      const section = document.createElement("section");
      section.className = "entry";

      if (entry.partOfSpeech) {
        const pos = document.createElement("div");
        pos.className = "pos";
        pos.textContent = entry.partOfSpeech;
        section.appendChild(pos);
      }

      const list = document.createElement("ol");
      for (const sense of entry.senses) {
        const item = document.createElement("li");

        const definition = document.createElement("div");
        definition.className = "definition";
        definition.textContent = htmlToText(sense.definition);
        item.appendChild(definition);

        if (sense.examples?.length) {
          const example = document.createElement("div");
          example.className = "example";
          example.textContent = htmlToText(sense.examples[0]);
          item.appendChild(example);
        }

        list.appendChild(item);
      }

      section.appendChild(list);
      body.appendChild(section);
    }
  }

  if (result.sourceUrl && result.state !== "loading") {
    const footer = document.createElement("div");
    footer.className = "footer";

    const source = document.createElement("a");
    source.className = "source";
    source.href = result.sourceUrl;
    source.target = "_blank";
    source.rel = "noreferrer";
    source.textContent = "Wiktionary";

    footer.appendChild(source);
    body.appendChild(footer);
  }

  // Anchor close to the user's selection, similar to a browser selection panel.
  const selection = window.getSelection();
  let rect = null;
  if (selection && selection.rangeCount > 0) {
    rect = selection.getRangeAt(0).getBoundingClientRect();
  }

  const margin = 12;
  const gap = 8;
  const panel = shadow.querySelector(".panel");

  // First place it offscreen so dimensions are available without a flash at (0,0).
  host.style.visibility = "hidden";
  host.style.left = "0px";
  host.style.top = "0px";

  requestAnimationFrame(() => {
    const popupRect = panel.getBoundingClientRect();

    const anchorLeft = rect && rect.width > 0 ? rect.left : window.innerWidth / 2;
    const anchorBottom = rect && rect.height > 0 ? rect.bottom : window.innerHeight / 2;

    let left = anchorLeft;
    let top = anchorBottom + gap;

    if (left + popupRect.width > window.innerWidth - margin) {
      left = window.innerWidth - popupRect.width - margin;
    }
    if (left < margin) {
      left = margin;
    }

    if (top + popupRect.height > window.innerHeight - margin) {
      const above = (rect && rect.height > 0 ? rect.top : window.innerHeight / 2) - popupRect.height - gap;
      top = Math.max(margin, above);
    }

    host.style.left = `${Math.round(left)}px`;
    host.style.top = `${Math.round(top)}px`;
    host.style.visibility = "visible";
  });
}
