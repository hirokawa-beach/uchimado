export function appendPoint(path:number[],node:number):number[]{
  if(path.includes(node)||!Number.isInteger(node)||node<0||node>8)return path
  const result=[...path],last=result.at(-1)
  if(last!==undefined){
    const dx=Math.abs(node%3-last%3),dy=Math.abs(Math.floor(node/3)-Math.floor(last/3))
    if((dx===2&&dy===0)||(dx===0&&dy===2)||(dx===2&&dy===2)){
      const middle=(last+node)/2;if(!result.includes(middle))result.push(middle)
    }
  }
  return [...result,node]
}
export function crossedPoints(from:{x:number;y:number},to:{x:number;y:number},radius=26):number[]{
  const dx=to.x-from.x,dy=to.y-from.y,length=dx*dx+dy*dy
  return Array.from({length:9},(_,node)=>{
    const x=(node%3)*100+50,y=Math.floor(node/3)*100+50
    const t=length?Math.max(0,Math.min(1,((x-from.x)*dx+(y-from.y)*dy)/length)):0
    return {node,t,distance:Math.hypot(x-(from.x+t*dx),y-(from.y+t*dy))}
  }).filter(p=>p.distance<=radius).sort((a,b)=>a.t-b.t).map(p=>p.node)
}
