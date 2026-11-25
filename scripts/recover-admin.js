import Database from 'better-sqlite3'
import path from 'node:path'

// Offline operator action: never exposed as an HTTP route.
function recover(args) {
  if (args.length !== 4 || args[0] !== '--db' || args[2] !== '--user-id' || !path.isAbsolute(args[1]) || !/^[1-9]\d*$/.test(args[3]) || !Number.isSafeInteger(Number(args[3]))) {
    throw new Error('Usage: node scripts/recover-admin.js --db <absolute-path> --user-id <existing-id>')
  }
  const db = new Database(args[1], { fileMustExist: true })
  try {
    db.pragma('busy_timeout = 5000')
    db.transaction(() => {
      if (db.prepare("SELECT COUNT(*) n FROM users WHERE role='admin'").get().n !== 0) throw new Error('Recovery is allowed only when no administrators exist')
      const id = Number(args[3]), user = db.prepare('SELECT role FROM users WHERE id=?').get(id)
      if (!user) throw new Error('User not found')
      db.prepare("UPDATE users SET role='admin' WHERE id=?").run(id)
      db.prepare('INSERT INTO role_audit(actor_id,target_id,old_role,new_role,at) VALUES(NULL,?,?,?,?)').run(id, user.role, 'admin', Date.now())
      db.prepare('INSERT OR IGNORE INTO role_bootstrap(id,completed_at) VALUES(1,?)').run(Date.now())
    }).immediate()
    console.log('Administrator recovered; action recorded in role audit.')
  } finally { db.close() }
}
try { recover(process.argv.slice(2)) } catch (error) { console.error(error.message); process.exitCode = 1 }
