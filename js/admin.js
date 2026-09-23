function getResults(){return JSON.parse(localStorage.getItem('quizResults')||'[]').sort((a,b)=>b.score-a.score||a.timeTaken-b.timeTaken||new Date(a.submittedAt)-new Date(b.submittedAt))}
function fmt(s){return `${Math.floor(s/60)}m ${s%60}s`}
function render(){
 const data=getResults(), body=document.getElementById('resultsBody'), empty=document.getElementById('empty'), stats=document.getElementById('stats');
 empty.hidden=data.length>0;
 stats.innerHTML=`<div><small>Participants</small><strong>${data.length}</strong></div><div><small>Highest score</small><strong>${data.length?data[0].score:'—'} / 50</strong></div><div><small>Average score</small><strong>${data.length?(data.reduce((a,x)=>a+x.score,0)/data.length).toFixed(1):'—'}</strong></div>`;
 body.innerHTML=data.map((x,i)=>`<tr><td><b>${i+1}</b></td><td>${esc(x.name)}</td><td>${esc(x.roll)}</td><td><b>${x.score}/50</b></td><td>${fmt(x.timeTaken)}</td><td>${new Date(x.submittedAt).toLocaleString()}</td></tr>`).join('');
}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
document.getElementById('exportBtn').addEventListener('click',()=>{
 const data=getResults(); const rows=[['Rank','Name','Participant ID','Email','Score','Time Taken (sec)','Submitted At'],...data.map((x,i)=>[i+1,x.name,x.roll,x.email,x.score,x.timeTaken,x.submittedAt])];
 const csv=rows.map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n');
 const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='quiz-results.csv';a.click();URL.revokeObjectURL(a.href);
});
document.getElementById('clearBtn').addEventListener('click',()=>{if(confirm('Delete all demo results from this browser?')){localStorage.removeItem('quizResults');render()}});
render();
