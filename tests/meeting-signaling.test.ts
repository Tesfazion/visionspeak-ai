import assert from "node:assert/strict";
import { test } from "node:test";

const { leaveRoom, pollRoom, postSignal } = await import("@/lib/meeting/signaling");

/**
 * Each test uses its own meeting id: the hub's room map is module-level state,
 * so sharing an id would leak peers between tests.
 */
const roomId = (name: string) => `test-${name}-${Math.random().toString(36).slice(2, 10)}`;

test("a joining peer receives the roster and no backlog", async () => {
  const id = roomId("join");
  const state = await pollRoom(id, {
    since: 0,
    name: "Ada",
    role: "host",
  });
  assert.ok(state.peerId);
  assert.equal(state.peers.length, 1);
  assert.equal(state.peers[0].name, "Ada");
  assert.equal(state.peers[0].role, "host");
  assert.deepEqual(state.events, []);
});

test("the same peer id is stable across polls", async () => {
  const id = roomId("stable");
  const first = await pollRoom(id, { since: 0, name: "Ada", role: "participant" });
  const second = await pollRoom(id, {
    peerId: first.peerId,
    since: 0,
    name: "Ada",
    role: "participant",
  });
  assert.equal(second.peerId, first.peerId);
});

test("chat reaches the other peer but not the sender", async () => {
  const id = roomId("chat");
  const ada = await pollRoom(id, { since: 0, name: "Ada", role: "host" });
  const bob = await pollRoom(id, { since: 0, name: "Bob", role: "participant" });

  assert.equal(postSignal(id, ada.peerId, { type: "chat", text: "hello", at: 1234 }), true);

  const bobNext = await pollRoom(id, {
    peerId: bob.peerId,
    since: bob.seq,
    name: "Bob",
    role: "participant",
  });
  const chat = bobNext.events.find((event) => event.type === "chat");
  assert.ok(chat, "Bob receives the chat");
  assert.equal(chat.type === "chat" && chat.text, "hello");
  assert.equal(chat.type === "chat" && chat.name, "Ada");

  const adaNext = await pollRoom(id, {
    peerId: ada.peerId,
    since: ada.seq,
    name: "Ada",
    role: "host",
  });
  assert.equal(
    adaNext.events.some((event) => event.type === "chat"),
    false,
    "the sender does not receive its own message",
  );
});

test("an offer is delivered only to its target", async () => {
  const id = roomId("offer");
  const ada = await pollRoom(id, { since: 0, name: "Ada", role: "host" });
  const bob = await pollRoom(id, { since: 0, name: "Bob", role: "participant" });
  const cy = await pollRoom(id, { since: 0, name: "Cy", role: "participant" });

  assert.equal(postSignal(id, ada.peerId, { type: "offer", to: bob.peerId, sdp: "v=0" }), true);
  // A broadcast wakes Cy's poll immediately; without it the (correctly) empty
  // result would sit in the 20 s long-poll until timeout.
  postSignal(id, ada.peerId, { type: "chat", text: "ping", at: 2 });

  const bobNext = await pollRoom(id, {
    peerId: bob.peerId,
    since: bob.seq,
    name: "Bob",
    role: "participant",
  });
  assert.ok(bobNext.events.some((event) => event.type === "offer" && event.from === ada.peerId));

  const cyNext = await pollRoom(id, {
    peerId: cy.peerId,
    since: cy.seq,
    name: "Cy",
    role: "participant",
  });
  assert.equal(
    cyNext.events.some((event) => event.type === "offer"),
    false,
    "a third peer never sees someone else's SDP",
  );
});

test("leaving tells the room the peer is gone", async () => {
  const id = roomId("leave");
  const ada = await pollRoom(id, { since: 0, name: "Ada", role: "host" });
  const bob = await pollRoom(id, { since: 0, name: "Bob", role: "participant" });

  // Consume Bob's join event so the next poll only describes the departure.
  const afterJoin = await pollRoom(id, {
    peerId: ada.peerId,
    since: ada.seq,
    name: "Ada",
    role: "host",
  });

  assert.equal(leaveRoom(id, bob.peerId), true);

  const afterLeave = await pollRoom(id, {
    peerId: ada.peerId,
    since: afterJoin.seq,
    name: "Ada",
    role: "host",
  });
  const left = afterLeave.events.find((event) => event.type === "peer_left");
  assert.ok(left);
  assert.equal(left.type === "peer_left" && left.peerId, bob.peerId);
  assert.deepEqual(
    afterLeave.peers.map((p) => p.name),
    ["Ada"],
  );
});

test("a post into an unknown room is rejected", () => {
  assert.equal(
    postSignal(roomId("missing"), "p_nobody", { type: "chat", text: "hi", at: 1 }),
    false,
  );
});
