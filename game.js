(() => {
  "use strict";
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const $ = (id) => document.getElementById(id);
  const STORE_KEY = "neonRushSaveV1";
  const defaults = { best: 0, totalOrbs: 0, runs: 0, achievements: [] };
  let save = loadSave();
  let state = "ready";
  let score = 0, runOrbs = 0, distance = 0, speed = 330, lastTime = 0, spawnTimer = 0;
  let obstacles = [], orbs = [], particles = [], stars = [];
  let soundOn = true, audioCtx = null, animationId = null;
  const groundY = 355;
  const player = { x: 150, y: groundY - 48, w: 32, h: 48, vy: 0, grounded: true, squash: 0 };
  const GRAVITY = 1650, JUMP_VELOCITY = -630;
  const achievements = [
    { id:"first_run", icon:"✦", name:"First Steps", desc:"Finish your first run", test:()=>save.runs>=1 },
    { id:"score_500", icon:"⚡", name:"Speed Seeker", desc:"Score 500 points", test:()=>save.best>=500 },
    { id:"orb_10", icon:"◆", name:"Energy Hunter", desc:"Collect 10 energy orbs", test:()=>save.totalOrbs>=10 },
    { id:"score_1500", icon:"♛", name:"Neon Legend", desc:"Score 1,500 points", test:()=>save.best>=1500 }
  ];
  function loadSave() {
    try { return { ...defaults, ...JSON.parse(localStorage.getItem(STORE_KEY) || "{}") }; }
    catch { return { ...defaults, achievements: [] }; }
  }
  function persist() { try { localStorage.setItem(STORE_KEY, JSON.stringify(save)); } catch {} }
  function fmt(n) { return String(Math.floor(n)).padStart(5, "0"); }
  function updateStats() {
    $("score").textContent = fmt(score);
    $("bestScore").textContent = fmt(save.best);
    $("orbs").textContent = runOrbs;
    $("sideBest").textContent = save.best;
    $("totalOrbs").textContent = save.totalOrbs;
    $("runsPlayed").textContent = save.runs;
    $("year").textContent = new Date().getFullYear();
    $("achievementList").innerHTML = achievements.map(a => {
      const unlocked = save.achievements.includes(a.id);
      return `<div class="achievement ${unlocked ? "unlocked" : ""}"><span class="achievement-icon">${a.icon}</span><div><strong>${a.name}${unlocked ? " ✓" : ""}</strong><small>${a.desc}</small></div></div>`;
    }).join("");
  }
  function checkAchievements() {
    let changed = false;
    for (const a of achievements) {
      if (!save.achievements.includes(a.id) && a.test()) {
        save.achievements.push(a.id); changed = true;
      }
    }
    if (changed) { persist(); updateStats(); }
  }
  function audio() {
    if (!soundOn) return null;
    try {
      audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume();
      return audioCtx;
    } catch { return null; }
  }
  function beep(freq=440, duration=.09, type="sine", volume=.035, slide=0) {
    const ac = audio(); if (!ac) return;
    const osc = ac.createOscillator(), gain = ac.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, ac.currentTime);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), ac.currentTime + duration);
    gain.gain.setValueAtTime(volume, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, ac.currentTime + duration);
    osc.connect(gain); gain.connect(ac.destination); osc.start(); osc.stop(ac.currentTime + duration);
  }
  function resetGame() {
    score = 0; runOrbs = 0; distance = 0; speed = 330; spawnTimer = .7;
    obstacles = []; orbs = []; particles = [];
    player.y = groundY - player.h; player.vy = 0; player.grounded = true; player.squash = 0;
    updateStats();
  }
  function startGame() {
    if (state === "running") return;
    resetGame(); state = "running"; $("overlay").classList.add("hidden");
    save.runs++; persist(); checkAchievements(); updateStats();
    lastTime = performance.now();
    if (!animationId) animationId = requestAnimationFrame(loop);
  }
  function endGame() {
    state = "over";
    if (score > save.best) save.best = Math.floor(score);
    save.totalOrbs += runOrbs; persist(); checkAchievements(); updateStats();
    $("overlayTitle").textContent = "Run ended.";
    $("overlayText").textContent = `You scored ${Math.floor(score)} points and collected ${runOrbs} energy orbs. Ready for another run?`;
    $("startButton").textContent = "↻ Run again";
    $("overlay").classList.remove("hidden");
    beep(180, .25, "sawtooth", .045, -100);
  }
  function jump() {
    if (state !== "running") { startGame(); return; }
    if (player.grounded) {
      player.vy = JUMP_VELOCITY; player.grounded = false; player.squash = 1;
      beep(350, .12, "triangle", .035, 260);
      for (let i=0;i<7;i++) particles.push({x:player.x+player.w/2,y:groundY,vx:(Math.random()-.5)*130,vy:-Math.random()*120,life:.35,max:.35,size:2+Math.random()*3,color:"#5df4ff"});
    }
  }
  function addObstacle() {
    const tall = Math.random() > .42;
    const h = tall ? 35 + Math.random()*22 : 22 + Math.random()*12;
    const w = tall ? 24 + Math.random()*13 : 34 + Math.random()*16;
    obstacles.push({x:canvas.width+25,y:groundY-h,w,h,phase:Math.random()*6});
    if (Math.random() > .3) orbs.push({x:canvas.width+115,y:groundY-72-Math.random()*42,r:8,phase:Math.random()*6,taken:false});
  }
  function collision(a,b) {
    return a.x+5 < b.x+b.w-4 && a.x+a.w-5 > b.x+4 && a.y+5 < b.y+b.h-3 && a.y+a.h-3 > b.y+3;
  }
  function update(dt) {
    if (state !== "running") return;
    distance += speed*dt; speed = Math.min(590, 330 + score*.09);
    score += dt * (speed*.1); spawnTimer -= dt;
    if (spawnTimer <= 0) { addObstacle(); spawnTimer = Math.max(.72, 1.32 - (speed-330)/700) + Math.random()*.42; }
    player.vy += GRAVITY*dt; player.y += player.vy*dt;
    if (player.y + player.h >= groundY) { player.y=groundY-player.h; player.vy=0; player.grounded=true; }
    player.squash = Math.max(0,player.squash-dt*4);
    for (const o of obstacles) o.x -= speed*dt;
    obstacles = obstacles.filter(o=>o.x+o.w>-10);
    for (const orb of orbs) { orb.x -= speed*dt; orb.phase += dt*5; if (!orb.taken && collision(player,{x:orb.x-orb.r,y:orb.y-orb.r,w:orb.r*2,h:orb.r*2})) { orb.taken=true; runOrbs++; score+=25; beep(720,.08,"sine",.025,260); for(let i=0;i<7;i++)particles.push({x:orb.x,y:orb.y,vx:(Math.random()-.5)*180,vy:(Math.random()-.5)*180,life:.4,max:.4,size:2+Math.random()*3,color:"#5df4ff"}); } }
    orbs = orbs.filter(o=>o.x>-20&&!o.taken);
    for (const o of obstacles) { if (collision(player,o)) { endGame(); break; } }
    for (const p of particles) { p.x+=p.vx*dt; p.y+=p.vy*dt; p.vy+=280*dt; p.life-=dt; }
    particles=particles.filter(p=>p.life>0);
    updateStats();
    if (Math.floor(score)>save.best) { /* final best is committed on crash */ }
  }
  function roundedRect(x,y,w,h,r) {
    ctx.beginPath(); ctx.roundRect(x,y,w,h,r); ctx.fill();
  }
  function drawBackground(t) {
    const g=ctx.createLinearGradient(0,0,0,canvas.height); g.addColorStop(0,"#0b1028");g.addColorStop(1,"#090b18");ctx.fillStyle=g;ctx.fillRect(0,0,canvas.width,canvas.height);
    // distant skyline
    for(let i=0;i<24;i++){
      const x=((i*57 - (distance*.13)%57)+canvas.width)%canvas.width;
      const h=50+(i*37%105); ctx.fillStyle=i%3===0?"#151c3d":"#10162e";ctx.fillRect(x,groundY-h,34,h);
      ctx.fillStyle="#5df4ff";ctx.globalAlpha=.18;
      for(let wy=groundY-h+12;wy<groundY-8;wy+=16) if((i+Math.floor(wy/16))%3===0)ctx.fillRect(x+8,wy,3,5);
      ctx.globalAlpha=1;
    }
    // stars
    for(let i=0;i<55;i++){const x=(i*173+Math.sin(t*.0004+i)*18)%canvas.width;const y=(i*47)%250;ctx.fillStyle="#9caeff";ctx.globalAlpha=.25+(i%4)*.12;ctx.fillRect(x,y,2,2)}
    ctx.globalAlpha=1;
    ctx.strokeStyle="#252b56";ctx.lineWidth=1;
    for(let i=0;i<15;i++){const x=((i*80-(distance*.6)%80)+canvas.width)%canvas.width;ctx.beginPath();ctx.moveTo(x,groundY);ctx.lineTo(canvas.width/2+(x-canvas.width/2)*.08,groundY+85);ctx.stroke()}
    ctx.fillStyle="#10152b";ctx.fillRect(0,groundY,canvas.width,canvas.height-groundY);
    ctx.strokeStyle="#5df4ff";ctx.globalAlpha=.65;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,groundY);ctx.lineTo(canvas.width,groundY);ctx.stroke();ctx.globalAlpha=1;
    ctx.strokeStyle="#28345e";ctx.lineWidth=1;
    for(let i=0;i<20;i++){const x=((i*70-(distance*1.05)%70)+canvas.width)%canvas.width;ctx.beginPath();ctx.moveTo(x,groundY);ctx.lineTo(x-25,canvas.height);ctx.stroke()}
  }
  function drawPlayer(t) {
    const x=player.x,y=player.y;
    ctx.save();ctx.shadowBlur=22;ctx.shadowColor="#5df4ff";
    const grad=ctx.createLinearGradient(x,y,x+player.w,y+player.h);grad.addColorStop(0,"#a8ffff");grad.addColorStop(1,"#5b8dff");ctx.fillStyle=grad;
    const squash=player.squash*.08;ctx.translate(x+player.w/2,y+player.h);ctx.scale(1+squash,1-squash);roundedRect(-player.w/2,-player.h,player.w,player.h,9);
    ctx.shadowBlur=0;ctx.fillStyle="#111832";roundedRect(-9,-35,19,7,3);ctx.fillStyle="#fff";ctx.fillRect(5,-34,4,4);
    ctx.restore();
    // trailing glow
    ctx.globalAlpha=.22;ctx.fillStyle="#5df4ff";ctx.fillRect(x-22,y+12,18,3);ctx.fillRect(x-13,y+22,9,2);ctx.globalAlpha=1;
  }
  function drawObstacles(t) {
    for(const o of obstacles){ctx.save();ctx.shadowBlur=16;ctx.shadowColor="#ff65d8";ctx.fillStyle="#251737";roundedRect(o.x,o.y,o.w,o.h,5);ctx.strokeStyle="#ff65d8";ctx.lineWidth=2;ctx.stroke();ctx.shadowBlur=0;ctx.fillStyle="#ff65d8";ctx.globalAlpha=.65;ctx.fillRect(o.x+5,o.y+5,3,o.h-10);ctx.globalAlpha=1;ctx.restore()}
    for(const o of orbs){ctx.save();ctx.translate(o.x,o.y+Math.sin(o.phase)*5);ctx.rotate(o.phase*.3);ctx.shadowBlur=18;ctx.shadowColor="#5df4ff";ctx.fillStyle="#5df4ff";ctx.beginPath();ctx.moveTo(0,-o.r);ctx.lineTo(o.r,0);ctx.lineTo(0,o.r);ctx.lineTo(-o.r,0);ctx.closePath();ctx.fill();ctx.restore()}
  }
  function drawParticles(){for(const p of particles){ctx.globalAlpha=Math.max(0,p.life/p.max);ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,p.size,p.size)}ctx.globalAlpha=1}
  function draw(t=0) {
    drawBackground(t);drawObstacles(t);drawPlayer(t);drawParticles();
    if(state==="running"){ctx.fillStyle="#9ba4c8";ctx.font="11px system-ui";ctx.fillText("DISTANCE "+Math.floor(distance/10)+" m",canvas.width-140,25)}
  }
  function loop(t) {
    const dt=Math.min(.033,Math.max(0,(t-lastTime)/1000));lastTime=t;
    update(dt);draw(t);
    animationId=requestAnimationFrame(loop);
  }
  function restart() { state="ready"; $("overlayTitle").textContent="Enter the rush."; $("overlayText").textContent="Jump over barriers and collect glowing energy orbs."; $("startButton").textContent="▶ Start running"; $("overlay").classList.remove("hidden"); resetGame(); draw(performance.now()); }
  $("startButton").addEventListener("click",startGame);
  $("restartButton").addEventListener("click",restart);
  $("jumpButton").addEventListener("pointerdown",e=>{e.preventDefault();jump()});
  canvas.addEventListener("pointerdown",()=>{ if(state==="running")jump(); });
  window.addEventListener("keydown",e=>{if(["Space","ArrowUp","KeyW"].includes(e.code)){e.preventDefault();if(!e.repeat)jump()}});
  $("soundToggle").addEventListener("click",()=>{soundOn=!soundOn;$("soundToggle").innerHTML=soundOn?"🔊 <span>Sound</span>":"🔇 <span>Muted</span>";if(soundOn)beep(520,.07)});
  document.addEventListener("visibilitychange",()=>{if(document.hidden&&state==="running"){state="paused";$("overlayTitle").textContent="Paused."; $("overlayText").textContent="Welcome back. Press start to begin a fresh run."; $("startButton").textContent="▶ Resume with a new run";$("overlay").classList.remove("hidden")}});
  // Initialize static stars and first frame.
  for(let i=0;i<55;i++)stars.push({x:Math.random()*canvas.width,y:Math.random()*250});
  updateStats(); resetGame(); draw();
  animationId=requestAnimationFrame((t)=>{lastTime=t;loop(t)});
})();