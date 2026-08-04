/* StateNFT background service — drives unfinished mints on every new block,
 * so collections keep minting with the page closed. */

MDS.load("engine.js");

var SERVICE_BUSY = false;

function serviceTick() {
  if (SERVICE_BUSY) { return; }
  SERVICE_BUSY = true;
  engineTick(function () { SERVICE_BUSY = false; });
}

MDS.init(function (msg) {
  if (msg.event === "inited") {
    engineInitTables(function () {
      MDS.log("StateNFT service ready");
      engineAdopt(function () { serviceTick(); });
    });
  } else if (msg.event === "NEWBLOCK") {
    serviceTick();
  } else if (msg.event === "NEWBALANCE") {
    engineAdopt(function () {});
  } else if (msg.event === "MDSCOMMS" || msg.event === "MDS_COMMS" ||
             msg.event === "COMMS") {
    // page nudges us right after creating a collection
    serviceTick();
  }
});
