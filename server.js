require("dotenv").config();
const express=require("express"),helmet=require("helmet"),cors=require("cors"),rateLimit=require("express-rate-limit"),bcrypt=require("bcryptjs"),jwt=require("jsonwebtoken"),Database=require("better-sqlite3"),path=require("path");
const app=express(),PORT=process.env.PORT||3000,DB_FILE=process.env.DB_FILE||"jetfx.sqlite";
if(!process.env.JWT_SECRET||process.env.JWT_SECRET.length<32)throw new Error("Set a random JWT_SECRET of at least 32 characters in .env");
if(!process.env.ADMIN_EMAIL||!process.env.ADMIN_PASSWORD)throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD in .env");
const db=new Database(DB_FILE);db.pragma("journal_mode = WAL");db.pragma("foreign_keys = ON");
db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'customer',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS accounts(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),balance REAL NOT NULL DEFAULT 25000,equity REAL NOT NULL DEFAULT 25000,daily_pnl REAL NOT NULL DEFAULT 0,currency TEXT NOT NULL DEFAULT 'USD');
CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL REFERENCES users(id),symbol TEXT NOT NULL,side TEXT NOT NULL,volume REAL NOT NULL,price REAL NOT NULL,status TEXT NOT NULL DEFAULT 'DEMO',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS audit_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,action TEXT NOT NULL,detail TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
`);
const adminEmail=process.env.ADMIN_EMAIL.toLowerCase();
if(!db.prepare("SELECT id FROM users WHERE email=?").get(adminEmail)){
 const hash=bcrypt.hashSync(process.env.ADMIN_PASSWORD,12);
 const info=db.prepare("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,'admin')").run("JetFx Administrator",adminEmail,hash);
 db.prepare("INSERT INTO accounts(user_id,balance,equity) VALUES(?,0,0)").run(info.lastInsertRowid);
}
app.use(helmet({contentSecurityPolicy:false}));app.use(cors({origin:process.env.CORS_ORIGIN||false}));app.use(express.json({limit:"30kb"}));app.use(rateLimit({windowMs:15*60*1000,limit:250,standardHeaders:true,legacyHeaders:false}));
app.use(express.static(path.join(__dirname,"public")));
const sign=u=>jwt.sign({id:u.id,email:u.email,role:u.role},process.env.JWT_SECRET,{expiresIn:"8h"});
function auth(req,res,next){try{const h=req.headers.authorization||"";const p=jwt.verify(h.replace(/^Bearer\s+/i,""),process.env.JWT_SECRET);req.user=p;next()}catch(e){res.status(401).json({error:"Unauthorized. Please sign in again."})}}
function admin(req,res,next){if(req.user.role!=="admin")return res.status(403).json({error:"Administrator access required"});next()}
function audit(user,action,detail=""){db.prepare("INSERT INTO audit_logs(user_id,action,detail) VALUES(?,?,?)").run(user,action,detail)}
const publicUser=u=>({id:u.id,name:u.name,email:u.email,role:u.role,createdAt:u.created_at});
app.post("/api/auth/register",async(req,res)=>{try{const name=String(req.body.name||"").trim(),email=String(req.body.email||"").trim().toLowerCase(),password=String(req.body.password||"");if(name.length<2||name.length>80)return res.status(400).json({error:"Enter a name between 2 and 80 characters"});if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return res.status(400).json({error:"Enter a valid email address"});if(password.length<10)return res.status(400).json({error:"Password must be at least 10 characters"});const hash=await bcrypt.hash(password,12),create=db.transaction(()=>{const u=db.prepare("INSERT INTO users(name,email,password_hash) VALUES(?,?,?)").run(name,email,hash);db.prepare("INSERT INTO accounts(user_id) VALUES(?)").run(u.lastInsertRowid);audit(u.lastInsertRowid,"REGISTER","Demo customer account created");return db.prepare("SELECT * FROM users WHERE id=?").get(u.lastInsertRowid)});const u=create();res.status(201).json({token:sign(u),user:publicUser(u),mode:"demo"});}catch(e){res.status(400).json({error:e.code==="SQLITE_CONSTRAINT_UNIQUE"?"An account with that email already exists":"Could not create account"})}});
app.post("/api/auth/login",async(req,res)=>{const email=String(req.body.email||"").trim().toLowerCase(),u=db.prepare("SELECT * FROM users WHERE email=?").get(email);if(!u||!(await bcrypt.compare(String(req.body.password||""),u.password_hash)))return res.status(401).json({error:"Invalid email or password"});audit(u.id,"LOGIN","Customer login");res.json({token:sign(u),user:publicUser(u),mode:"demo"})});
app.get("/api/account",auth,(req,res)=>{const u=db.prepare("SELECT * FROM users WHERE id=?").get(req.user.id),a=db.prepare("SELECT * FROM accounts WHERE user_id=?").get(req.user.id);if(!u||!a)return res.status(404).json({error:"Account not found"});res.json({user:publicUser(u),account:{balance:a.balance,equity:a.equity,dailyPnl:a.daily_pnl,currency:a.currency,mode:"demo"}})});
app.get("/api/quotes",(req,res)=>res.json({mode:"illustrative-demo",quotes:{"XAU/USD":2684.30,"EUR/USD":1.08462,"BTC/USD":68420.50,"NAS100":20112.8}}));
app.get("/api/orders",auth,(req,res)=>res.json({orders:db.prepare("SELECT id,symbol,side,volume,price,status,created_at FROM orders WHERE user_id=? ORDER BY id DESC LIMIT 100").all(req.user.id)}));
app.post("/api/orders",auth,(req,res)=>{const symbol=String(req.body.symbol||""),side=String(req.body.side||"").toLowerCase(),volume=Number(req.body.volume),prices={"XAU/USD":2684.30,"EUR/USD":1.08462,"BTC/USD":68420.50,"NAS100":20112.8};if(!Object.hasOwn(prices,symbol)||!["buy","sell"].includes(side)||!Number.isFinite(volume)||volume<0.01||volume>10)return res.status(400).json({error:"Invalid demo order. Supported volume: 0.01–10 lots."});const info=db.prepare("INSERT INTO orders(user_id,symbol,side,volume,price) VALUES(?,?,?,?,?)").run(req.user.id,symbol,side,volume,prices[symbol]);audit(req.user.id,"DEMO_ORDER",`${side} ${volume} ${symbol}`);res.status(201).json({id:info.lastInsertRowid,status:"DEMO",message:"Simulated order saved. No market execution occurred."})});
app.post("/api/admin/login",async(req,res)=>{const email=String(req.body.email||"").trim().toLowerCase(),u=db.prepare("SELECT * FROM users WHERE email=? AND role='admin'").get(email);if(!u||!(await bcrypt.compare(String(req.body.password||""),u.password_hash)))return res.status(401).json({error:"Invalid administrator credentials"});res.json({token:sign(u)})});
app.get("/api/admin/overview",auth,admin,(req,res)=>{const users=db.prepare("SELECT COUNT(*) n FROM users WHERE role='customer'").get().n,orders=db.prepare("SELECT COUNT(*) n FROM orders").get().n,latestOrders=db.prepare("SELECT orders.symbol,orders.side,orders.volume,orders.created_at,users.email FROM orders JOIN users ON users.id=orders.user_id ORDER BY orders.id DESC LIMIT 30").all();res.json({users,orders,latestOrders})});
app.get("/api/health",(req,res)=>res.json({status:"ok",mode:"demo",time:new Date().toISOString()}));
app.get("/admin",(req,res)=>res.sendFile(path.join(__dirname,"public","admin.html")));
app.use((err,req,res,next)=>{console.error(err);res.status(500).json({error:"Internal server error"})});
app.listen(PORT,()=>console.log(`JetFx demo server listening on port ${PORT}`));
