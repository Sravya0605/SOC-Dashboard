export function startChangeStream(alerts, io) {
  let stream;
  let buffer = [];

  setInterval(() => {
    if (buffer.length) {
      io.emit("alerts_batch", buffer);
      buffer = [];
    }
  }, 1000);

  async function init() {
    try {
      if (stream) await stream.close();

      stream = alerts.watch([], { fullDocument: "updateLookup" });

      stream.on("change", change => {
        if (change.fullDocument?.severity) buffer.push(change.fullDocument);
      });

      stream.on("error", () => setTimeout(init, 5000));
    } catch {
      setTimeout(init, 5000);
    }
  }

  init();
}