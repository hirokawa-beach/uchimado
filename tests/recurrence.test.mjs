import test from 'node:test'
import assert from 'node:assert/strict'
import {matches,occurrenceOn} from '../src/recurrence.ts'

test('weekly recurrence respects start, interval and inclusive end',()=>{
 const repeat={frequency:'weekly',interval:2,until:'2026-11-29'}
 assert.equal(matches('2026-11-01','2026-10-18',repeat),false)
 assert.equal(matches('2026-11-01','2026-11-08',repeat),false)
 assert.equal(matches('2026-11-01','2026-11-15',repeat),true)
 assert.equal(matches('2026-11-01','2026-11-29',repeat),true)
 assert.equal(matches('2026-11-01','2026-12-13',repeat),false)
})
test('month-end and leap-year recurrences skip missing calendar dates',()=>{
 assert.equal(matches('2026-01-31','2026-02-28',{frequency:'monthly',interval:1,until:null}),false)
 assert.equal(matches('2026-01-31','2026-03-31',{frequency:'monthly',interval:1,until:null}),true)
 assert.equal(matches('2024-02-29','2028-02-29',{frequency:'yearly',interval:1,until:null}),true)
})
test('moved and cancelled single occurrences suppress their original dates',()=>{
 const series={id:'s',date:'2026-11-08',endDate:'2026-11-09',title:'series',recurrence:{frequency:'weekly',interval:1,until:null},exceptions:{'2026-11-15':{date:'2026-11-17',endDate:'2026-11-18',title:'moved'},'2026-11-22':null}}
 assert.equal(occurrenceOn(series,'2026-11-15').length,0)
 assert.equal(occurrenceOn(series,'2026-11-17')[0].title,'moved')
 assert.equal(occurrenceOn(series,'2026-11-18')[0].occurrenceDate,'2026-11-15')
 assert.equal(occurrenceOn(series,'2026-11-22').length,0)
 assert.equal(occurrenceOn(series,'2026-11-30')[0].date,'2026-11-29')
})
