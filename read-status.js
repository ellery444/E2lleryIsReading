var ElleryReadStatus = {
  pluginID: "e2ery-read-status@ellery444.github.io",
  dataKey: "elleryReadStatus",
  registeredDataKey: null,

  tags: {
    reading: "_ellery_reading",
    read: "_ellery_read",
    highlight: "_ellery_highlight"
  },

  async init() {
    this.registeredDataKey = await Zotero.ItemTreeManager.registerColumn({
      dataKey: this.dataKey,
      label: "(Not)toBE",
      pluginID: this.pluginID,
      width: "44",
      staticWidth: true,
      showInColumnPicker: true,
      zoteroPersist: ["width", "hidden", "sortDirection"],
      dataProvider: (item) => {
    if (!item || !item.isRegularItem()) return "";

    return `${item.id}|${this.getStatus(item)}|${
        this.isHighlighted(item) ? "1" : "0"
    }`;
  },
      renderCell: (index, data, column, isFirstColumn, doc) => {
        const cell = doc.createElement("span");
        cell.className = `cell ${column.className || ""}`;
        cell.style.display = "flex";
        cell.style.alignItems = "center";
        cell.style.justifyContent = "center";
        cell.style.width = "100%";
        cell.style.cursor = "pointer";
        cell.style.userSelect = "none";
        cell.style.fontSize = "16px";

        if (!data || !data.includes("|")) return cell;

        const [itemIDText, status, highlightText] = data.split("|");
        const itemID = Number(itemIDText);
        const highlighted = highlightText === "1";
        doc.defaultView.requestAnimationFrame(() => {
    this.paintRow(doc, index, highlighted);
});
        cell.textContent = this.icon(status);
        cell.title = `${this.label(status)}；L切换R高亮`;

        cell.addEventListener("click", async (event) => {
          event.preventDefault();
          event.stopPropagation();
          await this.cycle(itemID);
        });
        cell.addEventListener("contextmenu", async (event) => {
          event.preventDefault();
          event.stopPropagation();
    await this.toggleHighlight(itemID);
});
        return cell;
      }
    });
  },

  getStatus(item) {
    const tags = new Set((item.getTags() || []).map(x => x.tag));
    if (tags.has(this.tags.read)) return "read";
    if (tags.has(this.tags.reading)) return "reading";
    return "unread";
  },

  isHighlighted(item) {
    const tags = new Set(
        (item.getTags() || []).map(x => x.tag)
    );

    return tags.has(this.tags.highlight);
},

async toggleHighlight(itemID) {
    const item = Zotero.Items.get(itemID);

    if (!item || !item.isRegularItem()) return;

    if (this.isHighlighted(item)) {
        item.removeTag(this.tags.highlight);
    }
    else {
        item.addTag(this.tags.highlight, 0);
    }

    await item.saveTx();

    try {
        const win = Services.wm.getMostRecentWindow("navigator:browser");

        await win?.ZoteroPane?.itemsView?.refresh();
    }
    catch (e) {
        Zotero.logError(e);
    }
},

paintRow(doc, index, highlighted) {
    const row = doc.querySelector(
        `#item-tree-main-default-row-${index}`
    );

    if (!row) return;

    if (highlighted) {
        row.style.setProperty(
            "background-image",
            `linear-gradient(
                180deg,
                transparent 14%,
                rgba(239, 207, 23, 0.59) 14%,
                rgba(232, 199, 16, 0.42) 86%,
                transparent 86%
            )`,
            "important"
        );
    }
    else {
        row.style.removeProperty("background-image");
    }
},

  icon(status) {
    if (status === "read") return "\u25A0";
    if (status === "reading") return "\u25E7";
    return "\u2610";
},

  label(status) {
    if (status === "read") return "finished";
    if (status === "reading") return "reading";
    return "unresloved";
  },

  async cycle(itemID) {
    const item = Zotero.Items.get(itemID);
    if (!item || !item.isRegularItem()) return;

    const current = this.getStatus(item);
    const next = current === "unread" ? "reading" : current === "reading" ? "read" : "unread";

    item.removeTag(this.tags.reading);
    item.removeTag(this.tags.read);
    if (next === "reading") item.addTag(this.tags.reading, 0);
    if (next === "read") item.addTag(this.tags.read, 0);
    await item.saveTx();

    try {
      const win = Services.wm.getMostRecentWindow("navigator:browser");
      await win?.ZoteroPane?.itemsView?.refresh();
    } catch (e) {
      Zotero.logError(e);
    }
  },

  async shutdown() {
    if (this.registeredDataKey) {
      await Zotero.ItemTreeManager.unregisterColumn(this.registeredDataKey);
      this.registeredDataKey = null;
    }
  }
};
