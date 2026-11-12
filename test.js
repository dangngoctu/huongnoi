// Kiểm tra nhanh API: node test.js (tự bật server ở port 3999, chạy xong khôi phục lại data.json như cũ)
const assert = require("assert");
const fs = require("fs");
const { spawn } = require("child_process");

const orig = fs.readFileSync("data.json");
const srv = spawn(process.execPath, ["server.js"], { env: { ...process.env, PORT: 3999 } });
const call = async (m, u, b) => {
  const r = await fetch("http://localhost:3999/api" + u, { method: m, body: b && JSON.stringify(b) });
  return { s: r.status, j: r.status === 204 ? null : await r.json() };
};
const ok = { MD1: ["p1", "p4"], MD2: ["p5", "p6"], XD1: ["p2", "p8"], XD2: ["p3", "p9"], WD: ["p10", "p7"] };

srv.stdout.once("data", async () => {
  try {
    let r = await call("POST", "/lineups", { title: "T", pairs: ok, authorId: "A" });
    assert.equal(r.s, 201);
    const id = r.j.id;
    assert.equal((await call("POST", "/lineups", { title: "T", pairs: { ...ok, MD2: ["p1", "p6"] } })).s, 400, "1 người 2 cặp");
    assert.equal((await call("POST", "/lineups", { title: "T", pairs: { ...ok, WD: ["p1", "p7"] } })).s, 400, "sai giới tính");
    assert.equal((await call("POST", "/lineups", { title: "T", pairs: { MD1: ok.MD1 } })).s, 400, "thiếu cặp");
    assert.equal((await call("PATCH", "/lineups/" + id, { title: "Mới" })).j.title, "Mới");
    assert.equal((await call("PUT", "/votes/A%20B", { v: { [id]: 1 } })).s, 200);
    assert.equal((await call("PUT", "/votes/A", { v: { [id]: 5 } })).s, 400);
    assert.equal((await call("DELETE", "/lineups/" + id)).s, 204);
    r = await call("GET", "");
    assert.ok(!r.j.lineups[id] && !(id in r.j.votes["A B"].v), "xoá đội hình xoá luôn phiếu");
    console.log("OK");
  } finally {
    srv.kill();
    fs.writeFileSync("data.json", orig);
  }
});
