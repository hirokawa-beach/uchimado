import test from 'node:test'
import assert from 'node:assert/strict'
import {appendPoint,crossedPoints} from '../src/pattern.ts'

test('bridge intermediate points and never repeat visited dots',()=>{
 assert.deepEqual(appendPoint([0],2),[0,1,2])
 assert.deepEqual(appendPoint([0,1,2],8),[0,1,2,5,8])
 assert.deepEqual(appendPoint([0,1,2],1),[0,1,2])
 assert.deepEqual(appendPoint([0],8),[0,4,8])
 assert.deepEqual(appendPoint([1],8),[1,8])
})
test('fast pointer movement finds crossed dots in their traversal order',()=>{
 assert.deepEqual(crossedPoints({x:50,y:50},{x:250,y:50}),[0,1,2])
 assert.deepEqual(crossedPoints({x:250,y:250},{x:50,y:50}),[8,4,0])
 assert.deepEqual(crossedPoints({x:0,y:0},{x:0,y:0}),[])
})
