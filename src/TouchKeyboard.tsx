import {useState} from 'react'
export function editText(text:string,start:number,end:number,key:string) {
  const voice: Record<string,string> = {'か':'が','き':'ぎ','く':'ぐ','け':'げ','こ':'ご','さ':'ざ','し':'じ','す':'ず','せ':'ぜ','そ':'ぞ','た':'だ','ち':'ぢ','つ':'づ','て':'で','と':'ど','は':'ば','ひ':'び','ふ':'ぶ','へ':'べ','ほ':'ぼ','ば':'ぱ','び':'ぴ','ぶ':'ぷ','べ':'ぺ','ぼ':'ぽ','あ':'ぁ','い':'ぃ','う':'ぅ','え':'ぇ','お':'ぉ','や':'ゃ','ゆ':'ゅ','よ':'ょ','づ':'っ'}
  if(key==='⌫'){if(start!==end)return{text:text.slice(0,start)+text.slice(end),cursor:start};const at=Math.max(0,start-1);return{text:text.slice(0,at)+text.slice(end),cursor:at}}
  if(key==='゛小'){const prev=text[start-1];return{text:text.slice(0,Math.max(0,start-1))+(voice[prev]||prev||'')+text.slice(end),cursor:start}}
  const char=key==='空白'?' ':key==='改行'?'\n':key
  return {text:text.slice(0,start)+char+text.slice(end),cursor:start+char.length}
}
export function TouchKeyboard({onKey}:{onKey:(key:string)=>void}) {
  const [mode,setMode]=useState<'kana'|'abc'>('kana')
  const rows=mode==='kana'?['あいうえおかきくけこ','さしすせそたちつてと','なにぬねのはひふへほ','まみむめもやゆよわを','らりるれろんー、。！']:['1234567890','qwertyuiop','asdfghjkl','zxcvbnm.,!?']
  return <div className="touch-keyboard" aria-label="画面キーボード"><div className="keyboard-mode"><span>タッチで文字を入力</span><button type="button" onClick={()=>setMode(p=>p==='kana'?'abc':'kana')}>{mode==='kana'?'英数に切替':'かなに切替'}</button></div>{rows.map((r,i)=><div className="key-row" key={i}>{[...r].map(k=><button type="button" key={k} onPointerDown={e=>e.preventDefault()} onClick={()=>onKey(k)}>{k}</button>)}</div>)}<div className="key-row"><button type="button" onPointerDown={e=>e.preventDefault()} onClick={()=>onKey('゛小')}>゛小</button><button type="button" className="space-key" onPointerDown={e=>e.preventDefault()} onClick={()=>onKey('空白')}>空白</button><button type="button" onPointerDown={e=>e.preventDefault()} onClick={()=>onKey('改行')}>改行</button><button type="button" aria-label="1文字削除" onPointerDown={e=>e.preventDefault()} onClick={()=>onKey('⌫')}>⌫</button></div><small>ひらがなを直接入力できます。漢字変換は端末の日本語キーボードをご利用ください。</small></div>
}
