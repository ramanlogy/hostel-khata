/* Hostel Khata: saving, login, first-time setup and backups.
   Loaded after the main script in index.html. It reuses that script's globals
   (S, PAST, EXP, cfg, RB, BEDS, nextId, expId, lang, render, ...).
   In the Windows app (Electron) data goes to a file through window.hkNative.
   In a normal browser it falls back to localStorage. */
(function(){
  const native=window.hkNative||null;
  const KEY='hk-data';
  const VERSION=2; // 2 = charges + payments ledger (2026-11-26)

  // Texts for the real app (replace the demo wording).
  Object.assign(T.en,{note:'',roomErr:'No empty bed. Add rooms in Settings, or free a bed first.',
    bkT:'Your data',bkSaved:'Everything saves by itself on this computer.',bkAuto:'A copy is also kept for each of the last 30 days.',
    bkExport:'Save a backup file',bkImport:'Restore from a backup file',bkFolder:'Open data folder',bkLogout:'Log out',
    bkTip:'Tip: save a backup to a USB drive or Google Drive once a week.',bkDone:'Backup saved.',bkBad:'This file is not a Hostel Khata backup.',
    bkAsk:'Restore this backup? Everything now in the app will be replaced by the backup.',bkOk:'Backup restored.',bkWhere:'Saved in',
    mrT:'Second copy (USB drive or Google Drive)',mrNone:'Not set. If this computer breaks or is stolen, everything is lost. Choose a USB drive or your Google Drive folder.',
    mrOn:d=>'Every change is also copied to: '+d,mrOk:'Last copied just now.',mrBad:'Could not copy there. Plug in the USB drive or open Google Drive.',mrPick:'Choose folder',mrChange:'Change folder',mrStop:'Stop copying',mrSet:'Second copy is on.',mrWarn:'Second copy failed. Plug in the USB drive or open Google Drive.'});
  Object.assign(T.ne,{note:'',roomErr:'खाली बेड छैन। सेटिङमा गएर कोठा थप्नुहोस् वा बेड खाली गर्नुहोस्।',
    bkT:'तपाईंको डाटा',bkSaved:'सबै कुरा यही कम्प्युटरमा आफैं सेभ हुन्छ।',bkAuto:'पछिल्ला ३० दिनको हरेक दिनको कपी पनि राखिन्छ।',
    bkExport:'ब्याकअप फाइल सेभ गर्नुहोस्',bkImport:'ब्याकअप फाइलबाट फर्काउनुहोस्',bkFolder:'डाटा फोल्डर खोल्नुहोस्',bkLogout:'लग आउट',
    bkTip:'सुझाव: हप्तामा एक पटक ब्याकअप USB वा Google Drive मा राख्नुहोस्।',bkDone:'ब्याकअप सेभ भयो।',bkBad:'यो Hostel Khata को ब्याकअप फाइल होइन।',
    bkAsk:'यो ब्याकअप फर्काउने? अहिले एपमा भएको सबै डाटा ब्याकअपले बदलिन्छ।',bkOk:'ब्याकअप फर्कियो।',bkWhere:'सेभ हुने ठाउँ',
    mrT:'दोस्रो कपी (USB वा Google Drive)',mrNone:'राखिएको छैन। कम्प्युटर बिग्रिए वा चोरी भए सबै डाटा हराउँछ। USB वा Google Drive फोल्डर छान्नुहोस्।',
    mrOn:d=>'हरेक परिवर्तन यहाँ पनि कपी हुन्छ: '+d,mrOk:'भर्खरै कपी भयो।',mrBad:'त्यहाँ कपी हुन सकेन। USB जोड्नुहोस् वा Google Drive खोल्नुहोस्।',mrPick:'फोल्डर छान्नुहोस्',mrChange:'फोल्डर बदल्नुहोस्',mrStop:'कपी गर्न बन्द',mrSet:'दोस्रो कपी सुरु भयो।',mrWarn:'दोस्रो कपी हुन सकेन। USB जोड्नुहोस् वा Google Drive खोल्नुहोस्।'});

  let AUTH=null,ready=false,timer=null,mirrorWarned=false;

  function snapshot(){return JSON.stringify({app:'hostel-khata',v:VERSION,savedAt:new Date().toISOString(),auth:AUTH,lang,cfg,S,PAST,EXP,RB,BEDS,BLK,nextId,expId})}
  function readRaw(){try{return native?native.load():localStorage.getItem(KEY)}catch(e){console.error(e);return null}}
  function writeNow(){
    if(!ready)return;clearTimeout(timer);timer=null;
    try{
      if(native){const m=native.save(snapshot());
        // Warn once per session if the second copy fails (USB unplugged, Drive not running).
        if(m&&m.ok===false&&!mirrorWarned){mirrorWarned=true;toast(t('mrWarn'))}
        if(m&&m.ok)mirrorWarned=false;}
      else localStorage.setItem(KEY,snapshot())}
    catch(e){console.error(e);toast('Could not save! '+(e&&e.message||''))}
  }
  function queueSave(){if(!ready)return;clearTimeout(timer);timer=setTimeout(writeNow,300)}
  const valid=d=>d&&typeof d==='object'&&Array.isArray(d.S)&&Array.isArray(d.PAST)&&Array.isArray(d.EXP)&&d.cfg&&typeof d.cfg==='object';

  function apply(d){
    S=d.S;PAST=d.PAST;EXP=d.EXP;RB=d.RB||{};BEDS=d.BEDS||[];
    // Blocks list (added 2026-11-20). Older saves only had RB letters, so rebuild the list from them.
    if(Array.isArray(d.BLK)&&d.BLK.length)BLK=d.BLK;
    else{const ids=[...new Set(Object.values(RB))].sort();if(!ids.length)ids.push('A');BLK=ids.map((id,i)=>({id,name:'',col:BCOL[i%BCOL.length]}))}
    nextId=Math.max(d.nextId||1,...S.map(s=>s.id+1),...PAST.map(s=>s.id+1),1);
    expId=Math.max(d.expId||1,...EXP.map(e=>e.id+1),1);
    const c=d.cfg;
    cfg=Object.assign({},cfg,c,{mods:Object.assign({},cfg.mods,c.mods),pay:Object.assign({},cfg.pay,c.pay),fields:Object.assign({},cfg.fields,c.fields),
      tpl:{en:Object.assign({},cfg.tpl.en,c.tpl&&c.tpl.en),ne:Object.assign({},cfg.tpl.ne,c.tpl&&c.tpl.ne)},custom:c.custom||[]});
    if(d.lang==='en'||d.lang==='ne')lang=d.lang;
  }

  // When a due date passes, add that month's fee as a charge line (see bill() in index.html).
  // Older saves are turned into charge lines the first time they load. Stops at the end of the stay.
  function rollDues(){
    S.forEach(bill);
    PAST.forEach(recalc);
  }

  // Sample hostel: 50 made-up students in 3 blocks (60 beds, 10 empty).
  // Join dates count back from today, so late / due today / paid look right on any day.
  function fillSample(name){
    const N=['Sita Gurung','Bibek Thapa','Anisha Poudel','Roshan Tamang','Kabita Adhikari','Suman Shrestha','Pooja Karki','Nabin Magar','Rina Rai','Dipesh KC',
      'Sabina Lama','Prakash Bhandari','Asmita Ghimire','Kiran Basnet','Sarita Khadka','Ramesh Bhattarai','Manisha Sapkota','Aarav Joshi','Srijana Pandey','Bikash Chaudhary',
      'Puja Maharjan','Sanjay Yadav','Nisha Thapa Magar','Rohit Dahal','Anjali Subedi','Sagar Neupane','Laxmi Bista','Sujan Rana','Bina Tharu','Aashish Koirala',
      'Sunita Sherpa','Hari Acharya','Rachana Regmi','Milan Pokharel','Smriti Dhakal','Rajan Oli','Kritika Shahi','Niraj Limbu','Sushma Bhusal','Ujjwal Gautam',
      'Prerana Khatri','Sandesh Lamsal','Gita Malla','Bishal Pun','Aakriti Sharma','Deepak Rawal','Monika Thakuri','Saroj Parajuli','Elina Shakya','Prabin Kunwar'];
    // 9 paid students out of 10, plus some late, part paid and due today.
    const ST=['paid','paid','late1','paid','paid','part','paid','paid','late2','paid','paid','today','paid','late1','paid','paid','paid','part','paid','late1',
      'paid','paid','paid','late2','paid','today','paid','paid','late1','paid','paid','paid','part','paid','paid','late1','paid','paid','paid','paid',
      'late2','paid','paid','paid','late1','paid','paid','paid','paid','paid'];
    S=[];PAST=[];EXP=[];BEDS=[];RB={};nextId=1;expId=1;cfg.name=name;
    BLK=[{id:'A',name:'',col:BCOL[0]},{id:'B',name:'',col:BCOL[1]},{id:'C',name:'',col:BCOL[2]}];
    const rooms=[];
    for(let r=101;r<=108;r++)rooms.push([r,'A',3,11000]);
    for(let r=201;r<=208;r++)rooms.push([r,'B',3,11000]);
    for(let r=301;r<=306;r++)rooms.push([r,'C',2,13500]);
    const free=[];
    rooms.forEach(([r,b,n,fee])=>{RB[r]=b;for(let i=0;i<n;i++){const bed=r+'-'+'ABC'[i];BEDS.push(bed);free.push([bed,fee])}});
    // Leave 10 beds empty, spread over the blocks.
    const empty=new Set([5,11,20,26,33,40,47,52,55,59]);
    const beds=free.filter((_,i)=>!empty.has(i));
    const [ty,tm,td]=fromIdx(TODAY);
    N.forEach((nm,i)=>{
      const st=ST[i],[bed,fee]=beds[i];
      // How long ago they joined: 10 days to about 14 months.
      let back=10+((i*37)%420);
      // "Due today" needs the joining day to be today's day of the month.
      let y,m,d;
      if(st==='today'){[y,m]=fromIdx(TODAY);m-=1+(i%5);while(m<1){m+=12;y--}d=td}
      else{[y,m,d]=fromIdx(TODAY-back);d=Math.min(d,29)}
      // Late students: due date must already have passed this month.
      if(st.startsWith('late')&&d>=td&&td>1){d=Math.max(1,td-1-(i%Math.max(1,td-1)))}
      if(st==='late2'&&toIdx(y,m,d)>TODAY-65){[y,m]=fromIdx(TODAY-90)}
      if(st!=='paid'&&toIdx(y,m,d)>TODAY-32){[y,m]=fromIdx(TODAY-45)}
      if(!ML[y]){y=2082;m=Math.max(m,1)}
      const ph='98'+String(41000000+i*7919).padStart(8,'0'),gd='98'+String(51000000+i*6151).padStart(8,'0');
      const s=make(nm,ph,gd,bed,fee,y,m,d,12,st);
      s.months=elapsed(s)+[2,5,8,11][i%4]; // 2 to 11 months of stay still left
      S.push(s);
    });
  }

  function startEmpty(name){S=[];PAST=[];EXP=[];BEDS=[];RB={};BLK=[{id:'A',name:'',col:BCOL[0]}];nextId=1;expId=1;cfg.name=name}

  async function hash(pass,salt){
    const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(salt+':'+pass));
    return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join('');
  }
  const newSalt=()=>Array.from(crypto.getRandomValues(new Uint8Array(16))).map(x=>x.toString(16).padStart(2,'0')).join('');

  // ---- Load saved data ----
  let saved=null;const raw=readRaw();
  if(raw){try{saved=JSON.parse(raw)}catch(e){console.error('Saved data is damaged',e)}}
  const box=document.getElementById('login'),setupF=document.getElementById('setupForm'),loginF=document.getElementById('loginForm');

  function unlock(){box.hidden=true;ready=true;rollDues();render();writeNow()}

  if(valid(saved)){
    AUTH=saved.auth||null;apply(saved);rollDues();render();
  }
  // A reload after midnight keeps the owner logged in (see the day check below).
  let skip=false;try{skip=sessionStorage.getItem('hk-keep')==='1';sessionStorage.removeItem('hk-keep')}catch(e){}

  if(AUTH&&skip){unlock()}
  else if(AUTH){
    document.getElementById('lh').textContent=cfg.name||'Hostel Khata';
    loginF.hidden=false;document.getElementById('lu').focus();
    loginF.addEventListener('submit',async e=>{
      e.preventDefault();e.stopPropagation();
      const u=document.getElementById('lu').value.trim().toLowerCase(),p=document.getElementById('lp').value;
      if(u===AUTH.user&&await hash(p,AUTH.salt)===AUTH.hash)unlock();
      else{document.getElementById('lerr').textContent=lang==='ne'?'प्रयोगकर्ता नाम वा पासवर्ड मिलेन।':'Wrong username or password.';document.getElementById('lp').value=''}
    });
  }else{
    setupF.hidden=false;document.getElementById('su-name').value=valid(saved)?cfg.name:'';document.getElementById('su-name').focus();
    if(valid(saved))document.getElementById('su-sample').closest('label').hidden=true;
    setupF.addEventListener('submit',async e=>{
      e.preventDefault();e.stopPropagation();
      const g=id=>document.getElementById(id),err=g('su-err');
      const name=g('su-name').value.trim(),user=g('su-user').value.trim().toLowerCase(),p=g('su-pass').value,p2=g('su-pass2').value;
      if(!name){err.textContent='Please type the hostel name.';return}
      if(!user){err.textContent='Please choose a username.';return}
      if(p.length<4){err.textContent='Password needs at least 4 characters.';return}
      if(p!==p2){err.textContent='The two passwords are not the same.';return}
      if(!valid(saved)){if(g('su-sample').checked)fillSample(name);else startEmpty(name)}
      const salt=newSalt();AUTH={user,salt,hash:await hash(p,salt)};
      view='list';unlock();
    });
  }

  // ---- Save after every change ----
  const _render=render;
  render=function(){_render();queueSave()};
  ['click','change','input','submit'].forEach(ev=>document.addEventListener(ev,()=>setTimeout(queueSave,0)));
  window.addEventListener('beforeunload',writeNow);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)writeNow()});

  // If the app stays open past midnight, reload so "today" and dues move on.
  const day0=new Date().toDateString();
  setInterval(()=>{if(ready&&new Date().toDateString()!==day0){writeNow();try{sessionStorage.setItem('hk-keep','1')}catch(e){}location.reload()}},60000);

  // ---- Backup card at the bottom of Settings ----
  const _settings=renderSettings;
  renderSettings=function(){
    _settings();
    const where=native?`<span class="sub">${t('bkWhere')}: ${esc(native.dataDir())}</span>`:'';
    app.insertAdjacentHTML('beforeend',`<div class="card" id="bk-card" style="max-width:920px"><h2>${t('bkT')}</h2>
      <span class="sub">${t('bkSaved')} ${native?t('bkAuto'):''}</span>${where}
      <div class="row2" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px">
        <button type="button" class="btn sec" data-bk="export">${t('bkExport')}</button>
        <button type="button" class="btn sec" data-bk="import">${t('bkImport')}</button>
        ${native?`<button type="button" class="btn sec" data-bk="folder">${t('bkFolder')}</button>`:''}
        <button type="button" class="btn sec" data-bk="logout">${t('bkLogout')}</button>
      </div><span class="sub">${t('bkTip')}</span></div>`);
    if(native&&native.mirror){const m=native.mirror();
      app.insertAdjacentHTML('beforeend',`<div class="card" id="mr-card" style="max-width:920px"><h2>${t('mrT')}</h2>
        ${m.dir?`<span class="sub">${t('mrOn',esc(m.dir))}</span><span class="sub ${m.ok===false?'warn':''}">${m.ok===false?t('mrBad'):m.ok?t('mrOk'):''}</span>`:`<span class="sub warn">${t('mrNone')}</span>`}
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px"><button type="button" class="btn ${m.dir?'sec':'pri'}" data-bk="mrpick">${m.dir?t('mrChange'):t('mrPick')}</button>${m.dir?`<button type="button" class="btn sec" data-bk="mrstop">${t('mrStop')}</button>`:''}</div></div>`)}
  };

  function stamp(){const d=new Date(),p=n=>String(n).padStart(2,'0');return`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`}
  async function doExport(){
    writeNow();const data=snapshot(),file=`hostel-khata-backup-${stamp()}.json`;
    if(native){if(await native.exportBackup(file,data))toast(t('bkDone'));return}
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([data],{type:'application/json'}));a.download=file;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000);
  }
  function restore(text){
    let d;try{d=JSON.parse(text)}catch(e){}
    if(!valid(d)){toast(t('bkBad'));return}
    if(!confirm(t('bkAsk')))return;
    writeNow();
    if(native)native.keepCopy('before-restore');
    apply(d);rollDues();view='list';render();writeNow();toast(t('bkOk'));
  }
  async function doImport(){
    if(native){const text=await native.importBackup();if(text!=null)restore(text);return}
    const inp=document.createElement('input');inp.type='file';inp.accept='.json,application/json';
    inp.onchange=()=>{const f=inp.files[0];if(f)f.text().then(restore)};inp.click();
  }
  document.addEventListener('click',e=>{
    const b=e.target.closest('[data-bk]');if(!b)return;
    const k=b.dataset.bk;
    if(k==='export')doExport();
    if(k==='import')doImport();
    if(k==='folder')native.openDataFolder();
    if(k==='mrpick'){writeNow();native.pickMirror().then(r=>{if(r){mirrorWarned=false;render();toast(r.ok===false?t('mrBad'):t('mrSet'))}})}
    if(k==='mrstop'){native.clearMirror();render()}
    if(k==='logout'){writeNow();location.reload()}
  });
})();
