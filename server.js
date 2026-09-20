import express from "express";
import OpenAI from "openai";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const port = process.env.PORT || 10000;
const VERSION = "4.0.0-admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "ISAAC12345";
const UPDATE_MANIFEST_URL = process.env.UPDATE_MANIFEST_URL || "";
const startedAt = Date.now();

function sign(value){
  return crypto.createHmac("sha256", ADMIN_PASSWORD).update(value).digest("hex");
}
function makeAdminToken(){
  const payload = `admin:${Date.now()}`;
  return `${payload}.${sign(payload)}`;
}
function isAdmin(req){
  const raw=req.headers.cookie?.match(/(?:^|;\s*)fi_admin=([^;]+)/)?.[1];
  if(!raw) return false;
  const [payload,mac]=decodeURIComponent(raw).split(".");
  if(!payload||!mac) return false;
  const expected=sign(payload);
  if(!crypto.timingSafeEqual(Buffer.from(mac),Buffer.from(expected))) return false;
  const ts=Number(payload.split(":")[1]);
  return payload.startsWith("admin:") && Number.isFinite(ts) && Date.now()-ts < 24*60*60*1000;
}
function requireAdmin(req,res,next){ if(!isAdmin(req)) return res.status(401).json({error:"Admin login required."}); next(); }

app.use(express.json({limit:"8mb"}));
app.use(express.static(path.join(__dirname,"public")));

function client(res){
  if(!process.env.OPENAI_API_KEY){
    res.status(500).json({error:"OPENAI_API_KEY is not configured on Render."});
    return null;
  }
  return new OpenAI({apiKey:process.env.OPENAI_API_KEY});
}

app.get("/api/health",(req,res)=>res.json({ok:true,name:"FRANCIS AND ISAAC AI BOT",version:VERSION,uptimeSeconds:Math.floor((Date.now()-startedAt)/1000),openaiConfigured:Boolean(process.env.OPENAI_API_KEY),time:new Date().toISOString()}));

app.post("/api/admin/login",(req,res)=>{
  const {password}=req.body||{};
  if(typeof password!=="string" || password!==ADMIN_PASSWORD) return res.status(401).json({error:"Incorrect admin password."});
  res.setHeader("Set-Cookie",`fi_admin=${encodeURIComponent(makeAdminToken())}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400${process.env.NODE_ENV==="production"?"; Secure":""}`);
  res.json({ok:true});
});
app.post("/api/admin/logout",(req,res)=>{res.setHeader("Set-Cookie","fi_admin=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");res.json({ok:true});});
app.get("/api/admin/me",(req,res)=>res.json({admin:isAdmin(req)}));
app.get("/api/admin/status",requireAdmin,(req,res)=>res.json({ok:true,version:VERSION,uptimeSeconds:Math.floor((Date.now()-startedAt)/1000),node:process.version,platform:process.platform,openaiConfigured:Boolean(process.env.OPENAI_API_KEY),updateManifestConfigured:Boolean(UPDATE_MANIFEST_URL),time:new Date().toISOString()}));
app.get("/api/admin/updates",requireAdmin,async(req,res)=>{
  if(!UPDATE_MANIFEST_URL) return res.json({configured:false,currentVersion:VERSION,message:"Update center is ready. Set UPDATE_MANIFEST_URL when you have a remote update manifest."});
  try{const r=await fetch(UPDATE_MANIFEST_URL);const data=await r.json();res.json({configured:true,currentVersion:VERSION,...data});}
  catch(e){res.status(502).json({error:"Could not reach the update manifest.",details:e.message});}
});

app.post("/api/chat",requireAdmin,async(req,res)=>{
  const ai=client(res); if(!ai)return;
  const {message,previousResponseId}=req.body||{};
  if(!message?.trim())return res.status(400).json({error:"Message is required."});
  try{
    const response=await ai.responses.create({
      model:process.env.OPENAI_CHAT_MODEL,
      instructions:"You are FRANCIS AND ISAAC AI BOT. Be helpful, clear, friendly and concise. Never claim you performed an action you did not perform.",
      input:message.trim(),
      ...(previousResponseId?{previous_response_id:previousResponseId}:{})
    });
    res.json({text:response.output_text||"No text response.",responseId:response.id});
  }catch(e){console.error(e);res.status(500).json({error:e.message||"AI request failed."});}
});

app.post("/api/image",async(req,res)=>{
  const ai=client(res); if(!ai)return;
  const {prompt}=req.body||{};
  if(!prompt?.trim())return res.status(400).json({error:"Image prompt is required."});
  try{
    const result=await ai.images.generate({model:"gpt-image-1",prompt:prompt.trim()});
    const b64=result.data?.[0]?.b64_json;
    if(!b64)throw new Error("The image service returned no image.");
    res.json({image:`data:image/png;base64,${b64}`});
  }catch(e){console.error(e);res.status(500).json({error:e.message||"Image generation failed."});}
});

app.post("/api/video",async(req,res)=>{
  if(!process.env.OPENAI_API_KEY)return res.status(500).json({error:"OPENAI_API_KEY is not configured on Render."});
  const {prompt,model="sora-2",seconds="4",size="1280x720"}=req.body||{};
  if(!prompt?.trim())return res.status(400).json({error:"Video prompt is required."});
  try{
    const form=new FormData();
    form.append("model",model); form.append("prompt",prompt.trim());
    form.append("seconds",String(seconds)); form.append("size",size);
    const r=await fetch("https://api.openai.com/v1/videos",{method:"POST",headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`},body:form});
    const data=await r.json();
    if(!r.ok)return res.status(r.status).json({error:data?.error?.message||"Video generation failed."});
    res.json(data);
  }catch(e){console.error(e);res.status(500).json({error:e.message||"Video generation failed."});}
});

app.get("/api/video/:id",async(req,res)=>{
  if(!process.env.OPENAI_API_KEY)return res.status(500).json({error:"OPENAI_API_KEY is not configured on Render."});
  try{
    const r=await fetch(`https://api.openai.com/v1/videos/${encodeURIComponent(req.params.id)}`,{headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`}});
    const data=await r.json(); if(!r.ok)return res.status(r.status).json({error:data?.error?.message||"Status request failed."});
    res.json(data);
  }catch(e){res.status(500).json({error:e.message||"Status request failed."});}
});

app.get("/api/video/:id/content",async(req,res)=>{
  if(!process.env.OPENAI_API_KEY)return res.status(500).json({error:"OPENAI_API_KEY is not configured on Render."});
  try{
    const r=await fetch(`https://api.openai.com/v1/videos/${encodeURIComponent(req.params.id)}/content`,{headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`}});
    if(!r.ok){const d=await r.json().catch(()=>({}));return res.status(r.status).json({error:d?.error?.message||"Video download failed."});}
    res.setHeader("Content-Type",r.headers.get("content-type")||"video/mp4");
    res.send(Buffer.from(await r.arrayBuffer()));
  }catch(e){res.status(500).json({error:e.message||"Video download failed."});}
});

app.get("*splat",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(port,()=>console.log(`FRANCIS AND ISAAC AI BOT on ${port}`));
