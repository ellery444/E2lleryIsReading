var ElleryReadStatus;

function install() {}

async function startup({ id, version, rootURI }, reason) {
  await Zotero.initializationPromise;
  await Zotero.unlockPromise;
  await Zotero.uiReadyPromise;
  Services.scriptloader.loadSubScript(rootURI + "read-status.js");
  await ElleryReadStatus.init();
}

function onMainWindowLoad({ window }) {}
function onMainWindowUnload({ window }) {}

async function shutdown({ id, version, rootURI }, reason) {
  if (reason === APP_SHUTDOWN) return;
  if (ElleryReadStatus) {
    await ElleryReadStatus.shutdown();
    ElleryReadStatus = undefined;
  }
}

function uninstall() {}
