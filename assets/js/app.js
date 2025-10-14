
let STATE = { tunes:[], currentIndex:0, synth:null, visualObj:null, isPlaying:false, selectedInstrument:"violin" };
const $ = (sel, el=document)=>el.querySelector(sel);
const $$ = (sel, el=document)=>[...el.querySelectorAll(sel)];

function loadScript(src){
  return new Promise((resolve, reject)=>{
    const s=document.createElement("script");
    s.src=src; s.async=true;
    s.onload=resolve; s.onerror=()=>reject(new Error("Failed to load "+src));
    document.head.appendChild(s);
  });
}
async function ensureAbcjs(){
  if(window.ABCJS) return;
  await loadScript("https://cdn.jsdelivr.net/npm/abcjs@6.4.3/dist/abcjs-min.js");
}

async function init(){
  try{
    await ensureAbcjs();
  }catch(e){
    console.error("ABCJS failed to load", e);
    // show a friendly message but keep app alive
    const out = $("#abcOut"); if(out){ out.innerHTML = "<div class='notice'>Could not load music engine. Check network/content blockers and reload.</div>"; }
    return;
  }

  try{
    const res = await fetch("data/tunes.json",{cache:"no-store"});
    const data = await res.json();
    STATE.tunes = data.tunes || [];
  }catch(e){ console.error("tunes load failed", e); STATE.tunes=[]; }
  buildLibrary();
  bindNav();
  loadFromIndex(0);
  $("#appVersion").textContent = "v1.0.2";
  renderPreview("");
}

function bindNav(){
  $$(".nav button").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      $$(".nav button").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      const target = btn.dataset.target;
      $$(".section").forEach(s=>s.classList.remove("active"));
      $("#"+target).classList.add("active");
    });
  });
  $(`.nav button[data-target="book"]`).click();

  $("#prevBtn").addEventListener("click", prevPage);
  $("#nextBtn").addEventListener("click", nextPage);
  $("#playBtn").addEventListener("click", playPause);
  $("#stopBtn").addEventListener("click", stopPlay);
  $("#instrument").addEventListener("change", e=>{ STATE.selectedInstrument = e.target.value; renderCurrent(); });

  $("#abcInput").addEventListener("input", ()=>{ renderPreview($("#abcInput").value); });
  $("#applyAbc").addEventListener("click", ()=>{
    const title = ($("#abcTitle").value||"Untitled").trim();
    const type  = ($("#abcType").value||"Tune").trim();
    const abc   = ($("#abcInput").value||"").trim();
    if(!abc) return;
    STATE.tunes.push({ id:Date.now().toString(36), title, type, abc });
    buildLibrary();
    loadFromIndex(STATE.tunes.length - 1);
    $(`.nav button[data-target="book"]`).click();
  });

  $("#pdfOpen").addEventListener("click", ()=>{
    const url = $("#pdfUrl").value.trim();
    if(url) $("#pdfFrame").src = url;
  });

  $("#search").addEventListener("input", filterLibrary);
}

function buildLibrary(list=STATE.tunes){
  const wrap = $("#libraryList"); wrap.innerHTML="";
  list.forEach((t,i)=>{
    const div = document.createElement("div");
    div.className="item";
    div.innerHTML = `<div><div><strong>${t.title}</strong></div><div class="meta">${t.type||""}</div></div><div class="controls"><button class="btn smallBtn" data-i="${i}">Open</button></div>`;
    div.querySelector("button").addEventListener("click", ()=>{ loadFromIndex(i); $(`.nav button[data-target="book"]`).click(); });
    wrap.appendChild(div);
  });
}

function filterLibrary(){
  const q = $("#search").value.toLowerCase();
  buildLibrary( STATE.tunes.filter(t=>(t.title+" "+(t.type||"")).toLowerCase().includes(q)) );
}

function loadFromIndex(i){
  if(i<0 || i>=STATE.tunes.length) return;
  STATE.currentIndex = i;
  renderCurrent();
  updatePager();
}

function updatePager(){
  $("#pagePos").textContent = `${STATE.currentIndex+1} / ${STATE.tunes.length}`;
  $("#pageTitle").textContent = STATE.tunes[STATE.currentIndex]?.title || "";
  $("#pageType").textContent  = STATE.tunes[STATE.currentIndex]?.type || "";
}

function renderCurrent(){
  const tune = STATE.tunes[STATE.currentIndex];
  if(!tune){ $("#abcOut").innerHTML = "<div class='notice'>No tune loaded.</div>"; return; }
  $("#abcSource").textContent = tune.abc;
  renderABC(tune.abc);
}

function renderABC(abcText){
  const out = $("#abcOut"); out.innerHTML="";
  if(!window.ABCJS){ out.innerHTML="<div class='notice'>Engine not loaded.</div>"; return; }
  try{
    const engraverParams = { responsive:"resize", viewportHorizontal:true };
    const visual = ABCJS.renderAbc(out, abcText, engraverParams);
    STATE.visualObj = visual && visual[0] ? visual[0] : null;
  }catch(e){
    out.innerHTML = "<div class='notice'>ABC parse error.</div>";
    console.error(e);
  }
}

function renderPreview(abcText){
  const out = $("#abcPreview"); if(!out) return;
  out.innerHTML="";
  if(!window.ABCJS){ out.innerHTML="<div class='notice'>Engine not loaded.</div>"; return; }
  try{
    ABCJS.renderAbc(out, abcText || "X:1\nT:Preview\nK:C\nCDEF GABc|", { responsive:"resize", viewportHorizontal:true });
  }catch(e){ console.warn("preview error", e); }
}

async function prepareSynth(){
  if(!STATE.visualObj) return;
  await ensureAbcjs();
  if(!STATE.synth){ STATE.synth = new ABCJS.synth.CreateSynth(); }
  try{
    const audioContext = new (window.AudioContext||window.webkitAudioContext)();
    await audioContext.resume();
    await STATE.synth.init({ audioContext, visualObj: STATE.visualObj });
    const control = new ABCJS.synth.SynthController();
    control.load("#synthCtrl", null, {displayPlay:false, displayProgress:true});
    await STATE.synth.prime();
    const programMap = { violin:40, accordion:22, mandolin:25 };
    STATE.synth.setProgram(programMap[STATE.selectedInstrument]||40);
  }catch(e){ console.warn("synth init failed", e); }
}

async function playPause(){
  if(STATE.isPlaying){ stopPlay(); return; }
  await prepareSynth();
  if(!STATE.synth || !STATE.visualObj) return;
  STATE.isPlaying = true;
  $("#playBtn").disabled = true; $("#stopBtn").disabled = false;
  try{ await STATE.synth.start(); }
  finally{ STATE.isPlaying=false; $("#playBtn").disabled=false; $("#stopBtn").disabled=true; }
}
function stopPlay(){ if(STATE.synth){ try{ STATE.synth.stop(); }catch{} } STATE.isPlaying=false; $("#playBtn").disabled=false; $("#stopBtn").disabled=true; }

function prevPage(){ const p=Math.max(0, STATE.currentIndex-1); if(p!==STATE.currentIndex){ animateFlip("prev"); loadFromIndex(p);} }
function nextPage(){ const n=Math.min(STATE.tunes.length-1, STATE.currentIndex+1); if(n!==STATE.currentIndex){ animateFlip("next"); loadFromIndex(n);} }
function animateFlip(dir){
  const p=$("#pageA"); p.classList.remove("hidden"); p.classList.add("turning");
  requestAnimationFrame(()=>{ p.classList.toggle("flipped", dir==="next"); setTimeout(()=>{ p.classList.remove("turning"); p.classList.add("hidden"); p.classList.remove("flipped"); }, 820); });
}
window.addEventListener("load", init);
