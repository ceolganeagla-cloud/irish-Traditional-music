
/* Ceol Gan Eagla — Together in Tradition (name is editable in index.html)
   Single-file front-end app using ABCJS (CDN) to render + play ABC,
   with a book-style flip, local library search, and PDF-by-URL view.
   All original code. */
let STATE = {
  tunes: [],
  currentIndex: 0,
  synth: null,
  visualObj: null,
  isPlaying: false,
  selectedInstrument: "violin"
};

const $ = (sel, el=document) => el.querySelector(sel);
const $$ = (sel, el=document) => [...el.querySelectorAll(sel)];

async function init(){
  // Load local tunes
  try{
    const res = await fetch("data/tunes.json", {cache:"no-store"});
    const data = await res.json();
    STATE.tunes = data.tunes || [];
  }catch(e){
    console.error("tunes load failed", e);
    STATE.tunes = [];
  }
  buildLibrary();
  bindNav();
  loadFromIndex(0);
  $("#appVersion").textContent = "v1.0";
}

function bindNav(){
  $$(".nav button").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      $$(".nav button").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      const target = btn.dataset.target;
      $$(".section").forEach(s=>s.classList.remove("active"));
      $("#" + target).classList.add("active");
    });
  });
  // default
  $(`.nav button[data-target="book"]`).click();

  $("#prevBtn").addEventListener("click", prevPage);
  $("#nextBtn").addEventListener("click", nextPage);
  $("#playBtn").addEventListener("click", playPause);
  $("#stopBtn").addEventListener("click", stopPlay);
  $("#instrument").addEventListener("change", e=>{
    STATE.selectedInstrument = e.target.value;
    renderCurrent();
  });
  $("#abcInput").addEventListener("input", ()=>{
    // Live preview typing ABC
    renderABC($("#abcInput").value);
  });
  $("#applyAbc").addEventListener("click", ()=>{
    const title = $("#abcTitle").value.trim() || "Untitled";
    const type = $("#abcType").value.trim() || "Tune";
    const abc  = $("#abcInput").value.trim();
    if(!abc) return;
    STATE.tunes.push({id: Date.now().toString(36), title, type, abc});
    buildLibrary();
    const idx = STATE.tunes.length - 1;
    loadFromIndex(idx);
    $(`.nav button[data-target="book"]`).click();
  });

  $("#pdfOpen").addEventListener("click", ()=>{
    const url = $("#pdfUrl").value.trim();
    if(!url) return;
    $("#pdfFrame").src = url;
  });

  $("#search").addEventListener("input", filterLibrary);
}

function buildLibrary(list=STATE.tunes){
  const wrap = $("#libraryList");
  wrap.innerHTML = "";
  list.forEach((t, i)=>{
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = \`
      <div>
        <div><strong>\${t.title}</strong></div>
        <div class="meta">\${t.type || ""}</div>
      </div>
      <div class="controls">
        <button class="btn smallBtn" data-i="\${i}">Open</button>
      </div>\`;
    div.querySelector("button").addEventListener("click", ()=>{
      loadFromIndex(i);
      $(`.nav button[data-target="book"]`).click();
    });
    wrap.appendChild(div);
  });
}

function filterLibrary(){
  const q = $("#search").value.toLowerCase();
  const filtered = STATE.tunes.filter(t=>(t.title + " " + (t.type||"")).toLowerCase().includes(q));
  buildLibrary(filtered);
}

function loadFromIndex(i){
  if(i<0 || i>=STATE.tunes.length) return;
  STATE.currentIndex = i;
  renderCurrent();
  updatePager();
}

function updatePager(){
  $("#pagePos").textContent = \`\${STATE.currentIndex+1} / \${STATE.tunes.length}\`;
  $("#pageTitle").textContent = STATE.tunes[STATE.currentIndex]?.title || "";
  $("#pageType").textContent = STATE.tunes[STATE.currentIndex]?.type || "";
}

function renderCurrent(){
  const tune = STATE.tunes[STATE.currentIndex];
  if(!tune){ $("#abcOut").innerHTML = "<div class='notice'>No tune loaded.</div>"; return; }
  $("#abcSource").textContent = tune.abc;
  renderABC(tune.abc);
}

function renderABC(abcText){
  const out = $("#abcOut");
  out.innerHTML = "";
  try{
    const engraverParams = { responsive: "resize", viewportHorizontal: true };
    const visual = ABCJS.renderAbc(out, abcText, engraverParams);
    STATE.visualObj = visual && visual[0] ? visual[0] : null;
  }catch(e){
    out.innerHTML = "<div class='notice'>ABC parse error.</div>";
    console.error(e);
  }
}

async function prepareSynth(){
  if(!STATE.visualObj) return;
  if(!STATE.synth){
    STATE.synth = new ABCJS.synth.CreateSynth();
  }
  try{
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    await STATE.synth.init({ audioContext, visualObj: STATE.visualObj });
    const control = new ABCJS.synth.SynthController();
    control.load("#synthCtrl", null, {displayPlay:false, displayProgress:true});
    await STATE.synth.prime();
    // Try to set a General MIDI program for "violin"/"accordion"/"guitar" approximation
    const programMap = { violin:40, accordion:22, mandolin:25 };
    const program = programMap[STATE.selectedInstrument] || 40;
    STATE.synth.setProgram(program);
  }catch(e){
    console.warn("synth init failed", e);
  }
}

async function playPause(){
  if(STATE.isPlaying){
    stopPlay();
    return;
  }
  await prepareSynth();
  if(!STATE.synth || !STATE.visualObj) return;
  STATE.isPlaying = true;
  $("#playBtn").disabled = true;
  $("#stopBtn").disabled = false;
  try{
    await STATE.synth.start();
  } finally {
    STATE.isPlaying = false;
    $("#playBtn").disabled = false;
    $("#stopBtn").disabled = true;
  }
}

function stopPlay(){
  if(STATE.synth){
    try{ STATE.synth.stop(); }catch{}
  }
  STATE.isPlaying = false;
  $("#playBtn").disabled = false;
  $("#stopBtn").disabled = true;
}

function prevPage(){
  const prev = Math.max(0, STATE.currentIndex - 1);
  if(prev !== STATE.currentIndex){
    animateFlip("prev");
    loadFromIndex(prev);
  }
}
function nextPage(){
  const next = Math.min(STATE.tunes.length - 1, STATE.currentIndex + 1);
  if(next !== STATE.currentIndex){
    animateFlip("next");
    loadFromIndex(next);
  }
}
function animateFlip(dir){
  const p = $("#pageA");
  p.classList.remove("hidden");
  p.classList.add("turning");
  requestAnimationFrame(()=>{
    p.classList.toggle("flipped", dir==="next");
    setTimeout(()=>{
      p.classList.remove("turning");
      p.classList.add("hidden");
      p.classList.remove("flipped");
    }, 820);
  });
}

window.addEventListener("load", init);
