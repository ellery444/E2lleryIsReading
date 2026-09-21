var ElleryReadStatus;
var EllerySummarizeTag;
var ElleryLLM;
var EllerySummaryPreview;

function install() {}

async function startup({ id, version, rootURI }, reason) {
  await Zotero.initializationPromise;
  await Zotero.unlockPromise;
  await Zotero.uiReadyPromise;
  Services.scriptloader.loadSubScript(rootURI + "read-status.js");
  await ElleryReadStatus.init();
  try {
    Services.scriptloader.loadSubScript(rootURI + "llm-client.js");
    Services.scriptloader.loadSubScript(rootURI + "summarize-tag.js");
    await EllerySummarizeTag.init();
  } catch (e) {
    Zotero.logError(e);
  }
  try {
    Services.scriptloader.loadSubScript(rootURI + "summary-preview.js");
    EllerySummaryPreview.init();
  } catch (e) {
    Zotero.logError(e);
  }
}

function onMainWindowLoad({ window }) { EllerySummaryPreview?.attach(window); }
function onMainWindowUnload({ window }) { EllerySummaryPreview?.detach(window); }

async function shutdown({ id, version, rootURI }, reason) {
  if (reason === APP_SHUTDOWN) return;
  try {
    EllerySummaryPreview?.shutdown();
  } catch (e) {
    Zotero.logError(e);
  } finally {
    EllerySummaryPreview = undefined;
  }
  try {
    if (EllerySummarizeTag) await EllerySummarizeTag.shutdown();
  } catch (e) {
    Zotero.logError(e);
  } finally {
    EllerySummarizeTag = undefined;
    ElleryLLM = undefined;
  }
  if (ElleryReadStatus) {
    await ElleryReadStatus.shutdown();
    ElleryReadStatus = undefined;
  }
}

function uninstall() {}
