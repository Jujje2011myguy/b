// game.js
// Neon Dash Arena — Overdrive (Two-file)
// All core game logic, systems, and features live here.
// Paste this file as game.js next to index.html.

(() => {
  // ---- Utilities ----
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const rand = (a,b) => Math.random()*(b-a)+a;
  const rndInt = (a,b) => Math.floor(rand(a,b+1));
  const dist = (x1,y1,x2,y2) => Math.hypot(x2-x1,y2-y1);
  const now = () => performance.now();

  // ---- Canvas ----
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  let W = canvas.width, H = canvas.height;

  // ---- State ----
  const state = {
    running: true,
    paused: false,
    time: now(),
    dt: 0,
    score: 0,
    hi: parseInt(localStorage.getItem('nda_hi')||'0',10),
    wave: 1,
    mode: 'Campaign',
    enemies: [],
    bullets: [],
    eBullets: [],
    particles: [],
    pickups: [],
    player: null,
    keys: {},
    touch: {left:false,right:false,up:false,down:false,shoot:false,dash:false},
    enemiesLeft: 0,
    inUpgrade: false,
    shopCredits: 0,
    difficulty: 1,
    finalWave: 10,
    boss: null,
    modeFlags: {chaos:false,hardcore:false},
    shopItems: [],
    skills: {},
    permanentUpgrades: {maxHp:0,damage:0,move:0,fireRate:0},
    weaponIndex: 0,
    weapons: [],
    lastWaveClearTime:0
  };

  // ---- Input ----
  window.addEventListener('keydown', e => {
    state.keys[e.key] = true;
    if(e.key === 'p' || e.key === 'P') togglePause();
    if(e.key === 'r' || e.key === 'R') restart();
    if(e.key === 'q' || e.key === 'Q') switchWeapon(-1);
    if(e.key === 'e' || e.key === 'E') switchWeapon(1);
    if(e.key === ' '){ e.preventDefault(); state.keys['Space'] = true; }
  });
  window.addEventListener('keyup', e => {
    state.keys[e.key] = false;
    if(e.key === ' '){ state.keys['Space'] = false; }
  });

  // Touch bindings
  function bindTouch(id,prop){
    const el = document.getElementById(id);
    if(!el) return;
    el.addEventListener('touchstart', e => { e.preventDefault(); state.touch[prop] = true; });
    el.addEventListener('touchend', e => { e.preventDefault(); state.touch[prop] = false; });
    el.addEventListener('mousedown', e => { e.preventDefault(); state.touch[prop] = true; });
    el.addEventListener('mouseup', e => { e.preventDefault(); state.touch[prop] = false; });
  }
  ['tLeft','tRight','tUp','tDown','tShoot','tDash'].forEach(id=>{
    const map = {tLeft:'left',tRight:'right',tUp:'up',tDown:'down',tShoot:'shoot',tDash:'dash'};
    bindTouch(id,map[id]);
  });

  // ---- Player ----
  class Player {
    constructor(){
      this.x = W/2; this.y = H/2;
      this.r = 14;
      this.speed = 260 + (state.permanentUpgrades.move||0);
      this.hp = 5 + (state.permanentUpgrades.maxHp||0);
      this.maxHp = this.hp;
      this.cool = 0;
      this.baseCool = 220 - (state.permanentUpgrades.fireRate||0);
      this.bulletSpeed = 420;
      this.multi = 1;
      this.spread = 0;
      this.inv = 0;
      this.dashCooldown = 0;
      this.dashReady = true;
      this.shield = 0;
      this.orbiters = []; // drones
      this.charge = 0;
      this.abilities = {dash:true,teleport:true,shield:true,slowmo:true};
    }
    update(dt){
      // movement
      let vx=0, vy=0;
      const k = state.keys, t = state.touch;
      if(k.a || k.ArrowLeft || t.left) vx -= 1;
      if(k.d || k.ArrowRight || t.right) vx += 1;
      if(k.w || k.ArrowUp || t.up) vy -= 1;
      if(k.s || k.ArrowDown || t.down) vy += 1;
      const len = Math.hypot(vx,vy) || 1;
      this.x += (vx/len) * this.speed * dt;
      this.y += (vy/len) * this.speed * dt;
      this.x = clamp(this.x, this.r+8, W - this.r - 8);
      this.y = clamp(this.y, this.r+8, H - this.r - 8);

      // firing
      this.cool -= dt*1000;
      if((k[' '] || k.Space || t.shoot) && this.cool <= 0){
        this.fire();
        this.cool = this.baseCool;
      }

      // dash
      this.dashCooldown -= dt*1000;
      if((k.Shift || t.dash) && this.dashCooldown <= 0 && this.abilities.dash){
        this.dash();
        this.dashCooldown = 1200;
      }

      // invulnerability
      if(this.inv > 0) this.inv -= dt*1000;

      // orbiters follow
      this.orbiters.forEach((o,i)=>{
        const angle = (now()/200 + i*1.2) * 0.002;
        const tx = this.x + Math.cos(angle)*(this.r+18);
        const ty = this.y + Math.sin(angle)*(this.r+18);
        o.x += (tx - o.x) * 0.2;
        o.y += (ty - o.y) * 0.2;
      });

      // charge for mega shot
      if(k.Shift && this.abilities.slowmo){
        this.charge = Math.min(1, this.charge + dt*0.6);
      } else {
        if(this.charge > 0.9){
          // release charged shot
          this.charge = 0;
          this.fireCharged();
        } else this.charge = 0;
      }
    }
    fire(){
      const w = state.weapons[state.weaponIndex];
      if(!w) return;
      w.fire(this);
    }
    fireCharged(){
      // big radial burst
      const n = 18;
      for(let i=0;i<n;i++){
        const a = (i/n)*Math.PI*2;
        const s = 360;
        state.bullets.push(new Bullet(this.x,this.y,Math.cos(a)*s,Math.sin(a)*s,'#7ad7ff','p',6));
      }
      state.particles.push(new Particle(this.x,this.y,'#7ad7ff',40));
      addScore(150);
    }
    dash(){
      // quick dash in facing direction or towards mouse
      const k = state.keys;
      let dirX = 0, dirY = -1;
      if(k.a||k.ArrowLeft) dirX = -1;
      if(k.d||k.ArrowRight) dirX = 1;
      if(k.w||k.ArrowUp) dirY = -1;
      if(k.s||k.ArrowDown) dirY = 1;
      if(dirX===0 && dirY===0){
        // dash towards mouse if no input
        dirX = (mouse.x - this.x);
        dirY = (mouse.y - this.y);
      }
      const len = Math.hypot(dirX,dirY)||1;
      const dashDist = 160;
      this.x += (dirX/len)*dashDist;
      this.y += (dirY/len)*dashDist;
      this.inv = 200;
      for(let i=0;i<12;i++) state.particles.push(new Particle(this.x,this.y,'#4ee1a1',rand(20,120)));
      sfx('dash');
    }
    draw(){
      // pixel-art style body (simple)
      ctx.save();
      ctx.translate(this.x,this.y);
      // neon glow
      ctx.fillStyle = 'rgba(78,225,161,0.12)';
      ctx.beginPath(); ctx.arc(0,0,this.r*1.8,0,Math.PI*2); ctx.fill();
      // body
      ctx.fillStyle = this.inv>0 ? '#bfffe8' : '#4ee1a1';
      ctx.beginPath(); ctx.arc(0,0,this.r,0,Math.PI*2); ctx.fill();
      // inner pixel core (pixel-art hint)
      ctx.fillStyle = '#041814';
      ctx.fillRect(-6,-6,4,4);
      ctx.fillRect(2,-6,4,4);
      ctx.fillRect(-6,2,4,4);
      ctx.fillRect(2,2,4,4);
      ctx.restore();

      // orbiters
      this.orbiters.forEach(o=>{
        ctx.fillStyle = '#7ad7ff';
        ctx.beginPath(); ctx.arc(o.x,o.y,6,0,Math.PI*2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.beginPath(); ctx.arc(o.x-2,o.y-2,3,0,Math.PI*2); ctx.fill();
      });

      // shield
      if(this.shield>0){
        ctx.strokeStyle = 'rgba(122,215,255,0.6)';
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(this.x,this.y,this.r+8,0,Math.PI*2); ctx.stroke();
      }
    }
  }

  // ---- Weapons ----
  class Weapon {
    constructor(id,name,fireFn,desc){
      this.id=id; this.name=name; this.fire=fireFn; this.desc=desc;
    }
  }

  function registerWeapons(){
    state.weapons = [];
    // Basic blaster
    state.weapons.push(new Weapon('blaster','Blaster',(player)=>{
      const s = player.bulletSpeed;
      const a = -Math.PI/2;
      const vx = Math.cos(a)*s, vy = Math.sin(a)*s;
      state.bullets.push(new Bullet(player.x,player.y-10,vx,vy,'#7ad7ff','p'));
      sfx('shoot');
    },'Single fast projectile'));

    // Shotgun
    state.weapons.push(new Weapon('shotgun','Shotgun',(player)=>{
      const n = 5;
      const spread = 0.5 + player.spread;
      for(let i=0;i<n;i++){
        const a = -Math.PI/2 + (i-(n-1)/2)*spread;
        const s = player.bulletSpeed*0.85;
        state.bullets.push(new Bullet(player.x,player.y,Math.cos(a)*s,Math.sin(a)*s,'#ffd6a6','p'));
      }
      sfx('shotgun');
    },'Short-range spread'));

    // Laser (beam)
    state.weapons.push(new Weapon('laser','Laser',(player)=>{
      // instant beam: spawn many small bullets along a line
      const len = 600;
      const steps = 24;
      for(let i=1;i<=steps;i++){
        const t = i/steps;
        state.particles.push(new Particle(player.x,player.y - t*len,'#ff6b6b',rand(10,60)));
      }
      addScore(5);
      sfx('laser');
    },'Short burst beam'));

    // Homing missiles
    state.weapons.push(new Weapon('homing','Homing',(player)=>{
      // spawn a homing projectile that seeks nearest enemy
      state.bullets.push(new Homing(player.x,player.y-8,200,'#ffb86b'));
      sfx('missile');
    },'Seeks nearest enemy'));

    // Orbiting drone deploy (consumes a slot)
    state.weapons.push(new Weapon('drone','Drone',(player)=>{
      if(player.orbiters.length < 3){
        player.orbiters.push({x:player.x+20,y:player.y,damage:1});
        sfx('deploy');
      } else {
        // fire from orbiters
        player.orbiters.forEach(o=>{
          const a = Math.atan2(mouse.y - o.y, mouse.x - o.x);
          state.bullets.push(new Bullet(o.x,o.y,Math.cos(a)*360,Math.sin(a)*360,'#7ad7ff','p'));
        });
        sfx('shoot');
      }
    },'Deploy orbiting drones or fire them'));

    // Charged mega-shot (handled by player charge)
    state.weapons.push(new Weapon('mega','Mega',(player)=>{
      // fallback: fire a heavy projectile
      state.bullets.push(new Bullet(player.x,player.y-10,0,-520,'#ff9fb0','p',10));
      sfx('mega');
    },'Heavy single projectile'));
  }

  // ---- Bullets ----
  class Bullet {
    constructor(x,y,vx,vy,color,owner='e',r=4){
      this.x=x;this.y=y;this.vx=vx;this.vy=vy;this.color=color;this.owner=owner;this.r=r;this.age=0;
      this.homing=false;
    }
    update(dt){
      if(this.homing && this.owner==='p'){
        // find nearest enemy
        let nearest=null, nd=99999;
        state.enemies.forEach(e=>{
          const d = dist(this.x,this.y,e.x,e.y);
          if(d<nd){ nd=d; nearest=e; }
        });
        if(nearest){
          const a = Math.atan2(nearest.y - this.y, nearest.x - this.x);
          const s = Math.hypot(this.vx,this.vy);
          this.vx += (Math.cos(a)*s - this.vx)*0.12;
          this.vy += (Math.sin(a)*s - this.vy)*0.12;
        }
      }
      this.x += this.vx*dt;
      this.y += this.vy*dt;
      this.age += dt*1000;
    }
    draw(){
      ctx.fillStyle = this.color;
      ctx.beginPath(); ctx.arc(this.x,this.y,this.r,0,Math.PI*2); ctx.fill();
      // neon trail
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.beginPath(); ctx.arc(this.x-1,this.y-1,this.r*0.5,0,Math.PI*2); ctx.fill();
    }
  }

  class Homing extends Bullet {
    constructor(x,y,s,color){
      super(x,y,0,-s,color,'p',6);
      this.homing = true;
    }
  }

  // ---- Enemies ----
  class Enemy {
    constructor(x,y,type=0){
      this.x=x;this.y=y;this.type=type;
      this.r = type===0?12:18;
      this.hp = type===0?2:6;
      this.speed = type===0?120:70;
      this.color = type===0?'#ff6b6b':'#ffb86b';
      this.shootT = rand(800,1600);
      this.phase = Math.random()*Math.PI*2;
      this.splitOnDeath = (type===2);
      this.elite = false;
    }
    update(dt){
      this.phase += dt*2;
      const p = state.player;
      const a = Math.atan2(p.y - this.y, p.x - this.x);
      const base = this.speed * (1 + (state.difficulty-1)*0.12);
      this.x += Math.cos(a)*base*dt + Math.cos(this.phase)*30*dt;
      this.y += Math.sin(a)*base*dt + Math.sin(this.phase)*30*dt;
      this.shootT -= dt*1000;
      if(this.shootT <= 0){
        this.shootT = rand(900,2000);
        this.shoot();
      }
    }
    shoot(){
      // snipers or tanks shoot differently
      if(this.type===1){
        // sniper: slow precise shot
        const p = state.player;
        const a = Math.atan2(p.y - this.y, p.x - this.x);
        const s = 260;
        state.eBullets.push(new Bullet(this.x,this.y,Math.cos(a)*s,Math.sin(a)*s,'#ffd6d6','e',6));
      } else {
        // swarmers may not shoot
        if(Math.random()<0.2){
          const p = state.player;
          const a = Math.atan2(p.y - this.y, p.x - this.x);
          const s = 180;
          state.eBullets.push(new Bullet(this.x,this.y,Math.cos(a)*s,Math.sin(a)*s,'#ffd6d6','e',5));
        }
      }
    }
    draw(){
      ctx.save();
      ctx.translate(this.x,this.y);
      // neon glow
      ctx.fillStyle = 'rgba(255,107,107,0.12)';
      ctx.beginPath(); ctx.arc(0,0,this.r*1.8,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = this.color;
      ctx.beginPath(); ctx.arc(0,0,this.r,0,Math.PI*2); ctx.fill();
      ctx.restore();
    }
  }

  // ---- Boss (multi-phase) ----
  class Boss {
    constructor(){
      this.x = W/2; this.y = -120;
      this.r = 60;
      this.hp = 220;
      this.maxHp = 220;
      this.phase = 0;
      this.t = 0;
      this.enrage = false;
    }
    update(dt){
      if(this.y < 140) { this.y += 60*dt; return; }
      this.t += dt*1000;
      if(this.hp < this.maxHp*0.6 && this.phase < 1){ this.phase = 1; this.t = 0; sfx('power'); }
      if(this.hp < this.maxHp*0.3 && this.phase < 2){ this.phase = 2; this.t = 0; sfx('power'); }
      // movement
      if(this.phase === 0) this.x = W/2 + Math.sin(this.t/600)*180;
      else if(this.phase === 1) this.x = W/2 + Math.sin(this.t/400)*260;
      else this.x = W/2 + Math.sin(this.t/200)*320;
      // attacks
      if(this.t > (this.phase===0?900:this.phase===1?700:450)){
        this.t = 0;
        this.attack();
      }
    }
    attack(){
      if(this.phase===0){
        // spread
        const count = 8;
        for(let i=0;i<count;i++){
          const a = (i/(count-1)-0.5)*Math.PI*0.9;
          const s = 220;
          state.eBullets.push(new Bullet(this.x+Math.sin(a)*20,this.y+30,Math.sin(a)*s,Math.cos(a)*s,'#ffd6d6','e',6));
        }
      } else if(this.phase===1){
        // spiral
        const count = 16;
        for(let i=0;i<count;i++){
          const a = (now()/1000) + i*0.4;
          const s = 180;
          state.eBullets.push(new Bullet(this.x+Math.cos(a)*30,this.y+Math.sin(a)*30,Math.cos(a)*s,Math.sin(a)*s,'#ffd6d6','e',5));
        }
      } else {
        // burst
        for(let i=0;i<28;i++){
          const a = rand(0,Math.PI*2);
          const s = 300;
          state.eBullets.push(new Bullet(this.x+Math.cos(a)*40,this.y+Math.sin(a)*40,Math.cos(a)*s,Math.sin(a)*s,'#ffd6d6','e',5));
        }
      }
      sfx('bossShoot');
    }
    draw(){
      ctx.save();
      ctx.translate(this.x,this.y);
      ctx.fillStyle = '#ff9fb0';
      ctx.beginPath(); ctx.arc(0,0,this.r,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = '#ff6b6b';
      ctx.beginPath(); ctx.arc(0,0,this.r*0.6,0,Math.PI*2); ctx.fill();
      ctx.restore();
      // health bar
      const w = 360, h = 12;
      const x = W/2 - w/2, y = 18;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x,y,w,h);
      ctx.fillStyle = '#ff6b6b'; ctx.fillRect(x,y,w*(this.hp/this.maxHp),h);
    }
  }

  // ---- Particles ----
  class Particle {
    constructor(x,y,color,life=600){
      this.x=x;this.y=y;this.vx=rand(-80,80);this.vy=rand(-80,80);this.color=color;this.life=life;this.age=0;
    }
    update(dt){ this.x+=this.vx*dt; this.y+=this.vy*dt; this.age+=dt*1000; }
    draw(){
      const t = 1 - (this.age/this.life);
      if(t<=0) return;
      ctx.fillStyle = this.color;
      ctx.globalAlpha = t;
      ctx.beginPath(); ctx.arc(this.x,this.y,2*t*3,0,Math.PI*2); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // ---- Pickups ----
  class Pickup {
    constructor(x,y,type,amount){
      this.x=x;this.y=y;this.type=type;this.amount=amount;this.r=8;this.age=0;
    }
    update(dt){ this.age+=dt*1000; }
    draw(){
      ctx.fillStyle = this.type==='credit'?'#ffd166':this.type==='hp'?'#4ee1a1':'#7ad7ff';
      ctx.beginPath(); ctx.arc(this.x,this.y,this.r,0,Math.PI*2); ctx.fill();
    }
  }

  // ---- Audio (tiny synth) ----
  const audioCtx = (typeof AudioContext !== 'undefined') ? new AudioContext() : null;
  let masterGain = null;
  function initAudio(){
    if(!audioCtx) return;
    masterGain = audioCtx.createGain(); masterGain.gain.value = 0.9; masterGain.connect(audioCtx.destination);
  }
  function sfx(type){
    if(!audioCtx) return;
    const t = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sine';
    if(type==='shoot'){ o.frequency.setValueAtTime(880,t); g.gain.setValueAtTime(0.06,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.12); }
    else if(type==='shotgun'){ o.frequency.setValueAtTime(520,t); g.gain.setValueAtTime(0.08,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.18); }
    else if(type==='missile'){ o.frequency.setValueAtTime(320,t); g.gain.setValueAtTime(0.08,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.28); }
    else if(type==='explode'){ o.frequency.setValueAtTime(120,t); g.gain.setValueAtTime(0.12,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.4); o.type='square'; }
    else if(type==='dash'){ o.frequency.setValueAtTime(1200,t); g.gain.setValueAtTime(0.04,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.12); }
    else if(type==='bossShoot'){ o.frequency.setValueAtTime(220,t); g.gain.setValueAtTime(0.08,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.3); }
    else if(type==='power'){ o.frequency.setValueAtTime(1400,t); g.gain.setValueAtTime(0.06,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.18); }
    o.connect(g); g.connect(masterGain || audioCtx.destination); o.start(t); o.stop(t+0.5);
  }

  // ---- Mouse ----
  const mouse = {x:W/2,y:H/2};
  canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    mouse.x = (e.clientX - rect.left) * scaleX;
    mouse.y = (e.clientY - rect.top) * scaleY;
  });
  canvas.addEventListener('click', e => {
    // teleport ability if unlocked and alt key
    if(state.player && state.player.abilities.teleport && (state.keys['Alt'] || state.keys['Meta'])){
      state.player.x = mouse.x; state.player.y = mouse.y;
      sfx('dash');
    }
  });

  // ---- Systems ----
  function spawnWave(){
    state.enemies.length = 0;
    state.eBullets.length = 0;
    state.bullets.length = 0;
    state.pickups.length = 0;
    state.particles.length = 0;
    state.boss = null;
    const w = state.wave;
    state.difficulty = 1 + (w-1)*0.12;
    if(w >= state.finalWave){
      state.boss = new Boss();
      state.enemiesLeft = 1;
    } else {
      const count = 4 + Math.floor(w*1.6);
      for(let i=0;i<count;i++){
        const edge = rndInt(0,3);
        let x,y;
        if(edge===0){ x = rand(0,W); y = -20; }
        else if(edge===1){ x = W+20; y = rand(0,H); }
        else if(edge===2){ x = rand(0,W); y = H+20; }
        else { x = -20; y = rand(0,H); }
        const typeRand = Math.random();
        let type = 0;
        if(typeRand < 0.12) type = 1; // sniper
        else if(typeRand < 0.18) type = 2; // tank/splitter
        const e = new Enemy(x,y,type);
        if(Math.random() < Math.min(0.12, w*0.02)){ e.elite = true; e.hp *= 2; e.color = '#ffd166'; }
        state.enemies.push(e);
      }
      state.enemiesLeft = state.enemies.length;
    }
    updateUI();
  }

  function updateUI(){
    document.getElementById('score').textContent = state.score;
    document.getElementById('hp').textContent = state.player.hp;
    document.getElementById('wave').textContent = state.wave;
    document.getElementById('left').textContent = state.enemiesLeft;
    document.getElementById('hi').textContent = state.hi;
    document.getElementById('mode').textContent = state.mode;
  }

  function addScore(v){
    state.score += v;
    if(state.score > state.hi){ state.hi = state.score; localStorage.setItem('nda_hi', state.hi); }
  }

  function damagePlayer(d){
    if(state.player.inv > 0) return;
    if(state.player.shield > 0){ state.player.shield -= d; if(state.player.shield < 0) state.player.shield = 0; return; }
    state.player.hp -= d;
    state.player.inv = 800;
    for(let i=0;i<12;i++) state.particles.push(new Particle(state.player.x, state.player.y, '#ff6b6b', rand(300,800)));
    sfx('explode');
    if(state.player.hp <= 0) gameOver();
  }

  function gameOver(){
    state.running = false;
    showMsg('Game Over — Press Restart');
  }

  function showMsg(text){
    const el = document.getElementById('msg'); el.textContent = text;
  }
  function clearMsg(){ document.getElementById('msg').textContent = ''; }

  // ---- Wave cleared / upgrades / shop / skills ----
  function waveCleared(){
    state.lastWaveClearTime = now();
    if(state.wave >= state.finalWave){
      showMsg('YOU WIN! Final wave cleared!');
      state.running = false;
      return;
    }
    state.inUpgrade = true;
    showUpgradeOverlay();
  }

  function showUpgradeOverlay(){
    clearMsg();
    const overlay = document.getElementById('upgradeOverlay');
    const list = document.getElementById('upgradeList');
    list.innerHTML = '';
    const options = [
      {id:'firerate', title:'Faster Fire', desc:'-20% cooldown', apply:()=>{ state.player.baseCool *= 0.8; }},
      {id:'multi', title:'Extra Bullet', desc:'+1 bullet per shot', apply:()=>{ state.player.multi = Math.min(4, state.player.multi+1); }},
      {id:'speed', title:'Move Speed', desc:'+20% speed', apply:()=>{ state.player.speed *= 1.2; }},
      {id:'hp', title:'Max HP + Heal', desc:'+1 max HP and heal 2', apply:()=>{ state.player.maxHp += 1; state.player.hp = Math.min(state.player.maxHp, state.player.hp+2); }},
      {id:'spread', title:'Spread Shot', desc:'Adds spread to shotgun', apply:()=>{ state.player.spread = Math.min(0.5, state.player.spread + 0.12); }},
      {id:'drone', title:'Deploy Drone', desc:'Gain an orbiting drone', apply:()=>{ if(state.player.orbiters.length < 3) state.player.orbiters.push({x:state.player.x+20,y:state.player.y,damage:1}); }}
    ];
    const picks = [];
    while(picks.length < 3){
      const o = options[Math.floor(Math.random()*options.length)];
      if(!picks.includes(o)) picks.push(o);
    }
    picks.forEach(opt=>{
      const div = document.createElement('div'); div.className = 'upgrade';
      div.innerHTML = `<div class="upgrade-title">${opt.title}</div><div class="upgrade-desc">${opt.desc}</div>`;
      div.onclick = () => {
        opt.apply();
        document.getElementById('upgradeOverlay').style.display = 'none';
        state.inUpgrade = false;
        state.wave++;
        state.difficulty *= 1.18;
        spawnWave();
      };
      list.appendChild(div);
    });
    overlay.style.display = 'flex';
  }

  // Shop
  function openShop(){
    const overlay = document.getElementById('shopOverlay');
    const list = document.getElementById('shopList');
    list.innerHTML = '';
    const items = [
      {id:'perm_hp',title:'Permanent +1 HP',cost:200,apply:()=>{ state.permanentUpgrades.maxHp += 1; }},
      {id:'perm_fire',title:'Permanent Fire Rate',cost:250,apply:()=>{ state.permanentUpgrades.fireRate += 20; }},
      {id:'perm_move',title:'Permanent Move',cost:200,apply:()=>{ state.permanentUpgrades.move += 20; }},
      {id:'perm_damage',title:'Permanent Damage',cost:300,apply:()=>{ state.permanentUpgrades.damage += 1; }},
      {id:'reroll',title:'Reroll Upgrades',cost:120,apply:()=>{ /* no-op for demo */ }},
    ];
    items.forEach(it=>{
      const div = document.createElement('div'); div.className = 'shop-item';
      div.innerHTML = `<div style="font-weight:700">${it.title}</div><div style="color:#9aa7bf">Cost: ${it.cost}</div>`;
      div.onclick = () => {
        if(state.shopCredits >= it.cost){
          state.shopCredits -= it.cost;
          it.apply();
          overlay.style.display = 'none';
          // apply permanent upgrades to player
          state.player.maxHp += state.permanentUpgrades.maxHp;
          state.player.hp = Math.min(state.player.maxHp, state.player.hp + state.permanentUpgrades.maxHp);
          state.player.baseCool = Math.max(60, state.player.baseCool - state.permanentUpgrades.fireRate);
          state.player.speed += state.permanentUpgrades.move;
          addScore(0);
        } else {
          showMsg('Not enough credits');
          setTimeout(clearMsg,1200);
        }
      };
      list.appendChild(div);
    });
    overlay.style.display = 'flex';
  }

  // Skill tree
  function openSkills(){
    const overlay = document.getElementById('skillOverlay');
    const list = document.getElementById('skillList');
    list.innerHTML = '';
    const skills = [
      {id:'s1',title:'Dash Mastery',desc:'Dash cooldown -20%',cost:1,apply:()=>{ state.player.baseCool *= 0.95; }},
      {id:'s2',title:'Shield Tech',desc:'Gain shield on pickup',cost:1,apply:()=>{ state.player.shield += 1; }},
      {id:'s3',title:'Drone Expert',desc:'Orbiters deal more damage',cost:1,apply:()=>{ state.player.orbiters.forEach(o=>o.damage = (o.damage||1)+1); }},
    ];
    skills.forEach(s=>{
      const div = document.createElement('div'); div.className = 'skill';
      div.innerHTML = `<div style="font-weight:700">${s.title}</div><div style="color:#9aa7bf">${s.desc}</div>`;
      div.onclick = () => {
        if(!state.skills[s.id]){
          state.skills[s.id] = true;
          s.apply();
          div.style.opacity = 0.5;
        }
      };
      list.appendChild(div);
    });
    overlay.style.display = 'flex';
  }

  // ---- Collision helpers ----
  function circleHit(a,b){
    return dist(a.x,a.y,b.x,b.y) <= (a.r + b.r);
  }

  // ---- Update loop ----
  function update(dt){
    if(!state.running || state.paused || state.inUpgrade) return;
    // player update
    state.player.update(dt);

    // bullets
    for(const b of state.bullets) b.update(dt);
    for(const b of state.eBullets) b.update(dt);
    for(const p of state.particles) p.update(dt);
    for(const pu of state.pickups) pu.update(dt);

    // enemies
    for(const e of state.enemies) e.update(dt);
    if(state.boss) state.boss.update(dt);

    // bullet collisions
    for(let i=state.bullets.length-1;i>=0;i--){
      const b = state.bullets[i];
      if(b.y < -60 || b.y > H+60 || b.x < -60 || b.x > W+60){ state.bullets.splice(i,1); continue; }
      // boss hit
      if(state.boss && circleHit(b, {x:state.boss.x,y:state.boss.y,r:state.boss.r})){
        state.bullets.splice(i,1);
        state.boss.hp -= (1 + (state.permanentUpgrades.damage||0));
        state.particles.push(new Particle(b.x,b.y,'#ffb86b',300));
        if(state.boss.hp <= 0){
          addScore(1000);
          state.boss = null;
          state.enemiesLeft = 0;
          waveCleared();
        }
        continue;
      }
      // enemy hit
      for(let j=state.enemies.length-1;j>=0;j--){
        const e = state.enemies[j];
        if(circleHit(b,e)){
          state.bullets.splice(i,1);
          e.hp -= (1 + (state.permanentUpgrades.damage||0));
          state.particles.push(new Particle(b.x,b.y,'#ffd6d6',300));
          if(e.hp <= 0){
            // death
            state.enemies.splice(j,1);
            state.enemiesLeft--;
            addScore(e.elite?80:20);
            // drop pickups
            if(Math.random() < 0.25) state.pickups.push(new Pickup(e.x,e.y,'credit', rndInt(20,60)));
            if(Math.random() < 0.08) state.pickups.push(new Pickup(e.x,e.y,'hp',1));
            // splitters spawn smaller enemies
            if(e.splitOnDeath){
              for(let k=0;k<2;k++){
                const ne = new Enemy(e.x + rand(-10,10), e.y + rand(-10,10), 0);
                state.enemies.push(ne);
                state.enemiesLeft++;
              }
            }
            if(state.enemiesLeft <= 0) waveCleared();
          }
          break;
        }
      }
    }

    // enemy bullets hit player
    for(let i=state.eBullets.length-1;i>=0;i--){
      const b = state.eBullets[i];
      if(b.y < -120 || b.y > H+120 || b.x < -120 || b.x > W+120){ state.eBullets.splice(i,1); continue; }
      if(circleHit(b, state.player)){
        state.eBullets.splice(i,1);
        damagePlayer(1);
      }
    }

    // pickups
    for(let i=state.pickups.length-1;i>=0;i--){
      const p = state.pickups[i];
      if(circleHit(p, state.player)){
        if(p.type === 'credit') state.shopCredits += p.amount;
        else if(p.type === 'hp'){ state.player.hp = Math.min(state.player.maxHp, state.player.hp + p.amount); }
        state.pickups.splice(i,1);
        sfx('power');
      }
    }

    // particles cleanup
    for(let i=state.particles.length-1;i>=0;i--){
      if(state.particles[i].age > state.particles[i].life) state.particles.splice(i,1);
    }

    updateUI();
  }

  // ---- Draw loop ----
  function draw(){
    // background grid (neon)
    ctx.fillStyle = '#050814';
    ctx.fillRect(0,0,W,H);
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    const step = 40;
    for(let x=0;x<W;x+=step){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
    for(let y=0;y<H;y+=step){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
    ctx.restore();

    // draw particles
    for(const p of state.particles) p.draw();

    // draw pickups
    for(const pu of state.pickups) pu.draw();

    // draw enemies
    for(const e of state.enemies) e.draw();

    // draw boss
    if(state.boss) state.boss.draw();

    // draw bullets
    for(const b of state.bullets) b.draw();
    for(const b of state.eBullets) b.draw();

    // draw player
    state.player.draw();

    // HUD overlays (weapon, credits)
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(10, H-60, 260, 44);
    ctx.fillStyle = '#fff';
    ctx.font = '13px Inter, Arial';
    ctx.fillText(`Weapon: ${state.weapons[state.weaponIndex].name}`, 18, H-38);
    ctx.fillText(`Credits: ${state.shopCredits}`, 18, H-20);
    ctx.restore();
  }

  // ---- Main loop ----
  function loop(){
    const t = now();
    let dt = (t - state.time)/1000;
    if(dt > 0.033) dt = 0.033;
    state.time = t;
    state.dt = dt;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  // ---- Helpers ----
  function restart(){
    location.reload();
  }
  function togglePause(){
    state.paused = !state.paused;
    document.getElementById('btnPause').textContent = state.paused ? 'Resume' : 'Pause';
  }
  function switchWeapon(dir){
    state.weaponIndex = (state.weaponIndex + dir + state.weapons.length) % state.weapons.length;
    sfx('power');
  }

  // ---- UI bindings ----
  document.getElementById('btnRestart').addEventListener('click', restart);
  document.getElementById('btnPause').addEventListener('click', togglePause);
  document.getElementById('btnShop').addEventListener('click', openShop);
  document.getElementById('closeShop').addEventListener('click', ()=>{ document.getElementById('shopOverlay').style.display='none'; });
  document.getElementById('btnSkills').addEventListener('click', openSkills);
  document.getElementById('closeSkills').addEventListener('click', ()=>{ document.getElementById('skillOverlay').style.display='none'; });

  // ---- Initialization ----
  function init(){
    initAudio();
    registerWeapons();
    state.player = new Player();
    state.weaponIndex = 0;
    state.shopCredits = 0;
    spawnWave();
    updateUI();
    loop();
  }

  // ---- Expose some debug helpers on window for convenience ----
  window.__nda = {
    addEnemy: (n=1)=>{ for(let i=0;i<n;i++){ state.enemies.push(new Enemy(rand(0,W), rand(0,H), 0)); state.enemiesLeft++; } },
    addScore: (s=100)=>{ addScore(s); updateUI(); },
    spawnBoss: ()=>{ state.boss = new Boss(); }
  };

  // Start
  init();

})();
