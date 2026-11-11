import {cssNames} from './cssNames'
import touchTextStyles from './TouchText.module.css'
import {useState} from 'react'
const localStyles = {...touchTextStyles}

export function editText(text:string,start:number,end:number,key:string) {
  const voice: Record<string,string> = {'か':'が','き':'ぎ','く':'ぐ','け':'げ','こ':'ご','さ':'ざ','し':'じ','す':'ず','せ':'ぜ','そ':'ぞ','た':'だ','ち':'ぢ','つ':'づ','て':'で','と':'ど','は':'ば','ひ':'び','ふ':'ぶ','へ':'べ','ほ':'ぼ','ば':'ぱ','び':'ぴ','ぶ':'ぷ','べ':'ぺ','ぼ':'ぽ','あ':'ぁ','い':'ぃ','う':'ぅ','え':'ぇ','お':'ぉ','や':'ゃ','ゆ':'ゅ','よ':'ょ','づ':'っ'}
  if(key==='⌫'){if(start!==end)return{text:text.slice(0,start)+text.slice(end),cursor:start};const at=Math.max(0,start-1);return{text:text.slice(0,at)+text.slice(end),cursor:at}}
  if(key==='゛小'){const prev=text[start-1];return{text:text.slice(0,Math.max(0,start-1))+(voice[prev]||prev||'')+text.slice(end),cursor:start}}
  const char=key==='空白'?' ':key==='改行'?'\n':key
  return {text:text.slice(0,start)+char+text.slice(end),cursor:start+char.length}
}
export function TouchKeyboard({onKey}:{onKey:(key:string)=>void}) {
  const [mode,setMode]=useState<'kana'|'abc'>('kana'),[page,setPage]=useState(0)
  const letters=[...(mode==='kana'?'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよわをらりるれろんー、。！':'1234567890qwertyuiopasdfghjklzxcvbnm.,!?ABCDEFGHIJKLMNOPQRSTUVWXYZ-@_/:')]
  const pages=Math.ceil(letters.length/15)
  return <div className={cssNames(localStyles, "touch-keyboard")} aria-label="画面キーボード"><div className={cssNames(localStyles, "keyboard-mode")}><button type="button" onPointerDown={e=>e.preventDefault()} onClick={()=>{setMode(p=>p==='kana'?'abc':'kana');setPage(0)}}>{mode==='kana'?'英数に切替':'かなに切替'}</button><button type="button" aria-label="前のキー" onPointerDown={e=>e.preventDefault()} onClick={()=>setPage((page+pages-1)%pages)}>←</button><span>{page+1} / {pages}</span><button type="button" aria-label="次のキー" onPointerDown={e=>e.preventDefault()} onClick={()=>setPage((page+1)%pages)}>→</button></div><div className={cssNames(localStyles, "keyboard-letters")}>{letters.slice(page*15,page*15+15).map(k=><button type="button" key={k} onPointerDown={e=>e.preventDefault()} onClick={()=>onKey(k)}>{k}</button>)}</div><div className={cssNames(localStyles, "key-row")}>{['゛小','空白','改行','⌫'].map(k=><button type="button" key={k} aria-label={k==='⌫'?'1文字削除':k} onPointerDown={e=>e.preventDefault()} onClick={()=>onKey(k)}>{k}</button>)}</div><small>漢字変換には「端末のキーボード」を使えます。</small></div>
}
