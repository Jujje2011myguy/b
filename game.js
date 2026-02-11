// Fixed Neon Dash Arena — game.js
// Self-contained JS: if required DOM elements are missing, this script creates a minimal UI (canvas + HUD + shop overlay).
// Paste into a page (or include as a separate file). It will wait for DOM ready and then initialize.

(function(){
'use strict';

/* ---------- Helper to ensure DOM elements exist ---------- */
function ensureDOM(){
  // If main wrapper doesn't exist, create a minimal structure
  if(!document.getElementById('wrap')){
    const wrap = document.createElement('div'); wrap.id = 'wrap';
    wrap.style.cssText = 'height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:10px;background:#050814;color:#e6eef8;font-family:Arial,Helvetica,sans-serif';
    document.body.style.margin = '0';
    document.body.appendChild(wrap);

    // header
    const header = document.createElement('header'); header.style.width='100%'; header.style.maxWidth='1100px'; header.style.display='flex'; header.style.justifyContent='space-between'; header.style.gap='8px';
    const leftPanel = document.createElement('div'); leftPanel.innerHTML = '<h1 style="margin:0;color:#4ee1a1;font-size:18px">Neon Dash Arena</h1>';
    const centerPanel = document.createElement('div'); centerPanel.innerHTML = '<div>Score: <span id="score">0</span> • HP: <span id="hp">0</span> • Credits: <span id="cred">0</span></div>';
    const rightPanel = document.createElement('div'); rightPanel.innerHTML = '<button id="btnShop">Shop</button> <button id="btnPause">Pause</button> <button id="btnRestart">Restart</button>';
    header.appendChild(leftPanel); header.appendChild(centerPanel); header.appendChild(rightPanel);
    wrap.appendChild(header);

    // main canvas
    const main = document.createElement('main'); main.style.width='100%'; main.style.maxWidth='1100px'; main.style.marginTop='12px';
    const canvas = document.createElement('canvas'); canvas.id='game'; canvas.width=1100; canvas.height=700; canvas.style.width='100%'; canvas.style.borderRadius='8px'; canvas.style.background='#0b1224';
    main.appendChild(canvas);
    wrap.appendChild(main);

    // HUD and overlays
    const hud = document.createElement('div'); hud.id='hud'; hud.style.marginTop='8px'; hud.textContent = 'Move: WASD • Shoot: Space • Switch: Q/E';
    wrap.appendChild(hud);

    // upgrade overlay placeholder
    const upgradeOverlay = document.createElement('div'); upgradeOverlay.id='upgradeOverlay'; upgradeOverlay.style.display='none';
    upgradeOverlay.innerHTML = '<div id="upgradeList"></div>';
    document.body.appendChild(upgradeOverlay);

    // shop overlay
    const shopOverlay = document.createElement('div'); shopOverlay.id='shopOverlay'; shopOverlay.style.display='none';
    shopOverlay.innerHTML = '<div style="background:#111;padding:12px;border-radius:8px;color:#fff"><div>Shop</div><div id="shopList"></div><button id="closeShop">Close</button></div>';
    document.body.appendChild(shopOverlay);

    // debug box
    const debug = document.createElement('div'); debug.id='debugBox'; debug.style.display='none'; document.body.appendChild(debug);
  }
}

/* ---------- Utilities ---------- */
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rand=(a,b)=>Math.random()*(b-a)+a;
const rndInt=(a,b)=>Math.floor(rand(a,b+1));
const dist=(x1,y1,x2,y2)=>Math.hypot(x2-x1,y2-y1);
const now=()=>performance.now();

/* ---------- Minimal DOM references (guaranteed after ensureDOM) ---------- */
ensureDOM();
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d',{alpha:false});
let W = canvas.width, H = canvas.height;
const elScore = document.getElementById('score');
const elHp = document.getElementById('hp');
const elCred = document.getElementById('cred');
const elMsg = document.getElementById('msg') || document.createElement('div');
const shopOverlay = document.getElementById('shopOverlay');
const shopList = document.getElementById('shopList');
const closeShopBtn = document.getElementById('closeShop');

/* ---------- Input state ---------- */
const keys = {};
const touch = {left:false,right:false,up:false,down:false,shoot:false,dash:false};
const mouse = {x:0,y:0};

/* ---------- Game state ---------- */
const state = {
  running:true, paused:false, time:now(), dt:0,
  score:0, hi:0, wave:1, mode:'Endless',
  enemies:[], bullets:[], eBullets:[], particles:[], pickups:[],
  player:null, enemiesLeft:0, inUpgrade:false,
  shopCredits:400, difficulty:1, boss:null,
  weapons:[], weaponIndex:0, skills:{}, permanent:{hp:0,damage:0,move:0,fire:0},
  mutation:'None', mutLevel:0, overdrive:0, timeWarp:0,
  owned:{}, pierceBuff:0, reviveCount:0, rerollNext:false
};

/* ---------- Simple audio stub ---------- */
function sfx(){ /* no-op to avoid errors */ }

/* ---------- Entities (compact) ---------- */
class Particle{constructor(x,y,c,l=600){this.x=x;this.y=y;this.vx=rand(-80,80);this.vy=rand(-80,80);this.c=c;this.life=l;this.age=0;}update(dt){this.x+=this.vx*dt;this.y+=this.vy*dt;this.age+=dt*1000;}draw(){const t=1-(this.age/this.life);if(t<=0)return;ctx.globalAlpha=t;ctx.fillStyle=this.c;ctx.beginPath();ctx.arc(this.x,this.y,2*t*3,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;}}
class Bullet{constructor(x,y,vx,vy,c,o='e',r=4){this.x=x;this.y=y;this.vx=vx;this.vy=vy;this.c=c;this.o=o;this.r=r;this.age=0;this.homing=false;this.pierce=0;this.gravity=false;}update(dt){if(this.homing&&this.o==='p'){let n=null,nd=1e9;for(const e of state.enemies){const d=dist(this.x,this.y,e.x,e.y);if(d<nd){nd=d;n=e;}}if(n){const a=Math.atan2(n.y-this.y,n.x-this.x);const s=Math.hypot(this.vx,this.vy);this.vx+=(Math.cos(a)*s-this.vx)*0.12;this.vy+=(Math.sin(a)*s-this.vy)*0.12;}}this.x+=this.vx*dt;this.y+=this.vy*dt;this.age+=dt*1000;}draw(){ctx.fillStyle=this.c;ctx.beginPath();ctx.arc(this.x,this.y,this.r,0,Math.PI*2);ctx.fill();}}
class Homing extends Bullet{constructor(x,y,s,c){super(x,y,0,-s,c,'p',6);this.homing=true;}}
class Enemy{constructor(x,y,t=0){this.x=x;this.y=y;this.type=t;this.r=12;this.hp=2;this.speed=120;this.color='#ff6b6b';this.shootT=rand(800,1600);this.phase=Math.random()*Math.PI*2;this.shield=0;this.elite=false;}update(dt){const p=state.player;const a=Math.atan2(p.y-this.y,p.x-this.x);const base=this.speed*(1+(state.difficulty-1)*0.12);this.x+=Math.cos(a)*base*dt+Math.cos(this.phase)*30*dt;this.y+=Math.sin(a)*base*dt+Math.sin(this.phase)*30*dt;this.shootT-=dt*1000;if(this.shootT<=0){this.shootT=rand(900,2000);}}draw(){ctx.save();ctx.translate(this.x,this.y);ctx.fillStyle=this.color;ctx.beginPath();ctx.arc(0,0,this.r,0,Math.PI*2);ctx.fill();ctx.restore();}}
class Player{constructor(){this.x=W/2;this.y=H/2;this.r=14;this.speed=260+state.permanent.move;this.hp=5+state.permanent.hp;this.maxHp=this.hp;this.cool=0;this.baseCool=Math.max(0,220-state.permanent.fire);this.bulletSpeed=420;this.multi=1;this.spread=0;this.inv=0;this.dashCooldown=0;this.shield=0;this.orbiters=[];this.charge=0;}update(dt){let vx=0,vy=0;if(keys.a||keys.ArrowLeft||touch.left)vx-=1;if(keys.d||keys.ArrowRight||touch.right)vx+=1;if(keys.w||keys.ArrowUp||touch.up)vy-=1;if(keys.s||keys.ArrowDown||touch.down)vy+=1;const len=Math.hypot(vx,vy)||1;let speed=this.speed;if(state.timeWarp>0)speed*=0.7;this.x+=(vx/len)*speed*dt;this.y+=(vy/len)*speed*dt;this.x=clamp(this.x,this.r+8,W-this.r-8);this.y=clamp(this.y,this.r+8,H-this.r-8);this.cool-=dt*1000;let fireRateMult=1;if(state.overdrive>0)fireRateMult=0.4;if((keys[' ']||keys.Space||touch.shoot)&&this.cool<=0){fireWeapon(this);this.cool=this.baseCool*fireRateMult;}this.dashCooldown-=dt*1000;if((keys.Shift||touch.dash)&&this.dashCooldown<=0){this.dash();this.dashCooldown=1200;}if(this.inv>0)this.inv-=dt*1000;}dash(){let dx=mouse.x-this.x,dy=mouse.y-this.y;const len=Math.hypot(dx,dy)||1;this.x+=dx/len*160;this.y+=dy/len*160;this.inv=200;for(let i=0;i<8;i++)state.particles.push(new Particle(this.x,this.y,'#4ee1a1',rand(200,600)));}draw(){ctx.save();ctx.translate(this.x,this.y);ctx.fillStyle=this.inv>0?'#bfffe8':'#4ee1a1';ctx.beginPath();ctx.arc(0,0,this.r,0,Math.PI*2);ctx.fill();ctx.restore();}}

/* ---------- Weapons ---------- */
function fireWeapon(player){
  const w = state.weapons[state.weaponIndex];
  if(!w) return;
  w.fire(player);
}
function registerWeapons(){
  state.weapons = [];
  state.weapons.push({
    id:'blaster', name:'Blaster', fire:(p)=>{
      const s = p.bulletSpeed;
      const shots = Math.max(1, p.multi||1);
      const spread = (p.spread||0)*0.5;
      for(let i=0;i<shots;i++){
        const offset = (i-(shots-1)/2)*spread;
        const a = -Math.PI/2 + offset;
        const b = new Bullet(p.x, p.y-10, Math.cos(a)*s, Math.sin(a)*s, '#7ad7ff','p');
        if(state.pierceBuff) b.pierce += state.pierceBuff;
        state.bullets.push(b);
      }
    }
  });
  state.weapons.push({
    id:'shotgun', name:'Shotgun', fire:(p)=>{
      const baseCount = 5;
      const extra = Math.max(0, (p.multi||1)-1);
      const n = baseCount + extra;
      const spread = 0.5 + (p.spread||0);
      for(let i=0;i<n;i++){
        const a = -Math.PI/2 + (i-(n-1)/2)*spread;
        const s = p.bulletSpeed*0.85;
        state.bullets.push(new Bullet(p.x,p.y,Math.cos(a)*s,Math.sin(a)*s,'#ffd6a6','p'));
      }
    }
  });
  state.weapons.push({
    id:'homing', name:'Homing', fire:(p)=>{
      const shots = Math.max(1, p.multi||1);
      for(let i=0;i<shots;i++) state.bullets.push(new Homing(p.x+rand(-6,6), p.y-8, 200, '#ffb86b'));
    }
  });
}

/* ---------- Spawning / waves ---------- */
function spawnWave(){
  state.enemies.length = 0;
  state.eBullets.length = 0;
  state.bullets.length = 0;
  state.pickups.length = 0;
  state.particles.length = 0;
  state.boss = null;
  state.difficulty = 1 + (state.wave-1)*0.15;
  const count = 6 + Math.floor(state.wave*1.8);
  for(let i=0;i<count;i++){
    const edge = rndInt(0,3); let x,y;
    if(edge===0){x=rand(0,W);y=-20;} else if(edge===1){x=W+20;y=rand(0,H);} else if(edge===2){x=rand(0,W);y=H+20;} else {x=-20;y=rand(0,H);}
    const e = new Enemy(x,y,0);
    if(Math.random() < Math.min(0.12, state.wave*0.02)){ e.elite=true; e.hp *= 2; e.color = '#ffd166'; }
    state.enemies.push(e);
  }
  state.enemiesLeft = state.enemies.length;
  updateUI();
}

/* ---------- UI / Shop ---------- */
function updateUI(){
  if(elScore) elScore.textContent = state.score;
  if(elHp) elHp.textContent = state.player?state.player.hp:0;
  if(elCred) elCred.textContent = state.shopCredits;
}
function shopPrice(base){ return Math.max(5, Math.floor(base * (1 + state.wave * 0.04))); }

const SHOP_ITEMS = [
  {id:'perm_hp', title:'Permanent +1 Max HP', baseCost:120, desc:'Adds +1 to max HP permanently', apply:(qty)=>{ state.permanent.hp += qty; state.player.maxHp += qty; state.player.hp = Math.min(state.player.maxHp, state.player.hp + qty); }},
  {id:'extra_multi', title:'+1 Permanent Bullet', baseCost:220, desc:'Increase player.multi permanently', apply:(qty)=>{ state.player.multi = (state.player.multi||1) + qty; }},
  {id:'ammo', title:'Ammo Pack', baseCost:60, desc:'Small credit pack (gives 60 credits)', apply:(qty)=>{ state.shopCredits += 60*qty; }},
];

function renderShopItems(){
  if(!shopList) return;
  shopList.innerHTML = '';
  SHOP_ITEMS.forEach(it=>{
    const cost = shopPrice(it.baseCost);
    const div = document.createElement('div'); div.style.padding='6px'; div.style.borderBottom='1px solid #222';
    div.innerHTML = `<div style="display:flex;justify-content:space-between"><strong>${it.title}</strong><span>${cost}c</span></div><div style="color:#9aa7bf">${it.desc}</div>
      <div style="margin-top:6px"><input type="number" min="1" value="1" style="width:60px" class="qty"> <button class="buy">Buy</button></div>`;
    const btn = div.querySelector('.buy');
    const qtyInput = div.querySelector('.qty');
    btn.addEventListener('click', ()=>{
      const qty = Math.max(1, Math.floor(Number(qtyInput.value)||1));
      const total = cost * qty;
      if(state.shopCredits >= total){
        state.shopCredits -= total;
        it.apply(qty);
        updateUI();
        btn.textContent = 'Bought';
        setTimeout(()=>btn.textContent='Buy',700);
      } else {
        showMsg('Not enough credits');
      }
    });
    shopList.appendChild(div);
  });
}

/* ---------- Collisions / update / draw ---------- */
function circleHit(a,b){ return dist(a.x,a.y,b.x,b.y) <= a.r + b.r; }

function killEnemy(idx,e){
  state.enemies.splice(idx,1);
  state.enemiesLeft--;
  state.score += e.elite?80:20;
  if(Math.random() < 0.75) state.pickups.push({x:e.x,y:e.y,type:'credit',amount:rndInt(40,160),r:8,age:0});
  for(let i=0;i<6;i++) state.particles.push(new Particle(e.x,e.y,'#ffd6d6',rand(200,600)));
  if(state.enemiesLeft<=0 && !state.boss) waveCleared();
}

function waveCleared(){
  state.inUpgrade = true;
  state.wave++;
  state.shopCredits += Math.floor(60 + state.wave*8);
  spawnWave();
}

function update(dt){
  if(!state.running || state.paused || state.inUpgrade) return;
  if(state.overdrive>0) state.overdrive -= dt*1000;
  if(state.timeWarp>0) state.timeWarp -= dt*1000;
  state.player.update(dt);
  const slow = state.timeWarp>0?0.5:1;

  // NO bullet cap: we intentionally do not limit state.bullets length
  for(const b of state.bullets) b.update(dt);
  for(const b of state.eBullets) b.update(dt*slow);
  for(const p of state.particles) p.update(dt);
  for(const pu of state.pickups) { if(pu.age===undefined) pu.age=0; pu.age += dt*1000; }
  for(const e of state.enemies) e.update(dt*slow);

  // bullet vs enemy
  for(let i=state.bullets.length-1;i>=0;i--){
    const b = state.bullets[i];
    if(b.y < -120 || b.y > H+120 || b.x < -120 || b.x > W+120){ state.bullets.splice(i,1); continue; }
    for(let j=state.enemies.length-1;j>=0;j--){
      const e = state.enemies[j];
      if(circleHit(b,e)){
        e.hp -= 1 + (state.permanent.damage||0);
        if(!b.pierce) state.bullets.splice(i,1); else b.pierce--;
        if(e.hp <= 0) killEnemy(j,e);
        break;
      }
    }
  }

  // pickups collect
  for(let i=state.pickups.length-1;i>=0;i--){
    const p = state.pickups[i];
    if(Math.hypot(p.x-state.player.x,p.y-state.player.y) < (p.r + state.player.r)){
      if(p.type === 'credit') state.shopCredits += p.amount;
      else if(p.type === 'hp') state.player.hp = Math.min(state.player.maxHp, state.player.hp + p.amount);
      state.pickups.splice(i,1);
    }
  }

  // cleanup particles
  for(let i=state.particles.length-1;i>=0;i--) if(state.particles[i].age > state.particles[i].life) state.particles.splice(i,1);

  updateUI();
}

function draw(){
  ctx.fillStyle = '#050814'; ctx.fillRect(0,0,W,H);
  // grid
  ctx.strokeStyle='rgba(255,255,255,0.03)'; ctx.lineWidth=1;
  const step = 40;
  for(let x=0;x<W;x+=step){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
  for(let y=0;y<H;y+=step){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }

  for(const p of state.particles) p.draw();
  for(const pu of state.pickups){ ctx.fillStyle = pu.type==='credit' ? '#ffd166' : '#4ee1a1'; ctx.beginPath(); ctx.arc(pu.x,pu.y,pu.r,0,Math.PI*2); ctx.fill(); }
  for(const e of state.enemies) e.draw();
  for(const b of state.bullets) b.draw();
  for(const b of state.eBullets) b.draw();
  state.player.draw();

  // HUD bottom
  ctx.save();
  ctx.fillStyle='rgba(0,0,0,0.4)'; ctx.fillRect(10,H-52,420,44);
  ctx.fillStyle='#fff'; ctx.font='12px Arial';
  ctx.fillText(`Weapon: ${state.weapons[state.weaponIndex].name}`,18,H-32);
  const base = 220; const cur = state.player?state.player.baseCool:base;
  const pct = cur===0? '∞%' : Math.round((base/(cur||1))*100)+'%';
  ctx.fillText(`Fire rate: ${pct}`,18,H-18);
  ctx.fillText(`Credits: ${state.shopCredits}`,220,H-18);
  ctx.restore();
}

/* ---------- Loop ---------- */
let lastTime = now();
function loop(){
  const t = now();
  let dt = (t - lastTime)/1000;
  if(dt > 0.05) dt = 0.05;
  lastTime = t;
  try{ update(dt); draw(); } catch(err){ console.error(err); }
  requestAnimationFrame(loop);
}

/* ---------- Init ---------- */
function init(){
  W = canvas.width; H = canvas.height;
  registerWeapons();
  state.player = new Player();
  state.weaponIndex = 0;
  spawnWave();
  updateUI();
  loop();
}

/* ---------- Input bindings ---------- */
window.addEventListener('keydown', e=>{
  keys[e.key] = true;
  // secret sequence handling
  handleSecretKey(e.key);
  if(e.key === 'p' || e.key === 'P') { state.paused = !state.paused; document.getElementById('btnPause').textContent = state.paused ? 'Resume' : 'Pause'; }
  if(e.key === 'r' || e.key === 'R') location.reload();
  if(e.key === 'q' || e.key === 'Q') state.weaponIndex = (state.weaponIndex - 1 + state.weapons.length) % state.weapons.length;
  if(e.key === 'e' || e.key === 'E') state.weaponIndex = (state.weaponIndex + 1) % state.weapons.length;
  if(e.key === ' '){ e.preventDefault(); keys.Space = true; }
});
window.addEventListener('keyup', e=>{ keys[e.key] = false; if(e.key === ' ') keys.Space = false; });
canvas.addEventListener('mousemove', e=>{
  const rect = canvas.getBoundingClientRect();
  const sx = canvas.width / rect.width, sy = canvas.height / rect.height;
  mouse.x = (e.clientX - rect.left) * sx;
  mouse.y = (e.clientY - rect.top) * sy;
});
canvas.addEventListener('click', ()=>{ /* resume audio if needed */ });

/* ---------- Shop UI events ---------- */
document.getElementById('btnShop').addEventListener('click', ()=>{ shopOverlay.style.display='block'; state.shopWasPaused = state.paused; state.paused = true; renderShopItems(); });
if(closeShopBtn) closeShopBtn.addEventListener('click', ()=>{ shopOverlay.style.display='none'; state.paused = state.shopWasPaused || false; });

/* ---------- Start when DOM ready ---------- */
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

})();
