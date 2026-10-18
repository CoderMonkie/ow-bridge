import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Conversations } from '../src/conversations.js';

const user = content => ({ role: 'user', content });
const assistant = content => ({ role: 'assistant', content });
const request = (messages, extra = {}) => ({ conversationKey: 'one', model: { id: 'opencode/a' }, system: 'rules', tools: [], text: JSON.stringify(messages), ...extra });
function fixture() {
  let sequence = 0;
  const discarded = [], leases = [];
  const pool = new Conversations(async id => discarded.push(id));
  const complete = async lease => {
    lease.session ||= { id: `session-${++sequence}` };
    leases.push(structuredClone(lease));
    lease.reusable = true;
    return { choices: [{ message: assistant('answer') }] };
  };
  return { pool, complete, discarded, leases };
}
test('explicit conversation continues with only new messages and cleans up on close', async () => {
  const f = fixture();
  await f.pool.run(request([user('first')]), undefined, f.complete);
  await f.pool.run(request([user('first'), assistant('answer'), user('second')]), undefined, f.complete);
  assert.equal(f.leases[1].session.id, f.leases[0].session.id);
  assert.deepEqual(JSON.parse(f.leases[1].text), [user('second')]);
  assert.deepEqual(f.discarded, []);
  await f.pool.close(); assert.deepEqual(f.discarded, ['session-1']);
});
test('different conversations, edited history, changed declarations and regeneration stay isolated', async () => {
  const f = fixture(); const first = request([user('first')]);
  await f.pool.run(first, undefined, f.complete);
  await f.pool.run({ ...first, conversationKey: 'two' }, undefined, f.complete);
  assert.notEqual(f.leases[0].session.id, f.leases[1].session.id);
  await f.pool.run(first, undefined, f.complete); // Same input can be an intentional regenerate.
  assert.notEqual(f.leases[0].session.id, f.leases[2].session.id);
  await f.pool.run(request([user('edited'), assistant('answer'), user('next')]), undefined, f.complete);
  assert.equal(JSON.parse(f.leases[3].text).length, 3);
  await f.pool.run(request([user('edited'), assistant('answer'), user('next'), assistant('answer'), user('last')], { tools: ['changed'] }), undefined, f.complete);
  assert.equal(JSON.parse(f.leases[4].text).length, 5);
  assert.equal(f.discarded.length, 3);
  await f.pool.close(); assert.equal(f.discarded.length, 5);
});
test('tool IDs are supplied with incremental results; JSON property ordering is irrelevant', async () => {
  const f = fixture();
  const reply = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'Read', arguments: '{"file_path":"/a"}' } }] };
  await f.pool.run(request([user('first')]), undefined, async lease => {
    await f.complete(lease); return { choices: [{ message: reply }] };
  });
  const toolResult = { role: 'tool', content: 'file content', tool_call_id: 'call_1' };
  await f.pool.run(request([{ content: 'first', role: 'user' }, { ...reply, content: '' }, toolResult]), undefined, f.complete);
  assert.equal(f.leases[1].session.id, 'session-1');
  assert.deepEqual(f.leases[1].toolCalls, reply.tool_calls);
  assert.deepEqual(JSON.parse(f.leases[1].text), [toolResult]);
  await f.pool.close();
});
test('continuation sends only new images and changed prior image resets the session', async () => {
  const f = fixture(); const old = { filename: 'message-1-image-1.png', url: 'old' }, next = { filename: 'message-3-image-1.png', url: 'next' };
  await f.pool.run(request([user('picture')], { images: [old] }), undefined, f.complete);
  const messages = [user('picture'), assistant('answer'), user('new picture')];
  await f.pool.run(request(messages, { images: [old, next] }), undefined, f.complete);
  assert.deepEqual(f.leases[1].images, [next]);
  await f.pool.run(request([...messages, assistant('answer'), user('continue')], { images: [{ ...old, url: 'changed' }, next] }), undefined, f.complete);
  assert.notEqual(f.leases[2].session.id, f.leases[1].session.id);
  await f.pool.close();
});
test('same conversation serializes requests and skips canceled queued work', async () => {
  const f = fixture(); let release;
  const first = f.pool.run(request([user('first')]), undefined, async lease => {
    await new Promise(resolve => { release = resolve; }); return f.complete(lease);
  });
  await new Promise(resolve => setImmediate(resolve));
  const controller = new AbortController();
  const canceled = f.pool.run(request([user('cancel')]), controller.signal, f.complete);
  const second = f.pool.run(request([user('first'), assistant('answer'), user('next')]), undefined, f.complete);
  controller.abort(); await assert.rejects(canceled);
  release(); await first; await second;
  assert.equal(f.leases.length, 2);
  assert.equal(f.leases[1].session.id, 'session-1');
  await f.pool.close();
});
test('failed/non-reusable completion is never reused; closing during completion discards the session', async () => {
  const f = fixture();
  await assert.rejects(f.pool.run(request([user('first')]), undefined, async () => { throw Error('upstream'); }));
  await f.pool.run(request([user('first')]), undefined, async lease => {
    const result = await f.complete(lease); lease.reusable = false; return result;
  });
  await f.pool.run(request([user('first'), assistant('answer'), user('next')]), undefined, async lease => {
    const result = await f.complete(lease); await f.pool.close(); return result;
  });
  assert.equal(f.leases[1].session.id, 'session-2');
  assert.deepEqual(f.discarded, ['session-2']);
  await assert.rejects(f.pool.run(request([]), undefined, f.complete), /stopping/);
});
