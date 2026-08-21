import { describe, expect, it } from "vitest";
import { createListenSession } from "../listen-session";

describe("createListenSession", () => {
  it("drops every sample while unarmed", () => {
    const session = createListenSession();

    session.sample(30);
    session.sample(60);

    expect(session.seconds()).toBe(0);
  });

  it("credits positive deltas between samples once armed", () => {
    const session = createListenSession();
    session.arm();

    session.sample(5);
    session.sample(12.5);

    expect(session.seconds()).toBe(12.5);
  });

  it("sparse samples lose no time — deltas come from the position, not ticks", () => {
    const session = createListenSession();
    session.arm();

    // Three minutes of throttled silence between two samples.
    session.sample(10);
    session.sample(190);

    expect(session.seconds()).toBe(190);
  });

  it("rebase moves the cursor without crediting the jump", () => {
    const session = createListenSession();
    session.arm();
    session.sample(10);

    session.rebase(120);
    session.sample(125);

    expect(session.seconds()).toBe(15);
  });

  it("a backward jump credits nothing but replay after it counts", () => {
    const session = createListenSession();
    session.arm();
    session.sample(100);

    session.sample(20);
    session.sample(30);

    expect(session.seconds()).toBe(110);
  });

  it("rebase arms an unarmed session", () => {
    const session = createListenSession();

    session.rebase(40);
    session.sample(45);

    expect(session.seconds()).toBe(5);
  });

  it("reset clears seconds and disarms", () => {
    const session = createListenSession();
    session.arm();
    session.sample(10);

    session.reset();
    session.sample(50);

    expect(session.seconds()).toBe(0);
  });

  it("ignores non-finite positions", () => {
    const session = createListenSession();
    session.arm();
    session.sample(10);

    session.sample(Number.NaN);
    session.sample(Number.POSITIVE_INFINITY);
    session.rebase(Number.NaN);
    session.sample(15);

    expect(session.seconds()).toBe(15);
  });
});
