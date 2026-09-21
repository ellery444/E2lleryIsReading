var EllerySummarizeTag = {
  pluginID: "e2ery-read-status@ellery444.github.io",
  registeredMenuID: null,
  settingsMenuID: null,
  active: false,
  pending: new Map(),

  async init() {
    this.active = true;
    if (this.registeredMenuID) return;
    this.registeredMenuID = await Zotero.MenuManager.registerMenu({
      menuID: "ellery-summarize-tag",
      pluginID: this.pluginID,
      target: "main/library/item",
      menus: [{
        menuType: "menuitem",
        onShowing: (event, context) => {
          context.menuElem.label = "Summarize & Tag";
        },
        onCommand: (event, context) => this.summarizeSelectedItem(event, context)
      }]
    });
    if (!this.registeredMenuID) {
      throw new Error("Unable to register Summarize & Tag menu");
    }
    this.settingsMenuID = await Zotero.MenuManager.registerMenu({
      menuID: "ellery-deepseek-settings",
      pluginID: this.pluginID,
      target: "main/menubar/tools",
      menus: [{
        menuType: "menuitem",
        onShowing: (event, context) => { context.menuElem.label = "Summarize & Tag — DeepSeek 设置"; },
        onCommand: async (event, context) => {
          const win = context.menuElem.ownerGlobal;
          try { await ElleryLLM.configure(win); }
          catch (e) { Zotero.alert(win, "DeepSeek 设置", "密钥保存失败，请检查 Zotero 登录存储是否可用。"); }
        }
      }]
    });
  },

  async summarizeSelectedItem(event, context) {
    const win = context?.menuElem?.ownerGlobal
      || event?.target?.ownerGlobal
      || Zotero.getMainWindow();
    let itemID, progress, timer;
    try {
      if (!this.active) return;
      // Resolve the selection at click time in the window that opened the menu.
      const items = win?.ZoteroPane?.getSelectedItems() ?? context?.items ?? [];
      if (!items.length) {
        Zotero.alert(win, "Summarize & Tag", "请先在文献列表中选中一篇文献。");
        return;
      }
      if (items.length !== 1) {
        Zotero.alert(win, "Summarize & Tag", "当前仅支持单篇文献，请只选中一篇文献后重试。");
        return;
      }
      const item = items[0];
      if (!item.isRegularItem()) {
        Zotero.alert(win, "Summarize & Tag", "请选择文献条目，而不是附件或笔记。");
        return;
      }

      const title = item.getField("title") || "";
      const abstract = item.getField("abstractNote") || "";
      if (item.deleted || !item.isEditable()) throw new Error("请选择一篇可编辑且未删除的文献。");
      if (!title.trim() || !abstract.trim()) throw new Error("请先补充文献标题和摘要，再生成总结。");
      if (title.length + abstract.length > 30000) throw new Error("标题和摘要过长，请检查文献元数据后重试。");
      if (this.pending.has(item.id)) throw new Error("这篇文献正在分析，请等待完成。");
      itemID = item.id;
      const controller = new win.AbortController();
      this.pending.set(itemID, controller);
      let apiKey;
      try {
        if (!ElleryLLM.getLogin() && !await ElleryLLM.configure(win)) return;
        apiKey = ElleryLLM.getLogin()?.password;
      } catch (e) { throw new Error("无法读取或保存 API Key，请通过工具菜单重新配置。"); }
      if (!apiKey || !this.active) return;
      progress = new Zotero.ProgressWindow({ window: win });
      progress.changeHeadline("Summarize & Tag");
      progress.addDescription("正在请求 DeepSeek，完成后会保存总结和标签……");
      progress.show();
      timer = win.setTimeout(() => controller.abort(), 60000);
      const result = await ElleryLLM.summarize(win, title, abstract, apiKey, controller.signal);
      if (!this.active || controller.signal.aborted) return;
      await this.saveResult(itemID, title, abstract, result);
      progress.close();
      Zotero.alert(win, "Summarize & Tag", `已保存总结笔记，并合并 ${result.tags.length} 个推荐标签。\n再次执行会新增一条总结笔记。`);
    } catch (e) {
      // Do not log request objects or credentials.
      if (this.active) Zotero.alert(win, "Summarize & Tag", e.message || "生成或保存失败，请重试。");
    } finally {
      if (timer) win.clearTimeout(timer);
      if (progress) progress.close();
      if (itemID !== undefined) this.pending.delete(itemID);
    }
  },

  async saveResult(itemID, title, abstract, result) {
    const escapeHTML = text => text.replace(/[&<>"']/g, ch => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[ch]);
    let item;
    try {
      await Zotero.DB.executeTransaction(async () => {
        item = Zotero.Items.get(itemID);
        if (!this.active || !item || item.deleted || !item.isRegularItem() || !item.isEditable()) {
          throw new Error("原文献已不可编辑，本次未保存。");
        }
        if (item.getField("title") !== title || item.getField("abstractNote") !== abstract) {
          throw new Error("分析期间标题或摘要发生变化，请重新执行。");
        }
        const note = new Zotero.Item("note");
        note.libraryID = item.libraryID;
        note.parentID = item.id;
        note.setNote(`<h2>Summary — ${escapeHTML(title)}</h2><p>${escapeHTML(result.summary)}</p>`
          + `<p>推荐标签：${escapeHTML(result.tags.join(", "))}</p>`
          + `<p>仅基于标题与摘要生成 · ${ElleryLLM.model} · ${new Date().toISOString()}</p>`);
        await note.save();
        const existing = new Set(item.getTags().map(entry => entry.tag.toLowerCase()));
        for (const tag of result.tags) {
          if (!existing.has(tag.toLowerCase())) item.addTag(tag, 1);
        }
        await item.save();
      });
    } catch (e) {
      // Restore cached tags if the transaction failed after in-memory mutation.
      if (item) {
        try { await item.reload(["tags"], true); } catch (_) { /* Original failure takes precedence. */ }
      }
      throw e;
    }
  },

  async shutdown() {
    this.active = false;
    for (const controller of this.pending.values()) controller.abort();
    if (this.settingsMenuID) {
      await Zotero.MenuManager.unregisterMenu(this.settingsMenuID);
      this.settingsMenuID = null;
    }
    if (this.registeredMenuID) {
      await Zotero.MenuManager.unregisterMenu(this.registeredMenuID);
      this.registeredMenuID = null;
    }
  }
};
