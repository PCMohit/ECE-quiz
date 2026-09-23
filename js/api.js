window.QuizAPI = {
  async call(action, payload={}) {
    const url=(window.QUIZ_CONFIG||{}).APPS_SCRIPT_URL;
    if(!url || url.includes('PASTE_')) throw new Error('Apps Script URL is not configured yet.');
    const body=new URLSearchParams({payload:JSON.stringify({action,...payload})});
    const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body});
    const d=await r.json().catch(()=>({ok:false,error:'Invalid server response.'}));
    if(!d.ok) throw new Error(d.error||'Server request failed.');
    return d;
  }
};
