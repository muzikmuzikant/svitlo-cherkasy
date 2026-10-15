/* Beta advertising control center: all edits stay in the isolated staging API. */
(()=>{'use strict';
 const root=document.getElementById('betaAdsAdmin');
 if(!root)return;
 let report=null,draft=null,dirty=false,loading=false;
 const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined&&text!==null)e.textContent=String(text);if(cls)e.className=cls;return e};
 const fmt=n=>new Intl.NumberFormat('uk-UA').format(Number(n)||0);
 const money=n=>fmt(n)+' грн';
 const uuid=()=>crypto.randomUUID().replace(/-/g,'');
 const api=(method='GET',value)=>window.betaAdminAdsApi(method,value);
 function mark(){dirty=true;const s=document.getElementById('betaAdsSaveStatus');if(s)s.textContent='Є незбережені зміни'}
 function field(box,label,object,key,type='text',hint='',attrs={}){
  const row=el('label',undefined,'ad-field');row.append(el('span',label));
  const input=el(type==='long'?'textarea':'input');
  if(type!=='long')input.type=type==='toggle'?'checkbox':type;
  if(type==='toggle')input.checked=!!object[key];
  else input.value=object[key]??'';
  for(const [k,v] of Object.entries(attrs))if(k in input)input[k]=v;
  const update=()=>{
   object[key]=type==='toggle'?input.checked:type==='number'?Number(input.value):input.value;
   mark();
  };
  input.addEventListener('change',update);
  input.addEventListener('input',update);
  row.append(input);if(hint)row.append(el('small',hint,'ad-muted'));box.append(row);return input;
 }
 function choice(box,label,obj,key,values){
  const row=el('label',undefined,'ad-field');row.append(el('span',label));const sel=el('select');
  for(const [v,title] of values){const op=el('option',title);op.value=v;sel.append(op)}
  sel.value=obj[key]||values[0][0];sel.addEventListener('change',()=>{obj[key]=sel.value;mark()});row.append(sel);box.append(row);
 }
 function section(title,help){const w=el('section',undefined,'ad-panel');w.append(el('h3',title));if(help)w.append(el('p',help,'ad-muted'));return w}
 function grid(box){const x=el('div',undefined,'ad-fields-grid');box.append(x);return x}
 function button(box,label,click,cls='secondary'){const b=el('button',label,cls);b.type='button';b.addEventListener('click',click);box.append(b);return b}
 function colorField(box,label,obj,key,defaultColor='#ffffff'){
  const wrap=el('div',undefined,'ad-field ad-color-field');wrap.append(el('span',label));
  const inner=el('div',undefined,'ad-color-inputs');
  const color=el('input');color.type='color';color.value=/^#[a-f\d]{6}$/i.test(obj[key]||'')?obj[key]:defaultColor;color.setAttribute('aria-label',label+' · палітра');
  const code=el('input');code.type='text';code.maxLength=7;code.value=obj[key]||defaultColor;code.placeholder='#ffffff';code.setAttribute('aria-label',label+' · HEX');
  color.oninput=()=>{code.value=color.value;obj[key]=color.value;mark()};
  code.oninput=()=>{obj[key]=code.value;if(/^#[a-f\d]{6}$/i.test(code.value))color.value=code.value;mark()};
  inner.append(color,code);wrap.append(inner);box.append(wrap);return color;
 }
 function uploadField(box,label,obj,key){
  const wrapper=el('div',undefined,'ad-field');
  wrapper.append(el('span',label));
  const input=field(wrapper,'HTTPS-посилання',obj,key,'url');
  const upload=el('input');upload.type='file';upload.accept='image/png,image/jpeg,image/webp';
  upload.setAttribute('aria-label','Завантажити '+label.toLowerCase());
  upload.onchange=async()=>{
   const f=upload.files?.[0];if(!f)return;
   if(f.size>1900000){alert('Зображення має бути не більше 1,9 МБ');return}
   upload.disabled=true;
   try{const link=await window.betaAdminUploadAdPhoto(f);obj[key]=link;input.value=link;mark();wrapper.dispatchEvent(new Event('input',{bubbles:true}))}
   catch(error){alert(error.message)}
   finally{upload.disabled=false}
  };
  wrapper.append(upload);box.append(wrapper);
 }
 function mini(label,value,help){const box=el('div',undefined,'ad-kpi');box.append(el('span',label),el('strong',value),el('small',help||''));return box}
 const toLocal=iso=>{if(!iso)return '';const d=new Date(iso);return Number.isFinite(d.getTime())?new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16):''};
 const fromLocal=value=>value?new Date(value).toISOString():'';
 function campaign(container,c,index){
  const details=el('details',undefined,'ad-campaign');details.open=!c.title;
  const sum=el('summary',undefined,'ad-campaign-head');
  const desc=el('span');desc.append(el('strong',c.title||'Нове оголошення'),el('small',(c.enabled?'Активне':'Вимкнене')+' · '+(c.paid?'оплачене':'без підтвердженої оплати')));
  sum.append(desc,el('span','Налаштувати ▾'));details.append(sum);
  const body=el('div',undefined,'ad-campaign-body');
  const preview=el('div',undefined,'ad-card-preview');
  const display=()=>{preview.replaceChildren();preview.style.backgroundColor=c.background||'#fff';preview.style.color=c.foreground||'#142338';
  preview.style.backgroundImage=c.cardBackgroundImage?((c.cardStyle==='dark'?'linear-gradient(90deg,#0b1e35e8,#0b1e3533),':'linear-gradient(90deg,#fffffff2,#ffffff44),')+'url("'+c.cardBackgroundImage.replace(/"/g,'')+'")'):'none';preview.style.backgroundSize='cover';preview.style.backgroundPosition='center';if(c.image){const img=el('img');img.src=c.image;img.alt='';preview.append(img)}const col=el('div');col.append(el('strong',c.title||'Заголовок'),el('small',c.description||'Опис рекламного оголошення'),el('em',c.button||'Дізнатися більше'));preview.append(col)};
  display();body.append(preview);
  const compact=section('Картка на головній','Оформлення, яке бачить користувач перед натисканням. Повноекранний перегляд налаштовується окремо.');
  const fields=grid(compact);body.append(compact);
  field(fields,'Назва / заголовок',c,'title','text','До 100 символів',{maxLength:100});
  field(fields,'Опис реклами',c,'description','long','До 250 символів',{maxLength:250,rows:3});
  field(fields,'Текст кнопки',c,'button');
  field(fields,'Посилання рекламодавця',c,'link','url','Тільки HTTPS');
  const imageRow=el('div',undefined,'ad-field');imageRow.append(el('span','Рекламне зображення'));
  const image=field(imageRow,'HTTPS-адреса зображення',c,'image','url');
  const uploader=el('input');uploader.type='file';uploader.accept='image/png,image/jpeg,image/webp';
  uploader.addEventListener('change',async()=>{const file=uploader.files?.[0];if(!file)return;if(file.size>1900000){alert('Максимум 1,9 МБ');return}
   uploader.disabled=true;try{const link=await window.betaAdminUploadAdPhoto(file);c.image=link;image.value=link;mark();display()}catch(e){alert(e.message)}finally{uploader.disabled=false}});
  imageRow.append(uploader);fields.append(imageRow);
  uploadField(fields,'Фонове зображення картки',c,'cardBackgroundImage');
  colorField(fields,'Колір фону картки',c,'background');
  colorField(fields,'Колір тексту картки',c,'foreground','#142338');
  choice(fields,'Оформлення',c,'cardStyle',[['soft','М’яка картка'],['outline','Чітка рамка'],['dark','Темний банер']]);
  field(fields,'Пріоритет відносно інших (1-10)',c,'weight','number','Впливає на частку показів',{min:1,max:10});
  field(fields,'Час одного показу, с',c,'seconds','number',null,{min:3,max:60});
  field(fields,'Усього показів максимум (0 = без ліміту)',c,'maxImpressions','number');
  field(fields,'Показів на день максимум (0 = без ліміту)',c,'dailyCap','number');
  const dateBox=el('div',undefined,'ad-field');dateBox.append(el('span','Початок показів (необов’язково)'));const start=el('input');start.type='datetime-local';start.value=toLocal(c.start);start.onchange=()=>{c.start=fromLocal(start.value);mark()};dateBox.append(start);fields.append(dateBox);
  const endBox=el('div',undefined,'ad-field');endBox.append(el('span','Завершення (необов’язково)'));const end=el('input');end.type='datetime-local';end.value=toLocal(c.end);end.onchange=()=>{c.end=fromLocal(end.value);mark()};endBox.append(end);fields.append(endBox);
  const expanded=section('Повноекранна реклама','Після натискання на картку відкриється окрема повноекранна сторінка з банером, фото, довгим описом і кнопкою. Якщо вимкнено, картка веде одразу на зовнішній сайт.');
  const ex=grid(expanded);
  field(ex,'Відкривати повноекранну сторінку',c,'detailEnabled','toggle');
  field(ex,'Заголовок повноекранної сторінки',c,'detailTitle','text','Якщо порожньо, використовуємо заголовок картки.');
  field(ex,'Підзаголовок',c,'detailSubtitle','long');
  field(ex,'Розгорнутий опис',c,'detailDescription','long','До 6500 символів; абзаци зберігаються.',{rows:7,maxLength:6500});
  uploadField(ex,'Широкий банер у верхній частині',c,'detailBanner');
  uploadField(ex,'Додаткове фото в тексті',c,'detailImage');
  colorField(ex,'Фон повноекранної сторінки',c,'detailBackground','#f5f8ff');
  colorField(ex,'Колір тексту сторінки',c,'detailForeground','#172c49');
  colorField(ex,'Акцент кнопок',c,'detailAccent','#377cff');
  field(ex,'Текст кнопки переходу на сайт рекламодавця',c,'detailButton');
  const fullPreview=el('div',undefined,'ad-full-preview');
  const showPreview=()=>{
   fullPreview.replaceChildren();fullPreview.style.backgroundColor=c.detailBackground||'#f5f8ff';
   fullPreview.style.color=c.detailForeground||'#172c49';
   const photo=el('div',undefined,'ad-full-preview-hero');
   photo.style.background='linear-gradient(120deg,'+(c.detailAccent||'#377cff')+',#153568)';
   if(c.detailBanner){photo.style.backgroundImage='linear-gradient(0deg,#142c59a8,#142c5920),url("'+c.detailBanner.replace(/"/g,'')+'")';photo.style.backgroundSize='cover';photo.style.backgroundPosition='center'}
   photo.append(el('small','РЕКЛАМА'),el('h3',c.detailTitle||c.title||'Заголовок'),el('p',c.detailSubtitle||c.description||'Підзаголовок'));
   fullPreview.append(photo,el('p',(c.detailDescription||c.description||'Ваш текст').slice(0,430),'ad-full-preview-copy'));
   if(c.detailImage){const img=el('img');img.src=c.detailImage;img.alt='Попередній перегляд';fullPreview.append(img)}
   const action=el('div',c.detailButton||'Перейти на сайт','ad-full-preview-cta');action.style.background=c.detailAccent||'#377cff';fullPreview.append(action);
  };
  showPreview();expanded.append(fullPreview);body.append(expanded);
  expanded.addEventListener('input',()=>setTimeout(showPreview,0));
  const days=el('fieldset',undefined,'ad-days');days.append(el('legend','Дні тижня (нічого не вибрано = щодня)'));
  for(const [day,label] of [[1,'Пн'],[2,'Вт'],[3,'Ср'],[4,'Чт'],[5,'Пт'],[6,'Сб'],[0,'Нд']]){
   const l=el('label',label),check=el('input');check.type='checkbox';check.checked=(c.days||[]).includes(day);
   check.onchange=()=>{const arr=new Set(c.days||[]);check.checked?arr.add(day):arr.delete(day);c.days=[...arr];mark()};l.prepend(check);days.append(l)
  }body.append(days);
  field(fields,'Активна кампанія',c,'enabled','toggle');
  field(fields,'Оплату підтверджено вручну',c,'paid','toggle');
  field(fields,'Сума договору, грн',c,'price','number');
  field(fields,'Примітки адміністратора',c,'note','long');
  const stats=report.stats?.[c.id]||{},impr=stats.impressions||0,clicks=stats.clicks||0;
  body.append(el('p','Покази: '+fmt(impr)+' · Кліки: '+fmt(clicks)+' · CTR: '+(impr?(100*clicks/impr).toFixed(2):'0')+'%','ad-muted'));
  const adDays=Object.entries(report.statsByCampaignDay||{}).filter(([key])=>key.startsWith(c.id+'|')).sort((a,b)=>b[0].localeCompare(a[0])).slice(0,21);
  if(adDays.length){const recent=el('details',undefined,'ad-daily');recent.append(el('summary','Детальна статистика за днями ('+adDays.length+')'));
   const table=el('div',undefined,'ad-daily-table');
   for(const [key,entry] of adDays){const line=el('div');line.append(el('span',key.split('|').at(-1)),el('strong',fmt(entry.impressions||0)+' показів'),el('span',fmt(entry.clicks||0)+' кліків'));table.append(line)}
   recent.append(table);body.append(recent)}

  const tools=el('div',undefined,'ad-toolbar');
  button(tools,'Зберегти всі зміни',()=>document.getElementById('betaAdsSaveButton')?.click(),'primary');
  button(tools,'Дублювати',()=>{draft.campaigns.splice(index+1,0,{...structuredClone(c),id:uuid(),title:(c.title||'Реклама')+' (копія)',enabled:false,paid:false});mark();render()});
  button(tools,'Видалити',()=>{if(confirm('Видалити рекламну кампанію?')){draft.campaigns.splice(index,1);mark();render()}},'danger');
  body.append(tools);details.append(body);container.append(details);
  body.addEventListener('input',()=>setTimeout(display,0));
 }
 function analytics(){
  const p=report.pwa||{},s=report.stats||{};
  const total=Object.values(s).reduce((a,v)=>({impressions:a.impressions+(v.impressions||0),clicks:a.clicks+(v.clicks||0)}),{impressions:0,clicks:0});
  const b=section('Аналітика та доходи','Покази зараховуються після появи картки на екрані. Натискання рахуються окремо. Дані з тестового середовища.');
  const g=el('div',undefined,'ad-kpis');
  for(const args of [
   ['PWA зараз',fmt(p.online),'Активні протягом 45 секунд'],
   ['Відомі інсталяції',fmt(p.known),'Лише користувачі зі згодою'],
   ['Активні за 24 год',fmt(p.active24h),'Встановлений PWA'],
   ['Покази реклами',fmt(total.impressions),'Усі картки'],
   ['Кліки',fmt(total.clicks),'Усі картки'],
   ['CTR',total.impressions?(100*total.clicks/total.impressions).toFixed(2)+'%':'0%','Усі кампанії'],
  ])g.append(mini(...args));
  b.append(g,boldNote(p.note));
  const finance=el('div',undefined,'ad-kpis');
  const campaigns=draft.campaigns||[];
  finance.append(mini('Суми кампаній',money(campaigns.reduce((n,c)=>n+(Number(c.price)||0),0)),'Записані вручну'),
   mini('Позначено оплаченими',money(campaigns.filter(c=>c.paid).reduce((n,c)=>n+(Number(c.price)||0),0)),'Не підтверджує платіжне зарахування'),
   mini('Активні кампанії',fmt(campaigns.filter(c=>c.enabled).length),'За перемикачем'));
  b.append(finance);
  button(b,'Експорт статистики реклами (CSV)',()=>{const csv=[['id','title','impressions','clicks','ctr','price_uah','paid']];
    for(const c of campaigns){const st=s[c.id]||{},imp=Number(st.impressions)||0,cl=Number(st.clicks)||0;
      const safe=v=>{const x=String(v??'');return /^[=+\-@]/.test(x)?"'"+x:x};csv.push([c.id,safe(c.title),imp,cl,imp?(cl/imp*100).toFixed(2):0,c.price||0,c.paid?'yes':'no'])}
    const blob=new Blob([csv.map(row=>row.map(x=>'"'+String(x).replace(/"/g,'""')+'"').join(';')).join('\n')],{type:'text/csv;charset=utf-8'});
    const a=el('a');a.href=URL.createObjectURL(blob);a.download='svitlo-beta-ads.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500)});
  root.append(b);
 }
 function boldNote(s){const n=el('p',s,'ad-muted');n.style.fontSize='12px';return n}
 function render(){
  if(!report||!draft)return;
  root.replaceChildren();root.className='beta-ads-admin';
  const heading=el('div',undefined,'ad-titlebar');
  const title=el('div');title.append(el('h3','Центр рекламного керування'),el('p','Лише головна сторінка · Зміни зберігаються на Beta Railway','ad-muted'));
  const tools=el('div',undefined,'ad-toolbar');
  button(tools,'Оновити дані',()=>refresh(true));
  // Saving lives in a sticky footer, not in the distant heading.
  const status=el('small',dirty?'Є незбережені зміни':'Налаштування завантажено','ad-muted');status.id='betaAdsSaveStatus';
  heading.append(title,tools);root.append(heading);
  analytics();
  const main=section('Загальні параметри каруселі','Реклама відображається лише на головній сторінці. Індивідуальні параметри мають пріоритет над загальними.');
  const g=grid(main);
  field(g,'Показувати рекламний блок',draft,'enabled','toggle');
  field(g,'Показувати «Ваша реклама»',draft,'showPromo','toggle');
  field(g,'Дозволити ручне гортання',draft,'manualSwipe','toggle');
  field(g,'Стандартний інтервал, с',draft,'rotationSeconds','number',null,{min:3,max:60});
  field(g,'«Ваша реклама» після кожних N кампаній',draft,'promoEvery','number',null,{min:1,max:20});
  choice(g,'Анімація перемикання',draft,'animation',[['fade','Плавна'],['slide','Ковзання'],['none','Без анімації']]);
  for(const [k,l] of [['promoTitle','Заголовок «Ваша реклама»'],['promoText','Опис «Ваша реклама»'],['contactLabel','Текст кнопки']])field(g,l,draft,k,'text');
  const landing=section('Сторінка «Реклама у Світло Черкаси»','Редагуйте зміст і вигляд сторінки для рекламодавців прямо звідси.');
  const landingFields=grid(landing);
  field(landingFields,'Заголовок',draft,'pageTitle');field(landingFields,'Вступ',draft,'pageIntro','long');
  field(landingFields,'Про рекламне місце',draft,'pageAbout','long');
  field(landingFields,'Умови розміщення',draft,'pageTerms','long');
  field(landingFields,'Пояснення поруч із контактами',draft,'pageContactText','long');
  uploadField(landingFields,'Зображення обкладинки',draft,'pageHeroImage');
  colorField(landingFields,'Фон сторінки',draft,'pageBackground','#f5f8ff');
  colorField(landingFields,'Акцентний колір',draft,'pageAccent','#377cff');
  const list=el('div',undefined,'ad-benefits-editor');list.append(el('h4','Переваги розміщення'));
  draft.pageBenefits.forEach((v,idx)=>{const line=el('div',undefined,'ad-benefit-row');const input=el('input');input.value=v;input.maxLength=180;
   input.oninput=()=>{draft.pageBenefits[idx]=input.value;mark()};line.append(input);button(line,'×',()=>{draft.pageBenefits.splice(idx,1);mark();render()},'secondary');list.append(line)});
  button(list,'+ Додати перевагу',()=>{draft.pageBenefits.push('Нова перевага');mark();render()});landing.append(list);
  root.append(main,landing);
  const contact=section('Зв’язатися з нами','Ці контакти автоматично відображаються на сторінці замовлення реклами.');
  draft.contacts.forEach((c,i)=>{const row=el('div',undefined,'ad-subcard');const f=grid(row);field(f,'Назва контакту',c,'label');field(f,'Посилання HTTPS (Telegram, сайт, email через форму)',c,'url','url');field(f,'Показувати',c,'enabled','toggle');button(row,'Видалити',()=>{draft.contacts.splice(i,1);mark();render()},'danger');contact.append(row)});
  button(contact,'+ Додати контакт',()=>{draft.contacts.push({id:uuid(),label:'Telegram',url:'',enabled:true});mark();render()});root.append(contact);
  const packs=section('Тарифи та формати','Будь-які назви, терміни і ціни. Відображаються на сторінці «Реклама у Світло Черкаси».');
  draft.packages.forEach((p,i)=>{const row=el('div',undefined,'ad-subcard');const f=grid(row);for(const [k,l,t] of [['title','Назва','text'],['description','Опис','long'],['price','Вартість у грн','number'],['durationDays','Тривалість у днях','number'],['visible','Видимий тариф','toggle']])field(f,l,p,k,t);button(row,'Видалити тариф',()=>{draft.packages.splice(i,1);mark();render()},'danger');packs.append(row)});
  button(packs,'+ Новий тариф',()=>{draft.packages.push({id:uuid(),title:'Новий тариф',description:'',price:0,durationDays:30,visible:true});mark();render()});root.append(packs);
  const support=section('Добровільна підтримка проєкту','Без комісій та автоматичного приймання коштів у нашому застосунку. Посилання на зовнішній платіжний сервіс задається вручну.');
  const su=grid(support);for(const [k,l,t] of [['enabled','Увімкнути підтримку','toggle'],['title','Заголовок сторінки','text'],['description','Опис','long'],['details','На що підуть внески','long'],['provider','Назва платіжного сервісу','text'],['paymentUrl','Зовнішнє HTTPS посилання для внесків','url'],['button','Текст кнопки','text']])field(su,l,draft.support,k,t);
  uploadField(su,'Фото обкладинки сторінки підтримки',draft.support,'heroImage');
  colorField(su,'Фон сторінки підтримки',draft.support,'background','#f5f8ff');
  colorField(su,'Акцентний колір сторінки підтримки',draft.support,'accent','#377cff');
  field(su,'Заголовок блоку мети',draft.support,'whyTitle');
  field(su,'Текст подяки',draft.support,'thanksTitle');
  field(su,'Показувати приклади сум',draft.support,'showAmounts','toggle');
  const amounts=el('div',undefined,'ad-field');amounts.append(el('span','Приклади сум підтримки через кому'));
  const amountInput=el('input');amountInput.type='text';amountInput.value=(draft.support.amounts||[]).join(', ');
  amountInput.onchange=()=>{draft.support.amounts=amountInput.value.split(',').map(x=>Number(x.trim())).filter(x=>Number.isFinite(x)&&x>0).slice(0,6);mark()};
  amounts.append(amountInput);su.append(amounts);
  field(su,'Показувати картки призначення внесків',draft.support,'showGoals','toggle');
  field(su,'Показувати блок подяки',draft.support,'showThanks','toggle');
  const goalEditor=el('div',undefined,'ad-goal-editor');goalEditor.append(el('h4','Картки «На що йдуть внески»'));
  (draft.support.goals||[]).forEach((goal,ix)=>{const line=el('div',undefined,'ad-subcard');const gb=grid(line);
   field(gb,'Іконка',goal,'icon');field(gb,'Заголовок',goal,'title');field(gb,'Опис',goal,'description','long');
   button(line,'Видалити картку',()=>{draft.support.goals.splice(ix,1);mark();render()},'danger');goalEditor.append(line)});
  button(goalEditor,'+ Додати картку',()=>{draft.support.goals.push({icon:'♡',title:'Нова перевага',description:''});mark();render()});
  support.append(goalEditor);
  root.append(support);
  const ads=section('Рекламні кампанії','Кожна реклама має власні налаштування, терміни, пріоритети та статистику.');draft.campaigns.forEach((c,i)=>campaign(ads,c,i));
  button(ads,'+ Створити оголошення',()=>{draft.campaigns.unshift({id:uuid(),title:'',description:'',image:'',link:'',button:'Дізнатися більше',enabled:false,background:'#ffffff',foreground:'#142338',start:'',end:'',days:[],weight:1,seconds:8,maxImpressions:0,dailyCap:0,price:0,paid:false,note:''});mark();render()});root.append(ads);
  const bottom=el('div',undefined,'ad-sticky-savebar');
  const caption=el('span','Зміни застосовуються до Beta після збереження.');
  const controls=el('div',undefined,'ad-toolbar');
  button(controls,'Скасувати зміни',()=>refresh(true),'secondary');
  const save=button(controls,'Зберегти всі зміни',saveDraft,'primary');save.id='betaAdsSaveButton';
  bottom.append(caption,status,controls);root.append(bottom);
  async function saveDraft(){if(loading)return;loading=true;save.disabled=true;status.textContent='Зберігаємо...';
    try{const r=await api('PUT',draft);report=r;draft=structuredClone(r.settings);dirty=false;render();const n=document.getElementById('betaAdsSaveStatus');if(n)n.textContent='Зміни збережено у Beta'}
    catch(e){status.textContent='Помилка: '+e.message;alert('Не вдалося зберегти: '+e.message)}
    finally{loading=false;save.disabled=false}}
 }
 async function refresh(force=false){
  if(loading)return;if(dirty&&force&&!confirm('Відхилити незбережені зміни?'))return;
  loading=true;root.textContent='Завантажуємо рекламний центр...';
  try{report=await api('GET');draft=structuredClone(report.settings);dirty=false;render()}
  catch(e){root.textContent='Не вдалося отримати дані: '+e.message}
  finally{loading=false}
 }
 document.querySelector('[data-admin-tab="ads"]')?.addEventListener('click',()=>{if(!report)refresh()});
 window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});
 document.addEventListener('svitlo:admin-logout',()=>{report=null;draft=null;dirty=false;root.textContent='Увійдіть в адмінпанель, щоб керувати рекламою.'});
})();
