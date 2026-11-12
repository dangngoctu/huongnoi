// API xếp đội cầu lông. Chạy: node server.js  → http://localhost:3000
// Dữ liệu lưu ở data.json: {config:{roster:{players}}, lineups:{id:{...}}, votes:{user:{v:{lineupId:1|-1}}}}
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
// Railway: gắn Volume (vd /data) rồi đặt DATA_FILE=/data/data.json, không thì mỗi lần deploy lại mất dữ liệu
const FILE = process.env.DATA_FILE || path.join(__dirname, "data.json");
if (!fs.existsSync(FILE) && FILE !== path.join(__dirname, "data.json")) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.copyFileSync(path.join(__dirname, "data.json"), FILE); // lần đầu: lấy dữ liệu mẫu trong repo
}
const PAGE = path.join(__dirname, "Xếp đội cầu lông.html");
const SLOTS = { MD1: ["M", "M"], MD2: ["M", "M"], XD1: ["M", "F"], XD2: ["M", "F"], WD: ["F", "F"] };

let data = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, "utf8")) : {};
data = { config: data.config || {}, lineups: data.lineups || {}, votes: data.votes || {} };

function save() {
  // ghi file tạm rồi rename để không bao giờ để data.json ghi dở
  fs.writeFileSync(FILE + ".tmp", JSON.stringify(data, null, 2));
  fs.renameSync(FILE + ".tmp", FILE);
}

const str = (v, max) => typeof v === "string" && v.length <= max;
const isObj = v => v && typeof v === "object" && !Array.isArray(v);

function checkLineup(l, checkPairs = true) {
  if (!isObj(l)) return "Body phải là object";
  if (!str(l.title, 60) || !l.title.trim()) return "title bắt buộc, tối đa 60 ký tự";
  if (l.note != null && !str(l.note, 200)) return "note tối đa 200 ký tự";
  if (l.authorId != null && !str(l.authorId, 60)) return "authorId không hợp lệ";
  if (!checkPairs) return; // đổi tên không bắt kiểm lại cặp (danh sách có thể đã đổi sau khi đăng)
  if (!isObj(l.pairs) || Object.keys(l.pairs).sort().join() !== Object.keys(SLOTS).sort().join())
    return "pairs phải có đúng các cặp " + Object.keys(SLOTS).join(", ");
  const roster = (data.config.roster && data.config.roster.players) || [];
  const seen = new Set();
  for (const [k, g] of Object.entries(SLOTS)) {
    const p = l.pairs[k];
    if (!Array.isArray(p) || p.length !== 2) return `${k} phải gồm 2 người`;
    for (let i = 0; i < 2; i++) {
      const pl = roster.find(x => x.id === p[i]);
      if (!pl) return `${k}: không có người "${p[i]}" trong danh sách`;
      if (pl.g !== g[i]) return `${k}: ${pl.name} sai giới tính cho vị trí này`;
      if (seen.has(p[i])) return `${pl.name} nằm trong nhiều hơn 1 cặp`;
      seen.add(p[i]);
    }
  }
}

function checkRoster(r) {
  if (!isObj(r) || !Array.isArray(r.players)) return "Cần {players: [...]}";
  const ids = new Set();
  for (const p of r.players) {
    if (!isObj(p) || !str(p.id, 40) || !str(p.name, 40) || !p.name.trim() || !["M", "F"].includes(p.g))
      return "Mỗi người cần {id, name, g: 'M'|'F'}";
    if (ids.has(p.id)) return `Trùng id ${p.id}`;
    ids.add(p.id);
  }
}

function checkVote(v) {
  if (!isObj(v) || !isObj(v.v) || !Object.values(v.v).every(x => x === 1 || x === -1))
    return "Cần {v: {lineupId: 1 | -1}}";
}

const send = (res, code, body) => {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
};

function readBody(req) {
  return new Promise((ok, fail) => {
    let s = "";
    req.on("data", c => { s += c; if (s.length > 1e6) { fail(new Error("Body quá lớn")); req.destroy(); } });
    req.on("end", () => { try { ok(s ? JSON.parse(s) : {}); } catch { fail(new Error("JSON không hợp lệ")); } });
  });
}

const newId = () => "l" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function api(req, res, [col, id]) {
  const m = req.method;
  const body = ["POST", "PUT", "PATCH"].includes(m) ? await readBody(req) : null;

  // Toàn bộ dữ liệu (xuất / nhập JSON)
  if (!col) {
    if (m === "GET") return send(res, 200, data);
    if (m === "PUT") {
      if (!isObj(body)) return send(res, 400, { error: "Body phải là object" });
      data = { config: body.config || {}, lineups: body.lineups || {}, votes: body.votes || {} };
      save();
      return send(res, 200, data);
    }
  }

  if (col === "lineups") {
    if (m === "GET" && !id) return send(res, 200, data.lineups);
    if (m === "POST" && !id) {
      const l = { title: body.title, note: body.note || "", pairs: body.pairs, authorId: body.authorId || "", createdAt: Date.now() };
      const err = checkLineup(l);
      if (err) return send(res, 400, { error: err });
      const nid = newId();
      data.lineups[nid] = l; save();
      return send(res, 201, { id: nid, ...l });
    }
    if (!id || !data.lineups[id]) return send(res, 404, { error: "Không tìm thấy đội hình" });
    if (m === "GET") return send(res, 200, { id, ...data.lineups[id] });
    if (m === "PATCH") {
      const l = { ...data.lineups[id] };
      for (const k of ["title", "note", "pairs"]) if (k in body) l[k] = body[k];
      const err = checkLineup(l, "pairs" in body);
      if (err) return send(res, 400, { error: err });
      data.lineups[id] = l; save();
      return send(res, 200, { id, ...l });
    }
    if (m === "DELETE") {
      delete data.lineups[id];
      for (const u of Object.values(data.votes)) if (u.v) delete u.v[id];
      save();
      return res.writeHead(204).end();
    }
  }

  if (col === "votes") {
    if (m === "GET" && !id) return send(res, 200, data.votes);
    if (m === "PUT" && id) {
      const err = checkVote(body);
      if (err) return send(res, 400, { error: err });
      data.votes[id] = { v: body.v }; save();
      return send(res, 200, data.votes[id]);
    }
  }

  if (col === "config" && id === "roster") {
    if (m === "GET") return send(res, 200, data.config.roster || { players: [] });
    if (m === "PUT") {
      const err = checkRoster(body);
      if (err) return send(res, 400, { error: err });
      data.config.roster = { players: body.players }; save();
      return send(res, 200, data.config.roster);
    }
  }

  send(res, 404, { error: "Không có endpoint này" });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  try {
    if (parts[0] === "api") return await api(req, res, parts.slice(1));
    if (url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return fs.createReadStream(PAGE).pipe(res);
    }
    send(res, 404, { error: "Not found" });
  } catch (e) {
    send(res, 400, { error: e.message });
  }
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));
