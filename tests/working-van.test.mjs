import test from 'node:test'
import assert from 'node:assert/strict'
import {resolveWorkingVanId} from '../lib/working-van.ts'

const authorised=['van3','van4']

test('saved working van takes priority over the assigned default on every page',()=>{
  assert.equal(resolveWorkingVanId(authorised,undefined,'van4','van3'),'van4')
})

test('explicitly requested authorised van takes priority over the saved choice',()=>{
  assert.equal(resolveWorkingVanId(authorised,'van3','van4','van3'),'van3')
})

test('tampered URL cannot select an unauthorised van',()=>{
  assert.throws(()=>resolveWorkingVanId(authorised,'van9','van4','van3'),/not authorised/)
})

test('stale saved selection falls back only to an authorised default',()=>{
  assert.equal(resolveWorkingVanId(authorised,undefined,'van9','van3'),'van3')
  assert.equal(resolveWorkingVanId(authorised,undefined,'van9','van9'),null)
})

test('no default van requires an explicit technician choice',()=>{
  assert.equal(resolveWorkingVanId(authorised,undefined,null,null),null)
  assert.equal(resolveWorkingVanId([],undefined,'van4','van3'),null)
})
