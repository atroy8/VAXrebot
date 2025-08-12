(function(){
  const INTRO_FLAG = 'vaxrebot:introSeen';

  class AudioManager {
    constructor(){
      this.ctx = null;
      this.master = { gain: null, muted: false, vol: parseFloat(localStorage.getItem('vax:vol:master')||'0.7') };
      this.music  = { gain: null, current: null, queue: [], vol: parseFloat(localStorage.getItem('vax:vol:music')||'0.6') };
      this.sfx    = { gain: null, vol: parseFloat(localStorage.getItem('vax:vol:sfx')||'0.8'), list: [] };
      this.ui = {};
    }
    unlock(){
      if (this.ctx) return;
      try{
        this.ctx = new (window.AudioContext||window.webkitAudioContext)();
        this.master.gain = this.ctx.createGain();
        this.music.gain  = this.ctx.createGain();
        this.sfx.gain    = this.ctx.createGain();
        this.music.gain.connect(this.master.gain);
        this.sfx.gain.connect(this.master.gain);
        this.master.gain.connect(this.ctx.destination);
        this.setMaster(this.master.vol);
        this.setMusic(this.music.vol);
        this.setSfx(this.sfx.vol);
      }catch(e){ console.warn('Audio not available', e); }
    }
    bindUi(ui){
      this.ui = ui;
      ui.volMaster?.addEventListener('input', e=> this.setMaster(parseFloat(e.target.value)));
      ui.volMusic?.addEventListener('input', e=> this.setMusic(parseFloat(e.target.value)));
      ui.volSfx?.addEventListener('input', e=> this.setSfx(parseFloat(e.target.value)));
      ui.muteMaster?.addEventListener('click', ()=> this.toggleMute());
      ui.playMusic?.addEventListener('click', ()=> this.toggleMusic());
      ui.fileMusic?.addEventListener('change', e=> this.loadFiles(e.target.files, 'music'));
      ui.fileSfx?.addEventListener('change', e=> this.loadFiles(e.target.files, 'sfx'));
      ui.addUrl?.addEventListener('click', ()=> {
        const url = ui.urlInput?.value?.trim();
        if (url) this.loadFromUrl(url, 'music');
      });
    }
    now(){ return this.ctx ? this.ctx.currentTime : 0; }
    setMaster(v){ this.master.vol = v; if (this.master.gain) this.master.gain.gain.setTargetAtTime(this.master.muted?0:v, this.now(), .02); localStorage.setItem('vax:vol:master', v); }
    setMusic(v){ this.music.vol = v; if (this.music.gain) this.music.gain.gain.setTargetAtTime(v, this.now(), .02); localStorage.setItem('vax:vol:music', v); }
    setSfx(v){ this.sfx.vol = v; if (this.sfx.gain) this.sfx.gain.gain.setTargetAtTime(v, this.now(), .02); localStorage.setItem('vax:vol:sfx', v); }
    toggleMute(){ this.master.muted = !this.master.muted; this.setMaster(this.master.vol); }
    toggleMusic(){ if (!this.ctx) this.unlock(); if (this.music.current) this.stopMusic(); else this.playNext(); }
    async loadFiles(fileList, kind){ if (!fileList?.length) return; for (const f of fileList){ const buf = await f.arrayBuffer(); await this._addBuffer(buf, f.name, kind); } }
    async loadFromUrl(url, kind){ try{ const res = await fetch(url, {mode:'cors'}); const buf = await res.arrayBuffer(); await this._addBuffer(buf, url.split('/').pop()||'track', kind, url); }catch(e){ console.warn('Failed to fetch audio', e); } }
    async _addBuffer(arrayBuf, label, kind, src){
      if (!this.ctx) this.unlock();
      const audioBuf = await this.ctx.decodeAudioData(arrayBuf.slice(0));
      const item = { label, buf: audioBuf, src };
      if (kind === 'music'){ this.music.queue.push(item); this._renderList('music'); if (!this.music.current) this.playNext(); }
      else { this.sfx.list.push(item); this._renderList('sfx'); }
    }
    _renderList(kind){
      const ul = kind==='music' ? this.ui.musicList : this.ui.sfxList;
      if (!ul) return; ul.innerHTML='';
      const list = kind==='music' ? this.music.queue : this.sfx.list;
      list.forEach((item, idx)=>{
        const li = document.createElement('li');
        li.textContent = item.label;
        if (kind==='music'){
          const b1 = document.createElement('button'); b1.className='btn btn--tiny'; b1.textContent='Play'; b1.onclick = ()=> this.playIndex(idx);
          const b2 = document.createElement('button'); b2.className='btn btn--tiny'; b2.textContent='Remove'; b2.onclick = ()=>{ this.music.queue.splice(idx,1); this._renderList('music'); };
          li.append(b1,b2);
        } else {
          const b = document.createElement('button'); b.className='btn btn--tiny'; b.textContent='Test'; b.onclick = ()=> this.playSfx(idx);
          li.append(b);
        }
        ul.append(li);
      });
    }
    playIndex(i){ if (i<0 || i>=this.music.queue.length) return; this._playMusic(this.music.queue[i]); }
    playNext(){ if (!this.music.queue.length) return; this._playMusic(this.music.queue[0]); }
    stopMusic(){ if (!this.ctx || !this.music.current) return; try{ this.music.current.stop(); }catch(_){} this.music.current = null; }
    _playMusic(track){
      if (!this.ctx) this.unlock();
      const src = this.ctx.createBufferSource();
      src.buffer = track.buf; src.loop = true;
      const gain = this.ctx.createGain();
      src.connect(gain).connect(this.music.gain);
      const now = this.now();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(1, now + 1.2);
      if (this.music.current){
        const old = this.music.current._gain;
        if (old){ old.gain.cancelScheduledValues(now); old.gain.linearRampToValueAtTime(0, now + 1.0); }
        try{ this.music.current.stop(now + 1.05); }catch(_){}
      }
      src._gain = gain;
      src.start();
      this.music.current = src;
    }
    playSfx(i){
      if (!this.ctx) this.unlock();
      const item = this.sfx.list[i]; if (!item) return;
      const src = this.ctx.createBufferSource(); src.buffer = item.buf; src.connect(this.sfx.gain); src.start();
    }
  }

  class App {
    constructor(){
      this.currentScreen = 'home';
      this.homeVideo = null;
      this.introSeen = JSON.parse(localStorage.getItem(INTRO_FLAG) || 'false');
      this.tooltipEl = null;
      this.audio = null;
    }
    init(){
      this.bindEvents();
      this.tooltipEl = document.getElementById('tooltip');
      this.audio = new AudioManager();

      this.homeVideo = document.getElementById('intro-video');
      if (this.introSeen) {
        this.showScreen('menu');
      } else {
        this.showScreen('home');
        if (this.homeVideo) {
          const prefersReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
          if (!prefersReduced) this.homeVideo.play?.().catch(()=>{});
          this.homeVideo.addEventListener('ended', ()=> this.goToMenu());
        }
      }

      // Preload default tracks if available
      (async () => {
        const tryAdd = async (url, kind='music') => {
          try {
            const res = await fetch(url, { mode: 'cors' });
            if (!res.ok) return;
            const buf = await res.arrayBuffer();
            await this.audio._addBuffer(buf, url.split('/').pop(), kind, url);
          } catch(_){}
        };
        await tryAdd('assets/music/menu-theme.mp3','music');
        await tryAdd('assets/music/gameplay-loop.mp3','music');
        await tryAdd('assets/music/gameover-soft.mp3','music');
        await tryAdd('assets/sfx/ui-click.wav','sfx');
        await tryAdd('assets/sfx/ui-success.wav','sfx');
        await tryAdd('assets/sfx/ui-error.wav','sfx');
        await tryAdd('assets/sfx/ui-hover.wav','sfx');
      })();
    }
    bindEvents(){
      const enterBtn = document.getElementById('enter-app');
      const skipBtn = document.getElementById('skip-intro');
      const replayBtn = document.getElementById('replay-intro');
      const openAudioBtn = document.getElementById('open-audio');
      const closeAudioBtn = document.getElementById('close-audio');

      enterBtn && enterBtn.addEventListener('click', ()=> this.goToMenu());
      skipBtn && skipBtn.addEventListener('click', ()=> this.goToMenu());
      replayBtn && replayBtn.addEventListener('click', ()=>{
        localStorage.setItem(INTRO_FLAG,'false');
        this.introSeen = false;
        this.showScreen('home');
        this.homeVideo?.play?.().catch(()=>{});
        this._clickSfx();
      });
      openAudioBtn && openAudioBtn.addEventListener('click', ()=>{ this.toggleAudioPanel(true); this._clickSfx(); });
      closeAudioBtn && closeAudioBtn.addEventListener('click', ()=>{ this.toggleAudioPanel(false); this._clickSfx(); });

      window.addEventListener('keydown', (e)=>{
        if (this.currentScreen === 'home') {
          if (e.key === 'Enter' || e.key.toLowerCase() === 's') this.goToMenu();
        }
      });

      document.querySelectorAll('.scenario-card').forEach(card=>{
        const showTip = (ev)=>{ this.showTip(card, ev); };
        const hideTip = ()=> this.hideTip();
        card.addEventListener('mouseenter', (ev)=>{ showTip(ev); this._hoverSfx(); });
        card.addEventListener('mousemove', showTip);
        card.addEventListener('mouseleave', hideTip);
        card.addEventListener('focus', showTip);
        card.addEventListener('blur', hideTip);
        card.addEventListener('click', ()=>{ this._successSfx(); });
      });

      this.audio.bindUi({
        panel: document.getElementById('audio-panel'),
        volMaster: document.getElementById('vol-master'),
        volMusic: document.getElementById('vol-music'),
        volSfx: document.getElementById('vol-sfx'),
        muteMaster: document.getElementById('mute-master'),
        playMusic: document.getElementById('play-music'),
        fileMusic: document.getElementById('file-music'),
        fileSfx: document.getElementById('file-sfx'),
        urlInput: document.getElementById('url-audio'),
        addUrl: document.getElementById('add-url'),
        musicList: document.getElementById('music-list'),
        sfxList: document.getElementById('sfx-list')
      });
    }
    goToMenu(){
      if (this.homeVideo && !this.homeVideo.paused) {
        try { this.homeVideo.pause(); this.homeVideo.currentTime = 0; } catch(_){}
      }
      localStorage.setItem(INTRO_FLAG,'true');
      this.introSeen = true;
      this.showScreen('menu');
      document.getElementById('menu-screen')?.focus();
      this.audio?.unlock();
      if (!this.audio.music.current && this.audio.music.queue.length){
        const idx = this.audio.music.queue.findIndex(t => (t.label||'').includes('menu-theme'));
        if (idx >= 0) this.audio.playIndex(idx); else this.audio.playNext();
      }
      this._clickSfx();
    }
    showScreen(name){
      document.querySelectorAll('.screen').forEach(s=> s.classList.remove('active'));
      const target = document.getElementById(`${name}-screen`) || document.getElementById(name);
      target && target.classList.add('active');
      this.currentScreen = name;
      if (this.homeVideo) {
        if (name === 'home') {
          const prefersReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
          if (!prefersReduced) this.homeVideo.play?.().catch(()=>{});
        } else {
          try{ this.homeVideo.pause(); }catch(_){}
        }
      }
    }
    showTip(el, ev){
      if (!this.tooltipEl) return;
      const text = el.getAttribute('data-tip');
      if (!text) return;
      this.tooltipEl.textContent = text;
      const rect = el.getBoundingClientRect();
      const x = (ev?.clientX ?? rect.left + rect.width/2);
      const y = rect.top - 8;
      this.tooltipEl.style.left = x + 'px';
      this.tooltipEl.style.top = y + 'px';
      this.tooltipEl.removeAttribute('hidden');
      this.tooltipEl.setAttribute('data-pos','above');
    }
    hideTip(){ this.tooltipEl?.setAttribute('hidden',''); }
    toggleAudioPanel(open){
      const panel = document.getElementById('audio-panel');
      if (!panel) return;
      if (open){ panel.hidden = false; panel.classList.add('open'); }
      else { panel.classList.remove('open'); setTimeout(()=> panel.hidden = true, 260); }
    }

    // SFX helpers
    _clickSfx(){ const i = this.audio?.sfx.list.findIndex(s => (s.label||'').includes('ui-click')); if (i>=0) this.audio.playSfx(i); }
    _hoverSfx(){ const i = this.audio?.sfx.list.findIndex(s => (s.label||'').includes('ui-hover')); if (i>=0) this.audio.playSfx(i); }
    _successSfx(){ const i = this.audio?.sfx.list.findIndex(s => (s.label||'').includes('ui-success')); if (i>=0) this.audio.playSfx(i); }
  }

  // Boot
  window.addEventListener('DOMContentLoaded', ()=> {
    const app = new App();
    app.init();
  });
})();
