import {discoverTargets,CdpClient} from '../src/cdp.mjs';
const [target]=await discoverTargets();const client=new CdpClient(target.webSocketDebuggerUrl);
try{await client.connect();const response=await client.call('Runtime.evaluate',{expression:`(()=>{
const summarize=(el)=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return{tag:el.tagName,id:el.id,classes:String(el.className).slice(0,240),background:s.backgroundColor,image:s.backgroundImage.slice(0,180),position:s.position,z:s.zIndex,display:s.display,opacity:s.opacity,rect:{x:r.x,y:r.y,width:r.width,height:r.height}}};
const chain=(el)=>{const list=[];for(let i=0;el&&i<60;i++,el=el.parentElement){const data=summarize(el);if(data.background!=='rgba(0, 0, 0, 0)'||data.image!=='none')list.push(data);}return list;};
const editor=Array.from(document.querySelectorAll('textarea,[contenteditable=true]')).find(el=>{const r=el.getBoundingClientRect();return r.width>100&&r.height>10;});
const bottom=[];
for(const el of document.querySelectorAll('main[class*="MainContentSurface-"] *')){
const r=el.getBoundingClientRect();if(r.width<innerWidth*.55||r.height<4||!(r.top<140&&r.bottom>40||r.bottom>innerHeight-190))continue;
for(const pseudo of [null,'::before','::after']){const s=getComputedStyle(el,pseudo);if((!pseudo||s.content!=='none')&&(s.backgroundColor!=='rgba(0, 0, 0, 0)'||s.backgroundImage!=='none'))bottom.push({pseudo,...summarize(el),paint:s.backgroundColor,paintImage:s.backgroundImage.slice(0,160)});}
}
return{main:chain(document.elementFromPoint(innerWidth*.6,innerHeight*.5)),sidebar:chain(document.elementFromPoint(150,innerHeight*.5)),rail:chain(document.elementFromPoint(24,innerHeight*.5)),composer:editor?chain(editor):[],bottom};
})()`,returnByValue:true});console.log(JSON.stringify(response.result?.value,null,2));}finally{client.close();}
