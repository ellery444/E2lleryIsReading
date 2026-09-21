var EllerySummaryPreview = {
  windows: new Map(),
  observerID: null,

  init() {
    for (const win of Zotero.getMainWindows()) this.attach(win);
    this.observerID = Zotero.Notifier.registerObserver({
      notify: () => { for (const state of this.windows.values()) state.hide(); }
    }, ["item"], "ellery-summary-preview");
  },

  shorten(text) {
    const chars = Array.from(text.replace(/\s+/g, " ").trim());
    return chars.length > 100 ? chars.slice(0, 100).join("") + "…" : chars.join("");
  },

  async getPreview(item, win) {
    const notes = await Zotero.Items.getAsync(item.getNotes());
    // Use the newest summary note, including manually edited and legacy notes.
    notes.sort((a, b) => String(b.dateAdded).localeCompare(String(a.dateAdded)) || b.id - a.id);
    for (const note of notes) {
      if (note.deleted || !note.isNote()) continue;
      const doc = new win.DOMParser().parseFromString(note.getNote(), "text/html");
      const heading = doc.querySelector("h2");
      if (!/^(?:AI )?Summary — /u.test(heading?.textContent.trim() || "")) continue;
      const paragraphs = [];
      for (let node = heading.nextElementSibling; node; node = node.nextElementSibling) {
        const text = node.textContent.trim();
        if (text.startsWith("推荐标签：") || text.startsWith("仅基于标题与摘要生成")) break;
        if (node.localName === "p") paragraphs.push(text);
      }
      const preview = this.shorten(paragraphs.join(" "));
      if (preview) return preview;
    }
    return "";
  },

  itemAt(win, target) {
    const row = target?.closest?.('[id^="item-tree-main-"][id*="-row-"]');
    const match = row?.id.match(/-row-(\d+)$/);
    if (!match) return null;
    const treeRow = win.ZoteroPane?.itemsView?.getRow(Number(match[1]));
    const item = treeRow?.ref;
    return treeRow?.isObjectRow && item?.isRegularItem() && !item.deleted ? item : null;
  },

  attach(win) {
    if (this.windows.has(win)) return;
    const doc = win.document;
    const panel = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
    panel.setAttribute("role", "tooltip");
    panel.style.cssText = "position:fixed;z-index:2147483647;pointer-events:none;display:none;"
      + "max-width:360px;padding:12px 14px;border:1px solid GrayText;border-radius:8px;"
      + "background:Canvas;color:CanvasText;box-shadow:0 4px 16px #0005;"
      + "font:14px/1.6 sans-serif;white-space:normal;overflow-wrap:anywhere;";
    doc.documentElement.appendChild(panel);
    let currentID = null, timer = null, generation = 0, x = 0, y = 0;
    const hide = () => {
      generation++;
      currentID = null;
      if (timer !== null) win.clearTimeout(timer);
      timer = null;
      panel.style.display = "none";
    };
    const move = event => {
      const item = this.itemAt(win, event.target);
      x = event.clientX;
      y = event.clientY;
      if (!item || event.buttons) { hide(); return; }
      if (currentID === item.id) return;
      hide();
      currentID = item.id;
      const token = generation;
      timer = win.setTimeout(async () => {
        timer = null;
        try {
          const text = await this.getPreview(item, win);
          // Rows are recycled on scroll/sort. Recheck the item beneath the pointer.
          if (generation !== token || !text
            || this.itemAt(win, doc.elementFromPoint(x, y))?.id !== item.id) return;
          panel.textContent = `总结\n${text}`;
          panel.style.whiteSpace = "pre-wrap";
          panel.style.display = "block";
          const rect = panel.getBoundingClientRect();
          panel.style.left = `${Math.max(8, Math.min(x + 16, win.innerWidth - rect.width - 8))}px`;
          panel.style.top = `${Math.max(8, y + rect.height + 24 < win.innerHeight
            ? y + 20 : y - rect.height - 12)}px`;
        } catch (e) { Zotero.logError(e); }
      }, 450);
    };
    const leave = event => { if (!event.relatedTarget) hide(); };
    const listeners = [
      [doc, "mousemove", move], [doc, "mouseout", leave],
      [doc, "scroll", hide], [doc, "wheel", hide], [doc, "mousedown", hide],
      [doc, "contextmenu", hide], [doc, "keydown", hide], [win, "blur", hide],
      [win, "resize", hide]
    ];
    for (const [target, name, handler] of listeners) target.addEventListener(name, handler, true);
    this.windows.set(win, { hide, panel, listeners });
  },

  detach(win) {
    const state = this.windows.get(win);
    if (!state) return;
    state.hide();
    for (const [target, name, handler] of state.listeners) target.removeEventListener(name, handler, true);
    state.panel.remove();
    this.windows.delete(win);
  },

  shutdown() {
    if (this.observerID !== null) Zotero.Notifier.unregisterObserver(this.observerID);
    this.observerID = null;
    for (const win of this.windows.keys()) this.detach(win);
  }
};
