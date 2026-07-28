
const Database = require("better-sqlite3");
const { existsSync, readdirSync } = require("fs");
const { join } = require("path");
const db = new Database("./database.sqlite");
const dir = join(__dirname, "uploads", "已完成照片");

const photos = db.prepare("SELECT id, filename, type FROM photos").all();
let fixed = 0;
for (const p of photos) {
  if (!p.filename.startsWith("http")) continue;
  const isAi = p.type === "ai";
  const prefix = isAi ? "ai_" : "original_";
  try {
    const files = readdirSync(dir).filter(f => f.startsWith(prefix) && f.endsWith(".jpg")).sort().reverse();
    if (files.length > 0) {
      const localPath = "/uploads/已完成照片/" + files[0];
      db.prepare("UPDATE photos SET filename = ? WHERE id = ?").run(localPath, p.id);
      console.log("Fixed photo " + p.id + ": " + localPath);
      fixed++;
    }
  } catch(e) { console.error("Error:", e.message); }
}
console.log("Total fixed: " + fixed);
db.close();
