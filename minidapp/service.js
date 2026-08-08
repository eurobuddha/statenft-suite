/* Atelier background service — drives unfinished mints AND whole-collection
 * send queues on every new block, so both keep running with the page closed. */

MDS.load("engine.js");
MDS.load("sendall.js");

var SERVICE_BUSY = false;

function serviceTick() {
  if (SERVICE_BUSY) { return; }
  SERVICE_BUSY = true;
  engineTick(function () {
    sendTick(function () { SERVICE_BUSY = false; });
  });
}

MDS.init(function (msg) {
  if (msg.event === "inited") {
    engineInitTables(function () {
      sendInitTable(function () {
        MDS.log("Atelier service ready");
        engineAdopt(function () { serviceTick(); });
      });
    });
  } else if (msg.event === "NEWBLOCK") {
    serviceTick();
  } else if (msg.event === "NEWBALANCE") {
    engineAdopt(function () {});
  } else if (msg.event === "MDSCOMMS" || msg.event === "MDS_COMMS" ||
             msg.event === "COMMS") {
    // page nudges us right after creating a collection or queueing a send
    serviceTick();
  }
});
