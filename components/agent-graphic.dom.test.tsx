// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { AgentGraphic } from "./agent-graphic";

afterEach(() => cleanup());

describe("AgentGraphic presence", () => {
  it.each(["working", "waiting", "idle"] as const)(
    "keeps a %s agent awake",
    (status) => {
      const { container } = render(<AgentGraphic name="Ada" status={status} />);
      expect(container.querySelector("svg")).toHaveAttribute("data-agent-state", "awake");
    },
  );

  it("shows a sleeping expression when an agent is offline", () => {
    const { container } = render(<AgentGraphic name="Ada" status="offline" />);
    const avatar = container.querySelector("svg");

    expect(avatar).toHaveAttribute("data-agent-state", "sleeping");
    expect(avatar?.querySelectorAll("circle")).toHaveLength(1);
    expect(avatar?.querySelector('path[d^="m29.5 10"]')).not.toBeNull();
  });
});
