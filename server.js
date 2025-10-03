/*
Improved VPS Control Panel scaffold
- On first run, if ADMIN_PASS_PROVISION is set in .env, the server will create an 'admin' record with a bcrypt-hashed password.
- Uses express-session with SQLite store (connect-sqlite3).
- Adds basic Helmet and rate-limiting.
- WARNING: Running arbitrary shell commands from web is dangerous. Sandbox in production.
*/

const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const bcrypt = require('bcrypt');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const csrf = require('csurf');
const validator = require('validator');
require('dotenv').config();

const PORT = process.env.PORT || 3001;
const PROJECT_DIR = __dirname;

const app = express();
app.use(helmet());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname,'public')));

// rate limit
const limiter = rateLimit({ windowMs: 15*60*1000, max: 200 });
app.use(limiter);

// session store
app.use(session({
  store: new SQLiteStore({ db: 'sessions.sqlite', dir: PROJECT_DIR }),
  secret: process.env.SESSION_SECRET || 'change_this_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // set true if using HTTPS
}));

// DB init
const DB_PATH = path.join(__dirname, 'panel.db');
const db = new sqlite3.Database(DB_PATH);
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS admins (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password_hash TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, allowed_root INTEGER DEFAULT 0, allowed_resource TEXT DEFAULT '')`);
  db.run(`CREATE TABLE IF NOT EXISTS instances (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, name TEXT, resources TEXT)`);
});

// Provision admin if ADMIN_PASS_PROVISION present
const ADMIN_USER_ENV = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS_PROVISION = process.env.ADMIN_PASS_PROVISION;
if(ADMIN_PASS_PROVISION){
  db.get('SELECT * FROM admins WHERE username = ?', [ADMIN_USER_ENV], (err,row)=>{
    if(err) return console.error(err);
    if(!row){
      const saltRounds = 12;
      bcrypt.hash(ADMIN_PASS_PROVISION, saltRounds).then(hash=>{
        db.run('INSERT INTO admins (username, password_hash) VALUES (?,?)', [ADMIN_USER_ENV, hash], (e)=>{
          if(e) console.error('Error provisioning admin:', e.message);
          else console.log('Admin user provisioned:', ADMIN_USER_ENV);
        });
      }).catch(e=>console.error(e));
    } else {
      console.log('Admin already exists; skipping provisioning.');
    }
  });
}

// Middleware helpers
function requireAdmin(req, res, next){
  if(req.session && req.session.adminId) return next();
  return res.status(401).json({error:'unauthorized'});
}

// Admin login (check hashed password)
app.post('/api/admin/login', (req,res)=>{
  const {username, password} = req.body;
  if(!username || !password) return res.status(400).json({error:'missing'});
  db.get('SELECT * FROM admins WHERE username = ?', [username], (err,row)=>{
    if(err) return res.status(500).json({error:err.message});
    if(!row) return res.status(401).json({error:'invalid'});
    bcrypt.compare(password, row.password_hash).then(match=>{
      if(match){ req.session.adminId = row.id; return res.json({ok:true}); }
      return res.status(401).json({error:'invalid'});
    }).catch(e=>res.status(500).json({error:String(e)}));
  });
});

// Create admin (protected)
app.post('/api/admin/create', requireAdmin, (req,res)=>{
  const {username, password} = req.body;
  if(!username || !password) return res.status(400).json({error:'missing'});
  if(!validator.isAlphanumeric(username)) return res.status(400).json({error:'invalid username'});
  bcrypt.hash(password, 12).then(hash=>{
    db.run('INSERT INTO admins (username, password_hash) VALUES (?,?)', [username, hash], function(err){
      if(err) return res.status(500).json({error:err.message});
      res.json({id:this.lastID});
    });
  });
});

// Admin: create user
app.post('/api/admin/users', requireAdmin, (req,res)=>{
  const {username, allowed_root, allowed_resource} = req.body;
  if(!username) return res.status(400).json({error:'missing'});
  if(!validator.isAlphanumeric(username)) return res.status(400).json({error:'invalid username'});
  db.run(`INSERT INTO users (username, allowed_root, allowed_resource) VALUES (?, ?, ?)`, [username, allowed_root?1:0, allowed_resource||''], function(err){
    if(err) return res.status(500).json({error:err.message});
    res.json({id:this.lastID});
  });
});

// Admin: list users
app.get('/api/admin/users', requireAdmin, (req,res)=>{
  db.all(`SELECT * FROM users`, [], (err,rows)=> {
    if(err) return res.status(500).json({error:err.message});
    res.json(rows);
  });
});

// Admin: create instance for user
app.post('/api/admin/instances', requireAdmin, (req,res)=>{
  const {user_id, name, resources} = req.body;
  if(!user_id || !name) return res.status(400).json({error:'missing'});
  db.run(`INSERT INTO instances (user_id, name, resources) VALUES (?, ?, ?)`, [user_id, name, resources||''], function(err){
    if(err) return res.status(500).json({error:err.message});
    res.json({id:this.lastID});
  });
});

// User login (simple by username)
app.post('/api/user/login', (req,res)=>{
  const {username} = req.body;
  if(!username) return res.status(400).json({error:'missing'});
  db.get(`SELECT * FROM users WHERE username = ?`, [username], (err,row)=>{
    if(err) return res.status(500).json({error:err.message});
    if(!row) return res.status(404).json({error:'not found'});
    req.session.user = row;
    res.json({ok:true,user:row});
  });
});

// User: list their instances
app.get('/api/user/instances', (req,res)=>{
  if(!req.session.user) return res.status(401).json({error:'login required'});
  db.all(`SELECT * FROM instances WHERE user_id = ?`, [req.session.user.id], (err,rows)=>{
    if(err) return res.status(500).json({error:err.message});
    res.json(rows);
  });
});

// User: execute command on their instance (EXTREMELY powerful)
app.post('/api/user/exec', (req,res)=>{
  if(!req.session.user) return res.status(401).json({error:'login required'});
  const {command} = req.body;
  if(!command || typeof command !== 'string') return res.status(400).json({error:'missing command'});
  // Basic validation: reject dangerous characters (still not secure)
  if(command.includes('rm') || command.includes('shutdown') || command.includes('reboot')) {
    return res.status(400).json({error:'command blocked by policy'});
  }
  exec(command, {timeout: 60*1000, maxBuffer: 10*1024*1024}, (err, stdout, stderr)=>{
    if(err){
      return res.json({ok:false, error: String(err), stdout, stderr});
    }
    res.json({ok:true, stdout, stderr});
  });
});

// Serve admin and user panels
app.get('/admin', (req,res)=> res.sendFile(path.join(__dirname,'public','admin.html')));
app.get('/user', (req,res)=> res.sendFile(path.join(__dirname,'public','user.html')));

app.listen(PORT, ()=> {
  console.log("VPS Control Panel running on port", PORT);
});
