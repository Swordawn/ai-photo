const Database = require('better-sqlite3');
const db = new Database('data.db');
console.log('=== registrations ===');
try { const rows = db.prepare("SELECT * FROM registrations ORDER BY id DESC LIMIT 20").all(); rows.forEach(r => console.log(JSON.stringify(r))); } catch(e) { console.log('Error:', e.message); }
console.log('=== photos ===');
try { const rows = db.prepare("SELECT * FROM photos ORDER BY id DESC LIMIT 20").all(); rows.forEach(r => console.log(JSON.stringify(r))); } catch(e) { console.log('Error:', e.message); }
console.log('=== stats ===');
try { const t1 = db.prepare("SELECT COUNT(*) as c FROM registrations").get(); const t2 = db.prepare("SELECT COUNT(*) as c FROM registrations WHERE used=0").get(); const t3 = db.prepare("SELECT COUNT(*) as c FROM photos").get(); console.log("registrations:", t1.c, "unused:", t2.c); console.log("photos:", t3.c); } catch(e) { console.log('Error:', e.message); }
db.close();